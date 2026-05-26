import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role === 'viewer') return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });

  const form = await req.formData();
  const file = form.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided.' }, { status: 400 });

  const maxSize = 10 * 1024 * 1024; // 10MB
  if (file.size > maxSize) return NextResponse.json({ error: 'File too large (max 10MB).' }, { status: 400 });

  const ext  = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `logs/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

  const bytes  = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  const { error } = await supabase.storage
    .from('site-photos')
    .upload(path, buffer, { contentType: file.type, upsert: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: { publicUrl } } = supabase.storage.from('site-photos').getPublicUrl(path);
  return NextResponse.json({ url: publicUrl });
}
