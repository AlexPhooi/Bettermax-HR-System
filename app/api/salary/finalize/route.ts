import { NextRequest, NextResponse } from 'next/server';
import { getUser, isManager } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isManager(user.role)) return NextResponse.json({ error: 'Admin/Owner only.' }, { status: 403 });

  const { month, records } = await req.json();
  if (!month || !records?.length) return NextResponse.json({ error: 'Month and records required.' }, { status: 400 });

  // Delete existing records for the month (hard delete on re-finalize)
  await supabase.from('salary_records').delete().eq('month', month);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await supabase.from('salary_records').insert(
    records.map((r: any) => ({
      employee_id:      r.employee_id,
      month,
      total_days:       r.total_days,
      daily_rate:       r.daily_rate,
      base_salary:      r.base_salary,
      total_site_bonus: r.total_site_bonus,
      gross_salary:     r.gross_salary,
      total_advances:   r.total_advances,
      net_salary:       r.net_salary,
      status:           'finalized',
    }))
  ).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // NOTE: site_bonus_balance is already updated in the savings ledger at the time each
  // attendance record is approved (via /api/attendance/group). Do NOT double-credit here.

  return NextResponse.json({ success: true, data });
}
