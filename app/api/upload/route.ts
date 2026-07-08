import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import sharp from 'sharp';

// Photo types that just return a URL without DB auto-update
const URL_ONLY_TYPES = ['check_in_photo', 'check_out_photo', 'site_front', 'site_back', 'site_store', 'avatar'];

export async function POST(req: NextRequest) {
  if (!await getUser(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const form        = await req.formData();
  const file        = form.get('file') as File | null;
  const docType     = form.get('type') as string;
  const employee_id = form.get('employee_id') as string | null;
  const record_id   = form.get('record_id')   as string | null;
  const label       = form.get('label')       as string | null; // front/back/store for site photos

  if (!file) return NextResponse.json({ error: 'No file provided.' }, { status: 400 });

  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];
  if (!allowed.includes(file.type))
    return NextResponse.json({ error: 'Only JPG, PNG, WEBP, HEIC or PDF allowed.' }, { status: 400 });
  if (file.size > 10 * 1024 * 1024)
    return NextResponse.json({ error: 'File must be under 10 MB.' }, { status: 400 });

  const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
  const ts  = Date.now();
  let path: string;

  if (URL_ONLY_TYPES.includes(docType)) {
    // Group / site / avatar photos — just upload, return URL
    if (docType === 'avatar' && employee_id) {
      path = `${employee_id}/avatar_${ts}.${ext}`;
    } else if (docType.startsWith('site') && label) {
      path = `attendance/site/${label}_${ts}.${ext}`;
    } else {
      path = `attendance/${docType}_${ts}.${ext}`;
    }
  } else if (docType === 'attendance' && record_id) {
    // Legacy: single attendance photo linked to a record
    path = `attendance/${record_id}_${ts}.${ext}`;
  } else if (docType === 'passport' || docType === 'permit') {
    if (!employee_id) return NextResponse.json({ error: 'employee_id required.' }, { status: 400 });
    path = `${employee_id}/${docType}_${ts}.${ext}`;
  } else {
    path = `misc/${docType}_${ts}.${ext}`;
  }

  const bytes     = await file.arrayBuffer();
  const rawBuffer = Buffer.from(bytes);

  // Compress images to JPEG (max 1400px, quality 82) — PDFs are passed through unchanged
  const isImage = file.type.startsWith('image/');
  let buffer: Buffer;
  let thumbBuffer: Buffer | null = null;
  let uploadContentType: string;
  if (isImage) {
    const oriented = sharp(rawBuffer).rotate(); // auto-orient from EXIF
    const orientedBuffer = await oriented.toBuffer();
    buffer = await sharp(orientedBuffer)
      .resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    // Small thumbnail for list/grid views — full-size only loads on click-through
    thumbBuffer = await sharp(orientedBuffer)
      .resize({ width: 200, height: 200, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 70, mozjpeg: true })
      .toBuffer();
    uploadContentType = 'image/jpeg';
    // Update path extension to .jpg for compressed images
    path = path.replace(/\.[^.]+$/, '.jpg');
  } else {
    buffer = rawBuffer;
    uploadContentType = file.type;
  }

  const thumbPath = thumbBuffer ? path.replace(/\.jpg$/, '_thumb.jpg') : null;

  const uploads = [
    supabase.storage.from('hr-documents')
      .upload(path, buffer, { contentType: uploadContentType, upsert: true, cacheControl: '31536000' }),
  ];
  if (thumbBuffer && thumbPath) {
    uploads.push(
      supabase.storage.from('hr-documents')
        .upload(thumbPath, thumbBuffer, { contentType: 'image/jpeg', upsert: true, cacheControl: '31536000' })
    );
  }
  const [{ error: upErr }, thumbResult] = await Promise.all(uploads);

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  if (thumbResult?.error) return NextResponse.json({ error: thumbResult.error.message }, { status: 500 });

  const { data: { publicUrl } } = supabase.storage.from('hr-documents').getPublicUrl(path);
  const thumbUrl = thumbPath
    ? supabase.storage.from('hr-documents').getPublicUrl(thumbPath).data.publicUrl
    : null;

  // Auto-update DB for types that link to a specific record
  if (docType === 'passport' && employee_id) {
    await supabase.from('employees').update({ passport_doc_url: publicUrl }).eq('id', employee_id);
  } else if (docType === 'permit' && employee_id) {
    await supabase.from('employees').update({ permit_doc_url: publicUrl }).eq('id', employee_id);
  } else if (docType === 'avatar' && employee_id) {
    await supabase.from('employees').update({ avatar_url: publicUrl }).eq('id', employee_id);
  } else if (docType === 'attendance' && record_id) {
    await supabase.from('hr_attendance').update({ photo_url: publicUrl }).eq('id', record_id);
  }

  return NextResponse.json({ url: publicUrl, thumb_url: thumbUrl });
}
