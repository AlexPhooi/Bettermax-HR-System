import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const start = `${month}-01`;
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
  const today = now.toISOString().split('T')[0];
  const in60 = new Date(now.getTime() + 60 * 86400000).toISOString().split('T')[0];

  // Worker: return only own stats
  if (user.role === 'worker') {
    if (!user.employee_id) return NextResponse.json({ active_employees: 0, month_attendance_days: 0, month_payroll: 0, permits_expiring: 0, expiring_list: [], expired_list: [], pending_count: 0, current_month: month });
    const { data: att } = await supabase.from('hr_attendance')
      .select('days_worked, hours_worked, status, work_date')
      .eq('employee_id', user.employee_id)
      .gte('work_date', start).lte('work_date', end);
    const approvedAtt = (att || []).filter(a => a.status === 'approved');
    const totalDays = approvedAtt.reduce((s, a) => s + Number(a.days_worked || 0), 0);
    return NextResponse.json({
      active_employees: 0,
      month_attendance_days: Math.round(totalDays * 100) / 100,
      month_payroll: 0,
      permits_expiring: 0,
      expiring_list: [], expired_list: [],
      pending_count: 0,
      current_month: month,
    });
  }

  const [empRes, attRes, expRes, expiredRes, pendingRes] = await Promise.all([
    supabase.from('employees').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('hr_attendance').select('days_worked, site_bonus, employees(daily_rate)').gte('work_date', start).lte('work_date', end).eq('status', 'approved'),
    supabase.from('employees').select('id, full_name, permit_expire').eq('status', 'active').lte('permit_expire', in60).gte('permit_expire', today).order('permit_expire'),
    supabase.from('employees').select('id, full_name, permit_expire').eq('status', 'active').lt('permit_expire', today).not('permit_expire', 'is', null).order('permit_expire'),
    supabase.from('hr_attendance').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ]);

  const totalDays    = (attRes.data || []).reduce((s, a) => s + Number(a.days_worked || 0), 0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalPayroll = (attRes.data || []).reduce((s: number, a: any) => s + Number(a.days_worked || 0) * Number(a.employees?.daily_rate || 0) + Number(a.site_bonus || 0), 0);

  return NextResponse.json({
    active_employees: empRes.count || 0,
    month_attendance_days: Math.round(totalDays * 100) / 100,
    month_payroll: Math.round(totalPayroll * 100) / 100,
    permits_expiring: (expRes.data || []).length,
    expiring_list: expRes.data || [],
    expired_list: expiredRes.data || [],
    pending_count: pendingRes.count || 0,
    current_month: month,
  });
}
