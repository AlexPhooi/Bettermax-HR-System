import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  if (!await getUser(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

  // Update each employee's site_bonus_balance by adding this month's site bonus
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bonusUpdates = records.filter((r: any) => Number(r.total_site_bonus) > 0);
  for (const r of bonusUpdates) {
    // Increment balance: fetch current then update
    const { data: emp } = await supabase
      .from('employees')
      .select('site_bonus_balance')
      .eq('id', r.employee_id)
      .single();
    const current = Number(emp?.site_bonus_balance || 0);
    const newBalance = Math.round((current + Number(r.total_site_bonus)) * 100) / 100;
    await supabase
      .from('employees')
      .update({ site_bonus_balance: newBalance })
      .eq('id', r.employee_id);
  }

  return NextResponse.json({ success: true, data });
}
