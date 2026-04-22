import { NextRequest, NextResponse } from 'next/server';
import { getUser, isManager } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

// GET: return all soft-deleted items grouped by type
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isManager(user.role)) return NextResponse.json({ error: 'Admin/Owner only.' }, { status: 403 });

  // Deleted users (with linked employee name)
  const { data: users } = await supabase
    .from('users')
    .select('id, username, role, employee_id, deleted_at, employees(full_name)')
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false });

  // Deleted employees not linked to any user
  const { data: employees } = await supabase
    .from('employees')
    .select('id, full_name, rank, daily_rate, deleted_at')
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false });

  // Deleted attendance records
  const { data: attendance } = await supabase
    .from('hr_attendance')
    .select('id, work_date, hours_worked, days_worked, deleted_at, employees(full_name), projects(name, code)')
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false });

  // Deleted salary records
  const { data: salary } = await supabase
    .from('salary_records')
    .select('id, month, net_salary, deleted_at, employees(full_name)')
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false });

  return NextResponse.json({
    staff:      users      || [],
    employees:  employees  || [],
    attendance: attendance || [],
    salary:     salary     || [],
  });
}
