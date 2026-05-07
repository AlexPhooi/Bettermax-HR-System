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
  const currentMonthNum = now.getMonth() + 1; // 1-12

  // Viewer/Editor: return only own stats
  if (user.role === 'viewer' || user.role === 'editor') {
    if (!user.employee_id) return NextResponse.json({ active_employees: 0, month_attendance_days: 0, month_payroll: 0, permits_expiring: 0, expiring_list: [], expired_list: [], pending_count: 0, current_month: month, birthdays_this_month: [], upcoming_birthdays: [] });
    const { data: att } = await supabase.from('hr_attendance')
      .select('days_worked, hours_worked, status, work_date')
      .eq('employee_id', user.employee_id)
      .gte('work_date', start).lte('work_date', end)
      .is('deleted_at', null);
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
      birthdays_this_month: [],
      upcoming_birthdays: [],
    });
  }

  const [empRes, attRes, expRes, expiredRes, pendingRes, binStaffRes, binAttRes, binSalaryRes, allEmpRes] = await Promise.all([
    supabase.from('employees').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('hr_attendance').select('days_worked, site_bonus, employees(daily_rate)').gte('work_date', start).lte('work_date', end).eq('status', 'approved').is('deleted_at', null),
    supabase.from('employees').select('id, full_name, permit_expire').eq('status', 'active').eq('is_demo', false).lte('permit_expire', in60).gte('permit_expire', today).order('permit_expire'),
    supabase.from('employees').select('id, full_name, permit_expire').eq('status', 'active').eq('is_demo', false).lt('permit_expire', today).not('permit_expire', 'is', null).order('permit_expire'),
    supabase.from('hr_attendance').select('id', { count: 'exact', head: true }).eq('status', 'pending').is('deleted_at', null),
    supabase.from('users').select('id', { count: 'exact', head: true }).not('deleted_at', 'is', null),
    supabase.from('hr_attendance').select('id', { count: 'exact', head: true }).not('deleted_at', 'is', null),
    supabase.from('salary_records').select('id', { count: 'exact', head: true }).not('deleted_at', 'is', null),
    supabase.from('employees').select('id, full_name, date_of_birth').eq('status', 'active').is('deleted_at', null).not('date_of_birth', 'is', null),
  ]);

  const totalDays    = (attRes.data || []).reduce((s, a) => s + Number(a.days_worked || 0), 0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalPayroll = (attRes.data || []).reduce((s: number, a: any) => s + Number(a.days_worked || 0) * Number(a.employees?.daily_rate || 0) + Number(a.site_bonus || 0), 0);

  // ── Birthday logic ─────────────────────────────────────────────────
  const allEmps = allEmpRes.data || [];
  const in30 = new Date(now.getTime() + 30 * 86400000);

  const birthdaysThisMonth: { id: string; full_name: string; date_of_birth: string; day: number }[] = [];
  const upcomingBirthdays:  { id: string; full_name: string; date_of_birth: string; days_until: number }[] = [];

  for (const emp of allEmps) {
    if (!emp.date_of_birth) continue;
    const dobMonth = Number(emp.date_of_birth.slice(5, 7));
    const dobDay   = Number(emp.date_of_birth.slice(8, 10));

    // Birthday this month
    if (dobMonth === currentMonthNum) {
      birthdaysThisMonth.push({ id: emp.id, full_name: emp.full_name, date_of_birth: emp.date_of_birth, day: dobDay });
    }

    // Upcoming in next 30 days (using this year's birthday date)
    const thisYear    = now.getFullYear();
    let bdayThisYear  = new Date(thisYear, dobMonth - 1, dobDay);
    // If already passed this year, check next year
    if (bdayThisYear < now) bdayThisYear = new Date(thisYear + 1, dobMonth - 1, dobDay);
    const daysUntil = Math.round((bdayThisYear.getTime() - now.getTime()) / 86400000);
    if (daysUntil >= 0 && bdayThisYear <= in30) {
      upcomingBirthdays.push({ id: emp.id, full_name: emp.full_name, date_of_birth: emp.date_of_birth, days_until: daysUntil });
    }
  }

  // Sort
  birthdaysThisMonth.sort((a, b) => a.day - b.day);
  upcomingBirthdays.sort((a, b) => a.days_until - b.days_until);

  return NextResponse.json({
    active_employees: empRes.count || 0,
    month_attendance_days: Math.round(totalDays * 100) / 100,
    month_payroll: Math.round(totalPayroll * 100) / 100,
    permits_expiring: (expRes.data || []).length,
    expiring_list: expRes.data || [],
    expired_list: expiredRes.data || [],
    pending_count: pendingRes.count || 0,
    bin_staff: binStaffRes.count || 0,
    bin_att: binAttRes.count || 0,
    bin_salary: binSalaryRes.count || 0,
    current_month: month,
    birthdays_this_month: birthdaysThisMonth,
    upcoming_birthdays: upcomingBirthdays,
  });
}
