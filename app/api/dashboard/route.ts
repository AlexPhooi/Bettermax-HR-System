import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  if (!await getUser(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const start = `${month}-01`;
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
  const today = now.toISOString().split('T')[0];
  const in60 = new Date(now.getTime() + 60 * 86400000).toISOString().split('T')[0];

  const [empRes, attRes, expRes, expiredRes] = await Promise.all([
    supabase.from('employees').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('hr_attendance').select('days_worked, employees(daily_rate)').gte('work_date', start).lte('work_date', end),
    supabase.from('employees').select('id, full_name, permit_expire').eq('status', 'active').lte('permit_expire', in60).gte('permit_expire', today).order('permit_expire'),
    supabase.from('employees').select('id, full_name, permit_expire').eq('status', 'active').lt('permit_expire', today).not('permit_expire', 'is', null).order('permit_expire'),
  ]);

  const totalDays    = (attRes.data || []).reduce((s, a) => s + Number(a.days_worked || 0), 0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalPayroll = (attRes.data || []).reduce((s: number, a: any) => s + Number(a.days_worked || 0) * Number(a.employees?.daily_rate || 0), 0);

  return NextResponse.json({
    active_employees: empRes.count || 0,
    month_attendance_days: Math.round(totalDays * 100) / 100,
    month_payroll: Math.round(totalPayroll * 100) / 100,
    permits_expiring: (expRes.data || []).length,
    expiring_list: expRes.data || [],
    expired_list: expiredRes.data || [],
    current_month: month,
  });
}
