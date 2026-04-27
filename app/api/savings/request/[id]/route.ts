// PATCH /api/savings/request/[id]
// Admin/Owner: approve or reject a withdrawal request.
// On approve → creates a debit entry in savings, updates employee balance.
import { NextRequest, NextResponse } from 'next/server';
import { getUser, isManager } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

const REASON_LABEL: Record<string, string> = {
  permit:    'Permit Renewal',
  flight:    'Flight Home',
  emergency: 'Emergency',
  others:    'Withdrawal',
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isManager(user.role)) return NextResponse.json({ error: 'Admin/Owner only.' }, { status: 403 });

  const body = await req.json();
  const { action, rejection_note } = body;

  if (!['approve', 'reject'].includes(action))
    return NextResponse.json({ error: 'action must be approve or reject.' }, { status: 400 });

  // Fetch the request (must be pending)
  const { data: request, error: fetchErr } = await supabase
    .from('savings_requests')
    .select('*')
    .eq('id', params.id)
    .eq('status', 'pending')
    .single();

  if (fetchErr || !request)
    return NextResponse.json({ error: 'Request not found or already processed.' }, { status: 404 });

  const now = new Date().toISOString();

  // ── REJECT ──────────────────────────────────────────────────────────
  if (action === 'reject') {
    const { error } = await supabase.from('savings_requests').update({
      status:         'rejected',
      reviewed_by:    user.id,
      reviewed_at:    now,
      rejection_note: rejection_note?.trim() || null,
    }).eq('id', params.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, status: 'rejected' });
  }

  // ── APPROVE ─────────────────────────────────────────────────────────
  // Compute current balance
  const { data: rows } = await supabase
    .from('savings').select('type, amount').eq('employee_id', request.employee_id);
  const balance = (rows || []).reduce((s, r) =>
    r.type === 'credit' ? s + Number(r.amount) : s - Number(r.amount), 0);

  if (Number(request.amount) > balance)
    return NextResponse.json({ error: 'Insufficient balance to approve this request.' }, { status: 400 });

  const balanceAfter = Math.round((balance - Number(request.amount)) * 100) / 100;
  const label = request.reason_detail
    ? `${REASON_LABEL[request.reason] ?? 'Withdrawal'} — ${request.reason_detail}`
    : (REASON_LABEL[request.reason] ?? 'Withdrawal');
  const month = now.slice(0, 7);

  // Insert debit into savings
  const { error: debitErr } = await supabase.from('savings').insert({
    employee_id:   request.employee_id,
    type:          'debit',
    type_detail:   request.reason,
    amount:        Number(request.amount),
    balance_after: balanceAfter,
    reason:        label,
    month,
    created_by:    user.id,
    reference_id:  request.id,
  });
  if (debitErr) return NextResponse.json({ error: debitErr.message }, { status: 500 });

  // Sync employees.site_bonus_balance
  await supabase.from('employees')
    .update({ site_bonus_balance: balanceAfter })
    .eq('id', request.employee_id);

  // Mark request approved
  const { error: updateErr } = await supabase.from('savings_requests').update({
    status:      'approved',
    reviewed_by: user.id,
    reviewed_at: now,
  }).eq('id', params.id);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  return NextResponse.json({ success: true, status: 'approved', balance_after: balanceAfter });
}
