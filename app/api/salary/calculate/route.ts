import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

function getPaymentDue(month: string) {
  const [y, m] = month.split('-');
  return new Date(+y, +m, 7).toISOString().split('T')[0];
}

export async function GET(req: NextRequest) {
  if (!await getUser(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const month = req.nextUrl.searchParams.get('month');
  if (!month) return NextResponse.json({ error: 'Month required.' }, { status: 400 });
  const [y, m] = month.split('-');
  const start = `${month}-01`;
  const end = new Date(+y, +m, 0).toISOString().split('T')[0];

  const [empRes, attRes, advRes] = await Promise.all([
    supabase.from('employees').select('id, full_name, daily_rate, status, bank_name, bank_account, site_bonus_balance').eq('status', 'active'),
    supabase.from('hr_attendance').select('employee_id, days_worked, ot_hours, site_bonus').gte('work_date', start).lte('work_date', end).eq('status', 'approved'),
    supabase.from('advances').select('employee_id, amount').eq('month', month),
  ]);
  if (empRes.error) return NextResponse.json({ error: empRes.error.message }, { status: 500 });

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
    return {
      employee_id:      emp.id,
      full_name:        emp.full_name,
      total_days:       Math.round(total_days * 10000) / 10000,
      total_ot_hours:   Math.round(total_ot_hours * 10) / 10,
      daily_rate:       Number(emp.daily_rate),
      base_salary,
      total_site_bonus,
      gross_salary,
      total_advances,
      net_salary:       Math.round((gross_salary - total_advances) * 100) / 100,
      attendance_days:  att.length,
      site_bonus_balance,                          // current accumulated balance
      bank_name:        emp.bank_name    || null,
      bank_account:     emp.bank_account || null,
    };
  });
  return NextResponse.json({ month, payment_due: getPaymentDue(month), data });
}
