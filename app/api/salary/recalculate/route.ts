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

function prevMonthOf(month: string) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// POST /api/salary/recalculate  { month: "2026-05" }
// Re-reads approved attendance + advances and updates existing salary_records.
// Only works on draft/finalized records (not paid).
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isManager(user.role)) return NextResponse.json({ error: 'Admin/Owner only.' }, { status: 403 });

  const { month } = await req.json();
  if (!month) return NextResponse.json({ error: 'Month required.' }, { status: 400 });

  const [y, m] = month.split('-').map(Number);
  const start = `${month}-01`;
  const end   = ymd(y, m + 1, 0); // day 0 of next month = last day of this month

  // Fetch existing salary records for this month (all statuses — allow recalc on history too)
  const { data: existing, error: srErr } = await supabase
    .from('salary_records')
    .select('id, employee_id, daily_rate, status')
    .eq('month', month)
    .is('deleted_at', null);
  if (srErr) return NextResponse.json({ error: srErr.message }, { status: 500 });
  if (!existing?.length) return NextResponse.json({ error: 'No salary records found for this month.' }, { status: 404 });

  // Fetch attendance, advances, and last month's unpaid over-advance carry-forward
  const prevMonth = prevMonthOf(month);
  const [attRes, advRes, carryRes] = await Promise.all([
    supabase.from('hr_attendance')
      .select('employee_id, days_worked, site_bonus, ot_hours')
      .gte('work_date', start).lte('work_date', end)
      .eq('status', 'approved').is('deleted_at', null),
    supabase.from('advances')
      .select('employee_id, amount')
      .eq('month', month),
    supabase.from('salary_records')
      .select('employee_id, carry_forward_out')
      .eq('month', prevMonth).is('deleted_at', null),
  ]);

  const attRows = attRes.data || [];
  const advRows = advRes.data || [];
  const carriedMap = new Map<string, number>();
  for (const r of carryRes.data || []) {
    carriedMap.set(r.employee_id, Number(r.carry_forward_out || 0));
  }

  let updated = 0;
  for (const rec of existing) {
    const att = attRows.filter(a => a.employee_id === rec.employee_id);
    const adv = advRows.filter(a => a.employee_id === rec.employee_id);

    const total_days       = att.reduce((s, a) => s + Number(a.days_worked  || 0), 0);
    const total_site_bonus = Math.round(att.reduce((s, a) => s + Number(a.site_bonus || 0), 0) * 100) / 100;
    const total_ot_hours   = Math.round(att.reduce((s, a) => s + Number(a.ot_hours   || 0), 0) * 100) / 100;
    const base_salary      = Math.round(total_days * Number(rec.daily_rate) * 100) / 100;
    const gross_salary     = Math.round((base_salary + total_site_bonus) * 100) / 100;
    const total_advances   = Math.round(adv.reduce((s, a) => s + Number(a.amount || 0), 0) * 100) / 100;

    // Over-advance carry-forward: last month's unpaid remainder is an extra
    // deduction this month; if still not fully covered, it rolls forward again.
    const carried_advance   = Math.round((carriedMap.get(rec.employee_id) || 0) * 100) / 100;
    const effective_advance = Math.round((total_advances + carried_advance) * 100) / 100;
    const net_salary        = Math.max(0, Math.round((gross_salary - effective_advance) * 100) / 100);
    const carry_forward_out = Math.max(0, Math.round((effective_advance - gross_salary) * 100) / 100);

    const { error } = await supabase.from('salary_records').update({
      total_days:       Math.round(total_days * 10000) / 10000,
      gross_salary,
      base_salary,
      total_site_bonus,
      total_ot_hours,
      total_advances,
      carried_advance,
      carry_forward_out,
      net_salary,
    }).eq('id', rec.id);

    if (!error) updated++;
  }

  return NextResponse.json({ success: true, updated, month });
}
