import { NextRequest, NextResponse } from 'next/server';
import { getUser, isManager } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const project_id = req.nextUrl.searchParams.get('project_id');
  if (!project_id) return NextResponse.json({ error: 'project_id required.' }, { status: 400 });

  const { data, error } = await supabase.from('project_milestones')
    .select('*').eq('project_id', project_id).order('sequence_order');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isManager(user.role)) return NextResponse.json({ error: 'Admin/Owner only.' }, { status: 403 });

  const body = await req.json();
  if (!body.project_id) return NextResponse.json({ error: 'project_id required.' }, { status: 400 });
  if (!body.name?.trim()) return NextResponse.json({ error: 'Milestone name required.' }, { status: 400 });

  // Get max sequence_order for this project
  const { data: existing } = await supabase.from('project_milestones')
    .select('sequence_order').eq('project_id', body.project_id)
    .order('sequence_order', { ascending: false }).limit(1);
  const nextOrder = existing?.length ? Number(existing[0].sequence_order) + 1 : 1;

  const { data, error } = await supabase.from('project_milestones').insert({
    project_id:     body.project_id,
    name:           body.name.trim(),
    sequence_order: body.sequence_order ?? nextOrder,
    planned_start:  body.planned_start || null,
    planned_end:    body.planned_end   || null,
    actual_start:   body.actual_start  || null,
    actual_end:     body.actual_end    || null,
    status:         body.status || 'pending',
    notes:          body.notes?.trim() || null,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
