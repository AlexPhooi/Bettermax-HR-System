import { NextRequest, NextResponse } from 'next/server';
import { getUser, isManager } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  let query = supabase.from('advances').select('*, employees(full_name)').order('advance_date', { ascending: false });
  if (sp.get('month'))       query = query.eq('month',       sp.get('month')!);

  // Non-managers (viewer/editor/approval) can only see their own employee's advances
  if (!isManager(user.role)) {
    if (!user.employee_id) return NextResponse.json([]);
    query = query.eq('employee_id', user.employee_id);
  } else {
    // Managers can filter by employee_id if provided
    if (sp.get('employee_id')) query = query.eq('employee_id', sp.get('employee_id')!);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isManager(user.role)) return NextResponse.json({ error: 'Admin/Owner only.' }, { status: 403 });

  const body = await req.json();

  // Support single employee_id or array of employee_ids
  const ids: string[] = body.employee_ids?.length
    ? body.employee_ids
    : body.employee_id ? [body.employee_id] : [];

  if (!ids.length)    return NextResponse.json({ error: 'At least one employee required.' }, { status: 400 });
  if (!body.amount || Number(body.amount) <= 0)
    return NextResponse.json({ error: 'Valid amount required.' }, { status: 400 });
  if (!body.month)    return NextResponse.json({ error: 'Salary month required.' }, { status: 400 });

  const inserted: unknown[] = [];
  const errors:   string[]  = [];

  for (const employee_id of ids) {
    const { data, error } = await supabase.from('advances').insert({
      employee_id,
      advance_date:  body.advance_date  || null,
      amount:        Number(body.amount),
      month:         body.month,
      notes:         body.notes?.trim() || null,
      detail_type:   body.detail_type   || 'other',
      pay_by:        body.pay_by        || 'cash',
      bank_name:     body.bank_name?.trim()     || null,
      account_name:  body.account_name?.trim()  || null,
      account_no:    body.account_no?.trim()    || null,
      bank_slip_url: body.bank_slip_url || null,
    }).select().single();
    if (error) errors.push(error.message);
    else inserted.push(data);
  }

  return NextResponse.json({ inserted, errors });
}
