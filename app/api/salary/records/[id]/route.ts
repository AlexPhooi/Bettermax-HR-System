import { NextRequest, NextResponse } from 'next/server';
import { getUser, isManager } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

// PATCH: update salary record (e.g. payment_slip_url)
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isManager(user.role)) return NextResponse.json({ error: 'Admin/Owner only.' }, { status: 403 });

  const body = await req.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: Record<string, any> = {};
  if (body.payment_slip_url !== undefined) updates.payment_slip_url = body.payment_slip_url;
  if (body.status          !== undefined) updates.status          = body.status;
  if (body.total_days      !== undefined) updates.total_days      = Number(body.total_days);
  if (body.daily_rate      !== undefined) updates.daily_rate      = Number(body.daily_rate);
  if (body.total_advances  !== undefined) updates.total_advances  = Number(body.total_advances);
  if (body.gross_salary    !== undefined) updates.gross_salary    = Number(body.gross_salary);
  if (body.net_salary      !== undefined) updates.net_salary      = Number(body.net_salary);
  if (body.carry_forward_out !== undefined) updates.carry_forward_out = Number(body.carry_forward_out);

  if (!Object.keys(updates).length) return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });

  const { data, error } = await supabase.from('salary_records')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE: soft-delete salary record — sends to Bin
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isManager(user.role)) return NextResponse.json({ error: 'Admin/Owner only.' }, { status: 403 });

  const { error } = await supabase.from('salary_records')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
