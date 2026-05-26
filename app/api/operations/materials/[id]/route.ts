import { NextRequest, NextResponse } from 'next/server';
import { getUser, isManager } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isManager(user.role)) return NextResponse.json({ error: 'Admin/Owner only.' }, { status: 403 });

  const body = await req.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: Record<string, any> = {};

  if (body.material_name !== undefined)       update.material_name = body.material_name?.trim();
  if (body.unit !== undefined)                update.unit = body.unit?.trim() || null;
  if (body.quantity !== undefined)            update.quantity = Number(body.quantity);
  if (body.estimated_unit_cost !== undefined) update.estimated_unit_cost = Number(body.estimated_unit_cost);
  if (body.estimated_total_cost !== undefined) update.estimated_total_cost = Number(body.estimated_total_cost);
  if (body.actual_total_cost !== undefined)   update.actual_total_cost = Number(body.actual_total_cost);
  if (body.required_by_date !== undefined)    update.required_by_date = body.required_by_date || null;
  if (body.order_by_date !== undefined)       update.order_by_date = body.order_by_date || null;
  if (body.ordered_date !== undefined)        update.ordered_date = body.ordered_date || null;
  if (body.received_date !== undefined)       update.received_date = body.received_date || null;
  if (body.supplier !== undefined)            update.supplier = body.supplier?.trim() || null;
  if (body.status !== undefined)              update.status = body.status;
  if (body.milestone_id !== undefined)        update.milestone_id = body.milestone_id || null;
  if (body.notes !== undefined)               update.notes = body.notes?.trim() || null;

  const { data, error } = await supabase.from('project_material_schedule')
    .update(update).eq('id', params.id).select('*, project_milestones(name)').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isManager(user.role)) return NextResponse.json({ error: 'Admin/Owner only.' }, { status: 403 });

  const { error } = await supabase.from('project_material_schedule').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
