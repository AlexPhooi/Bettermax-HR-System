import { NextRequest, NextResponse } from 'next/server';
import { getUser, isManager } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isManager(user.role)) return NextResponse.json({ error: 'Admin/Owner only.' }, { status: 403 });

  const { month, records } = await req.json();
  if (!month || !records?.length) return NextResponse.json({ error: 'Month and records required.' }, { status: 400 });

  // Fetch existing records — preserve any that already have a payment slip uploaded
  const { data: existing } = await supabase
    .from('salary_records').select('employee_id, payment_slip_url').eq('month', month);
  const paidIds = new Set((existing || []).filter(r => r.payment_slip_url).map(r => r.employee_id));

  // Delete only records WITHOUT a payment slip (safe to overwrite)
  await supabase.from('salary_records').delete().eq('month', month).is('payment_slip_url', null);

  // Insert all records except those already paid (slip uploaded)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toInsert = records.filter((r: any) => !paidIds.has(r.employee_id));
  if (!toInsert.length) return NextResponse.json({ success: true, data: [] });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await supabase.from('salary_records').insert(
    toInsert.map((r: any) => ({
      employee_id:      r.employee_id,
      month,
      total_days:       r.total_days,
      daily_rate:       r.daily_rate,
      base_salary:      r.base_salary,
      total_site_bonus: r.total_site_bonus,
      total_ot_hours:   r.total_ot_hours || 0,
      gross_salary:     r.gross_salary,
      total_advances:   r.total_advances,
      carried_advance:  r.carried_advance    || 0,
      carry_forward_out: r.carry_forward_out || 0,
      net_salary:       r.net_salary,
      status:           'finalized',
    }))
  ).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // NOTE: site_bonus_balance is already updated in the savings ledger at the time each
  // attendance record is approved (via /api/attendance/group). Do NOT double-credit here.

  return NextResponse.json({ success: true, data });
}
