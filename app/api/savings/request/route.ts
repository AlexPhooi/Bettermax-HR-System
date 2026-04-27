// GET  /api/savings/request  — list requests (worker: own, admin: all)
// POST /api/savings/request  — worker submits withdrawal request
import { NextRequest, NextResponse } from 'next/server';
import { getUser, isManager } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

const VALID_REASONS = ['permit', 'flight', 'emergency', 'others'] as const;

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let query = supabase
    .from('savings_requests')
    .select('*, employees(full_name, rank)')
    .order('created_at', { ascending: false });

  // Non-managers only see their own
  if (!isManager(user.role)) {
    if (!user.employee_id) return NextResponse.json([]);
    query = query.eq('employee_id', user.employee_id);
  }

  const status = req.nextUrl.searchParams.get('status');
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Only viewer and editor can submit requests
  if (isManager(user.role) || user.role === 'approval')
    return NextResponse.json({ error: 'Only workers can submit withdrawal requests.' }, { status: 403 });

  if (!user.employee_id)
    return NextResponse.json({ error: 'No employee profile linked to your account.' }, { status: 400 });

  const body = await req.json();
  const { amount, reason, reason_detail } = body;

  if (!amount || Number(amount) <= 0)
    return NextResponse.json({ error: 'Amount must be positive.' }, { status: 400 });
  if (!VALID_REASONS.includes(reason))
    return NextResponse.json({ error: 'Invalid reason.' }, { status: 400 });
  if (reason === 'others' && !reason_detail?.trim())
    return NextResponse.json({ error: 'Please describe your reason.' }, { status: 400 });

  // Get current balance
  const { data: rows } = await supabase
    .from('savings').select('type, amount').eq('employee_id', user.employee_id);
  const balance = (rows || []).reduce((s, r) =>
    r.type === 'credit' ? s + Number(r.amount) : s - Number(r.amount), 0);

  if (Number(amount) > balance)
    return NextResponse.json({
      error: `Amount exceeds your current balance of RM ${balance.toFixed(2)}.`,
    }, { status: 400 });

  // Block if already has a pending request
  const { count } = await supabase
    .from('savings_requests')
    .select('id', { count: 'exact', head: true })
    .eq('employee_id', user.employee_id)
    .eq('status', 'pending');

  if ((count || 0) > 0)
    return NextResponse.json({ error: 'You already have a pending withdrawal request.' }, { status: 409 });

  const { data, error } = await supabase.from('savings_requests').insert({
    employee_id:   user.employee_id,
    amount:        Number(amount),
    reason,
    reason_detail: reason_detail?.trim() || null,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
