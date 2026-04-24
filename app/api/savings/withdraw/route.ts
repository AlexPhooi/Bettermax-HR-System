// POST /api/savings/withdraw
// Admin-only emergency release of funds.
import { NextRequest, NextResponse } from 'next/server';
import { getUser, isManager } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

const VALID_REASONS = ['emergency_withdrawal', 'medical', 'flight_home', 'permit_renewal', 'other'] as const;

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isManager(user.role)) return NextResponse.json({ error: 'Admin/Owner only.' }, { status: 403 });

  const { employee_id, amount, type_detail, notes } = await req.json();

  if (!employee_id) return NextResponse.json({ error: 'employee_id required.' }, { status: 400 });
  if (!amount || Number(amount) <= 0) return NextResponse.json({ error: 'Amount must be positive.' }, { status: 400 });
  if (!VALID_REASONS.includes(type_detail))
    return NextResponse.json({ error: 'Invalid reason type.' }, { status: 400 });
  if (!notes?.trim()) return NextResponse.json({ error: 'Notes are required for withdrawals.' }, { status: 400 });

  // Compute current balance
  const { data: rows } = await supabase
    .from('savings')
    .select('type, amount')
    .eq('employee_id', employee_id);

  const balance = (rows || []).reduce((s, r) =>
    r.type === 'credit' ? s + Number(r.amount) : s - Number(r.amount), 0);

  if (Number(amount) > balance)
    return NextResponse.json({ error: 'Amount exceeds current balance.' }, { status: 400 });

  const balanceAfter = Math.round((balance - Number(amount)) * 100) / 100;

  // Friendly reason label for description
  const reasonLabel: Record<string, string> = {
    emergency_withdrawal: 'Emergency',
    medical:              'Medical',
    flight_home:          'Flight Home',
    permit_renewal:       'Permit Renewal',
    other:                'Other',
  };

  const month = new Date().toISOString().slice(0, 7);

  const { data, error } = await supabase.from('savings').insert({
    employee_id,
    type:         'debit',
    type_detail,
    amount:       Number(amount),
    balance_after: balanceAfter,
    reason:       `${reasonLabel[type_detail]} — ${notes.trim()}`,
    month,
    created_by:   user.id,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Also update employees.site_bonus_balance for backward compat
  await supabase.from('employees')
    .update({ site_bonus_balance: balanceAfter })
    .eq('id', employee_id);

  return NextResponse.json({ ...data, balance_after: balanceAfter });
}
