import { NextRequest, NextResponse } from 'next/server';
import { getUser, isManager } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isManager(user.role) && user.role !== 'editor')
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });

  const body = await req.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: Record<string, any> = { updated_at: new Date().toISOString() };

  if (body.name !== undefined)           update.name = body.name?.trim();
  if (body.status !== undefined)         update.status = body.status;
  if (body.planned_start !== undefined)  update.planned_start = body.planned_start || null;
  if (body.planned_end !== undefined)    update.planned_end = body.planned_end || null;
  if (body.actual_start !== undefined)   update.actual_start = body.actual_start || null;
  if (body.actual_end !== undefined)     update.actual_end = body.actual_end || null;
  if (body.sequence_order !== undefined) update.sequence_order = Number(body.sequence_order);
  if (body.notes !== undefined)          update.notes = body.notes?.trim() || null;

  const { data, error } = await supabase.from('project_milestones')
    .update(update).eq('id', params.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isManager(user.role)) return NextResponse.json({ error: 'Admin/Owner only.' }, { status: 403 });

  const { error } = await supabase.from('project_milestones').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
