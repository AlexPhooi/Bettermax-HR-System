import { NextRequest, NextResponse } from 'next/server';
import { getUser, isManager } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  if (!await getUser(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data, error } = await supabase
    .from('ranking_rates')
    .select('*')
    .order('daily_rate');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PUT(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isManager(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json(); // [{ rank, daily_rate }]
  if (!Array.isArray(body)) return NextResponse.json({ error: 'Array required.' }, { status: 400 });

  let employeesUpdated = 0;

  for (const row of body) {
    if (!row.rank || !row.daily_rate) continue;
    const rate = Number(row.daily_rate);

    // 1. Save to ranking_rates table
    await supabase.from('ranking_rates')
      .upsert({ rank: row.rank, daily_rate: rate, updated_at: new Date().toISOString() });

    // 2. Immediately apply to all active employees with this rank
    const { data: updated } = await supabase.from('employees')
      .update({ daily_rate: rate })
      .eq('rank', row.rank)
      .eq('status', 'active')
      .is('deleted_at', null)
      .select('id');
    employeesUpdated += updated?.length ?? 0;
  }

  return NextResponse.json({ success: true, employees_updated: employeesUpdated });
}
