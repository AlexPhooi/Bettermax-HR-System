import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await getUser(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  if (!body.name?.trim()) return NextResponse.json({ error: 'Project name is required.' }, { status: 400 });
  const { data, error } = await supabase.from('projects').update({
    name: body.name.trim(), code: body.code?.trim() || null,
    location: body.location?.trim() || null,
    maps_url: body.maps_url?.trim() || null,
    waze_url: body.waze_url?.trim() || null,
    status: body.status === 'completed' ? 'completed' : 'active',
  }).eq('id', params.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
