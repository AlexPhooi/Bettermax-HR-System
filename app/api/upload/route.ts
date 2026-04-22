import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  if (!await getUser(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const form        = await req.formData();
  const file        = form.get('file') as File | null;
  const docType     = form.get('type') as string;   // 'passport' | 'permit' | 'attendance'
  const employee_id = form.get('employee_id') as string | null;
  const record_id   = form.get('record_id')   as string | null;  // attendance record id

  if (!file) return NextResponse.json({ error: 'No file provided.' }, { status: 400 });

  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];
  if (!allowed.includes(file.type))
    return NextResponse.json({ error: 'Only JPG, PNG, WEBP, HEIC or PDF allowed.' }, { status: 400 });
  if (file.size > 10 * 1024 * 1024)
    return NextResponse.json({ error: 'File must be under 10 MB.' }, { status: 400 });

  const ext  = file.name.split('.').pop()?.toLowerCase() || 'bin';
  let path: string;

  if (docType === 'attendance') {
    path = `attendance/${record_id || 'tmp'}_${Date.now()}.${ext}`;
  } else {
    if (!employee_id) return NextResponse.json({ error: 'employee_id is required.' }, { status: 400 });
    path = `${employee_id}/${docType}_${Date.now()}.${ext}`;
  }

  const bytes  = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  const { error: upErr } = await supabase.storage
    .from('hr-documents')
    .upload(path, buffer, { contentType: file.type, upsert: true });

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data: { publicUrl } } = supabase.storage.from('hr-documents').getPublicUrl(path);

  // Persist URL on the appropriate row
  if (docType === 'passport' && employee_id) {
    await supabase.from('employees').update({ passport_doc_url: publicUrl }).eq('id', employee_id);
  } else if (docType === 'permit' && employee_id) {
    await supabase.from('employees').update({ permit_doc_url: publicUrl }).eq('id', employee_id);
  } else if (docType === 'attendance' && record_id) {
    await supabase.from('hr_attendance').update({ photo_url: publicUrl }).eq('id', record_id);
  }

  return NextResponse.json({ url: publicUrl });
}
