import { NextRequest, NextResponse } from 'next/server';
import { getUser, isManager } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

// PATCH: edit an advance record (admin/owner only)
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isManager(user.role)) return NextResponse.json({ error: 'Admin/Owner only.' }, { status: 403 });

  const body = await req.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: Record<string, any> = {};

  if (body.amount !== undefined) {
    if (Number(body.amount) <= 0) return NextResponse.json({ error: 'Amount must be positive.' }, { status: 400 });
    updates.amount = Number(body.amount);
  }
  if (body.advance_date !== undefined) updates.advance_date  = body.advance_date  || null;
  if (body.month        !== undefined) updates.month         = body.month          || null;
  if (body.detail_type  !== undefined) updates.detail_type   = body.detail_type    || null;
  if (body.notes        !== undefined) updates.notes         = body.notes?.trim()  || null;
  if (body.pay_by       !== undefined) updates.pay_by        = body.pay_by         || 'cash';
  if (body.bank_name    !== undefined) updates.bank_name     = body.bank_name?.trim()    || null;
  if (body.account_name !== undefined) updates.account_name  = body.account_name?.trim() || null;
  if (body.account_no   !== undefined) updates.account_no    = body.account_no?.trim()   || null;

  if (!Object.keys(updates).length)
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });

  const { data, error } = await supabase.from('advances')
    .update(updates).eq('id', params.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE: remove an advance record (admin/owner only)
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isManager(user.role)) return NextResponse.json({ error: 'Admin/Owner only.' }, { status: 403 });
  const { error } = await supabase.from('advances').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
