import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  if (!await getUser(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const form = await req.formData();
  const file        = form.get('file') as File | null;
  const docType     = form.get('type') as string;   // 'passport' | 'permit'
  const employee_id = form.get('employee_id') as string;

  if (!file)        return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
  if (!employee_id) return NextResponse.json({ error: 'employee_id is required.' }, { status: 400 });

  const allowed = ['image/jpeg','image/png','image/webp','image/heic','application/pdf'];
  if (!allowed.includes(file.type))
    return NextResponse.json({ error: 'Only JPG, PNG, WEBP, HEIC or PDF allowed.' }, { status: 400 });

  if (file.size > 10 * 1024 * 1024)
    return NextResponse.json({ error: 'File must be under 10 MB.' }, { status: 400 });

  const ext  = file.name.split('.').pop()?.toLowerCase() || 'bin';
  const path = `${employee_id}/${docType}_${Date.now()}.${ext}`;

  const bytes  = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  const { error: upErr } = await supabase.storage
    .from('hr-documents')
    .upload(path, buffer, { contentType: file.type, upsert: true });

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data: { publicUrl } } = supabase.storage
    .from('hr-documents')
    .getPublicUrl(path);

  // Persist the URL on the employee row
  const col = docType === 'passport' ? 'passport_doc_url' : 'permit_doc_url';
  await supabase.from('employees').update({ [col]: publicUrl }).eq('id', employee_id);

  return NextResponse.json({ url: publicUrl });
}
