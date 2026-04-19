import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  if (!await getUser(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { month, records } = await req.json();
  if (!month || !records?.length) return NextResponse.json({ error: 'Month and records required.' }, { status: 400 });
  await supabase.from('salary_records').delete().eq('month', month);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await supabase.from('salary_records').insert(
    records.map((r: any) => ({
      employee_id: r.employee_id, month,
      total_days: r.total_days, daily_rate: r.daily_rate,
      gross_salary: r.gross_salary, total_advances: r.total_advances,
      net_salary: r.net_salary, status: 'finalized',
    }))
  ).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data });
}
