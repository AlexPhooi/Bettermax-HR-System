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

  if (body.stage_name !== undefined)    update.stage_name = body.stage_name?.trim();
  if (body.sequence_order !== undefined) update.sequence_order = Number(body.sequence_order);
  if (body.percentage !== undefined)    update.percentage = body.percentage ? Number(body.percentage) : null;
  if (body.amount !== undefined)        update.amount = body.amount ? Number(body.amount) : null;
  if (body.due_date !== undefined)      update.due_date = body.due_date || null;
  if (body.invoiced_date !== undefined) update.invoiced_date = body.invoiced_date || null;
  if (body.received_date !== undefined) update.received_date = body.received_date || null;
  if (body.status !== undefined)        update.status = body.status;
  if (body.notes !== undefined)         update.notes = body.notes?.trim() || null;

  const { data, error } = await supabase.from('project_payment_stages')
    .update(update).eq('id', params.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isManager(user.role)) return NextResponse.json({ error: 'Admin/Owner only.' }, { status: 403 });

  const { error } = await supabase.from('project_payment_stages').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
