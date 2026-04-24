// GET /api/savings/[employee_id]/statement
// Full transaction history with running balance.
// Workers can only see their own; admins see any.
import { NextRequest, NextResponse } from 'next/server';
import { getUser, isManager } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export async function GET(
  req: NextRequest,
  { params }: { params: { employee_id: string } }
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Workers can only view their own
  if (!isManager(user.role) && user.employee_id !== params.employee_id)
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });

  const { data: rows, error } = await supabase
    .from('savings')
    .select('*')
    .eq('employee_id', params.employee_id)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Add running balance column
  let running = 0;
  const statement = (rows || []).map(r => {
    if (r.type === 'credit') running += Number(r.amount);
    else running -= Number(r.amount);
    return { ...r, running_balance: Math.round(running * 100) / 100 };
  });

  return NextResponse.json(statement);
}
