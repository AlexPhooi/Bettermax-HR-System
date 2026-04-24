// GET /api/savings/settings  — get current interest rate + last applied date
// PUT /api/savings/settings  — update interest rate (admin only)
import { NextRequest, NextResponse } from 'next/server';
import { getUser, isManager } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: setting } = await supabase
    .from('savings_settings')
    .select('*')
    .order('effective_from', { ascending: false })
    .limit(1)
    .single();

  // Last interest applied
  const { data: lastInterest } = await supabase
    .from('savings')
    .select('created_at, month')
    .eq('type_detail', 'monthly_interest')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  // Total savings pool
  const { data: allRows } = await supabase
    .from('savings')
    .select('type, amount');
  const pool = (allRows || []).reduce((s, r) =>
    r.type === 'credit' ? s + Number(r.amount) : s - Number(r.amount), 0);

  return NextResponse.json({
    interest_rate:      Number(setting?.interest_rate ?? 0.02),
    effective_from:     setting?.effective_from ?? null,
    last_interest_date: lastInterest?.created_at ?? null,
    last_interest_month: lastInterest?.month ?? null,
    total_pool:         Math.round(pool * 100) / 100,
  });
}

export async function PUT(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isManager(user.role)) return NextResponse.json({ error: 'Admin/Owner only.' }, { status: 403 });

  const { interest_rate } = await req.json();
  if (typeof interest_rate !== 'number' || interest_rate < 0 || interest_rate > 0.5)
    return NextResponse.json({ error: 'Rate must be between 0 and 50%.' }, { status: 400 });

  // Effective from next month 1st
  const now  = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const effectiveFrom = next.toISOString().split('T')[0];

  const { data, error } = await supabase.from('savings_settings').insert({
    interest_rate,
    effective_from: effectiveFrom,
    created_by: user.id,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
