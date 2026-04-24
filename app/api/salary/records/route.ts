import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const month = req.nextUrl.searchParams.get('month');
  let query = supabase.from('salary_records').select('*, employees(full_name, bank_name, bank_account, daily_rate)').is('deleted_at', null).order('month', { ascending: false });
  if (month) query = query.eq('month', month);
  // Workers only see their own salary records
  if (user.role === 'worker') {
    if (!user.employee_id) return NextResponse.json([]);
    query = query.eq('employee_id', user.employee_id);
  }
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
