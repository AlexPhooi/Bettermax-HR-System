import { NextRequest, NextResponse } from 'next/server';
import { getUser, isManager } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

// Timezone-safe: builds the date in UTC and reads it back in UTC, so it can never
// shift by a day depending on the server's local timezone offset (unlike
// `new Date(y, m, d).toISOString()`, which round-trips through local time first).
function ymd(year: number, month: number, day: number) {
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.toISOString().split('T')[0];
}

function getPaymentDue(month: string) {
  const [y, m] = month.split('-').map(Number);
  return ymd(y, m + 1, 7);
}

function prevMonthOf(month: string) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1)); // m-2: JS month index for the month before
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isManager(user.role)) return NextResponse.json({ error: 'Admin/Owner only.' }, { status: 403 });
  const month = req.nextUrl.searchParams.get('month');
  if (!month) return NextResponse.json({ error: 'Month required.' }, { status: 400 });
  const [y, m] = month.split('-').map(Number);
  const start = `${month}-01`;
  const end = ymd(y, m + 1, 0); // day 0 of next month = last day of this month
  const prevMonth = prevMonthOf(month);

  const [empRes, attRes, advRes, carryRes] = await Promise.all([
    supabase.from('employees').select('id, full_name, daily_rate, rank, status, bank_name, bank_account, site_bonus_balance').eq('status', 'active').eq('is_demo', false),
    supabase.from('hr_attendance').select('employee_id, days_worked, ot_hours, site_bonus').gte('work_date', start).lte('work_date', end).eq('status', 'approved').is('deleted_at', null),
    supabase.from('advances').select('employee_id, amount').eq('month', month),
    // Unpaid over-advance from last month — must be recovered this month, never silently dropped.
    supabase.from('salary_records').select('employee_id, carry_forward_out').eq('month', prevMonth).is('deleted_at', null),
  ]);
  if (empRes.error) return NextResponse.json({ error: empRes.error.message }, { status: 500 });

  const carriedMap = new Map<string, number>();
  for (const r of carryRes.data || []) {
    carriedMap.set(r.employee_id, Number(r.carry_forward_out || 0));
  }

  const data = (empRes.data || []).map(emp => {
    const att  = (attRes.data || []).filter(a => a.employee_id === emp.id);
    const total_days       = att.reduce((s, a) => s + Number(a.days_worked || 0), 0);
    const total_ot_hours   = att.reduce((s, a) => s + Number(a.ot_hours    || 0), 0);
    const total_site_bonus = Math.round(att.reduce((s, a) => s + Number(a.site_bonus || 0), 0) * 100) / 100;
    const base_salary      = Math.round(total_days * Number(emp.daily_rate) * 100) / 100;
    const gross_salary     = Math.round((base_salary + total_site_bonus) * 100) / 100;
    const advs             = (advRes.data || []).filter(a => a.employee_id === emp.id);
    const total_advances   = Math.round(advs.reduce((s, a) => s + Number(a.amount || 0), 0) * 100) / 100;
    const site_bonus_balance = Number(emp.site_bonus_balance || 0);

    // Over-advance carry-forward: last month's unpaid remainder is an extra
    // deduction this month, on top of this month's own advances. If this month
    // still isn't enough to clear it, the remainder rolls forward again.
    const carried_advance   = Math.round((carriedMap.get(emp.id) || 0) * 100) / 100;
    const effective_advance = Math.round((total_advances + carried_advance) * 100) / 100;
    const net_salary        = Math.max(0, Math.round((gross_salary - effective_advance) * 100) / 100);
    const carry_forward_out = Math.max(0, Math.round((effective_advance - gross_salary) * 100) / 100);

    return {
      employee_id:      emp.id,
      full_name:        emp.full_name,
      rank:             (emp as {rank?: string}).rank || null,
      total_days:       Math.round(total_days * 10000) / 10000,
      total_ot_hours:   Math.round(total_ot_hours * 10) / 10,
      daily_rate:       Number(emp.daily_rate),
      base_salary,
      total_site_bonus,
      gross_salary,
      total_advances,
      carried_advance,                              // brought forward from last month, unpaid
      carry_forward_out,                             // still unpaid after this month — rolls to next
      net_salary,
      attendance_days:  att.length,
      site_bonus_balance,                          // current accumulated balance
      bank_name:        emp.bank_name    || null,
      bank_account:     emp.bank_account || null,
    };
  });
  return NextResponse.json({ month, payment_due: getPaymentDue(month), data });
}
