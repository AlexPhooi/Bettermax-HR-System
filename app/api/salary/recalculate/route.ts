import { NextRequest, NextResponse } from 'next/server';
import { getUser, isManager } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

// POST /api/salary/recalculate  { month: "2026-05" }
// Re-reads approved attendance + advances and updates existing salary_records.
// Only works on draft/finalized records (not paid).
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isManager(user.role)) return NextResponse.json({ error: 'Admin/Owner only.' }, { status: 403 });

  const { month } = await req.json();
  if (!month) return NextResponse.json({ error: 'Month required.' }, { status: 400 });

  const [y, m] = month.split('-');
  const start = `${month}-01`;
  const end   = new Date(+y, +m, 0).toISOString().split('T')[0];

  // Fetch existing salary records for this month (skip paid)
  const { data: existing, error: srErr } = await supabase
    .from('salary_records')
    .select('id, employee_id, daily_rate, status')
    .eq('month', month)
    .in('status', ['draft', 'finalized'])
    .is('deleted_at', null);
  if (srErr) return NextResponse.json({ error: srErr.message }, { status: 500 });
  if (!existing?.length) return NextResponse.json({ error: 'No draft/finalized salary records found for this month.' }, { status: 404 });

  // Fetch attendance & advances in parallel
  const [attRes, advRes] = await Promise.all([
    supabase.from('hr_attendance')
      .select('employee_id, days_worked, site_bonus')
      .gte('work_date', start).lte('work_date', end)
      .eq('status', 'approved').is('deleted_at', null),
    supabase.from('advances')
      .select('employee_id, amount')
      .eq('month', month),
  ]);

  const attRows = attRes.data || [];
  const advRows = advRes.data || [];

  let updated = 0;
  for (const rec of existing) {
    const att = attRows.filter(a => a.employee_id === rec.employee_id);
    const adv = advRows.filter(a => a.employee_id === rec.employee_id);

    const total_days       = att.reduce((s, a) => s + Number(a.days_worked  || 0), 0);
    const total_site_bonus = Math.round(att.reduce((s, a) => s + Number(a.site_bonus || 0), 0) * 100) / 100;
    const base_salary      = Math.round(total_days * Number(rec.daily_rate) * 100) / 100;
    const gross_salary     = Math.round((base_salary + total_site_bonus) * 100) / 100;
    const total_advances   = Math.round(adv.reduce((s, a) => s + Number(a.amount || 0), 0) * 100) / 100;
    const net_salary       = Math.max(0, Math.round((gross_salary - total_advances) * 100) / 100);

    const { error } = await supabase.from('salary_records').update({
      total_days:       Math.round(total_days * 10000) / 10000,
      gross_salary,
      base_salary,
      total_site_bonus,
      total_advances,
      net_salary,
    }).eq('id', rec.id);

    if (!error) updated++;
  }

  return NextResponse.json({ success: true, updated, month });
}
