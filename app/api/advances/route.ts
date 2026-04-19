import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  if (!await getUser(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  let query = supabase.from('advances').select('*, employees(full_name)').order('advance_date', { ascending: false });
  if (sp.get('month')) query = query.eq('month', sp.get('month')!);
  if (sp.get('employee_id')) query = query.eq('employee_id', sp.get('employee_id')!);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  if (!await getUser(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  if (!body.employee_id) return NextResponse.json({ error: 'Employee required.' }, { status: 400 });
  if (!body.amount || Number(body.amount) <= 0) return NextResponse.json({ error: 'Valid amount required.' }, { status: 400 });
  if (!body.month) return NextResponse.json({ error: 'Salary month required.' }, { status: 400 });
  const { data, error } = await supabase.from('advances').insert({
    employee_id: body.employee_id, advance_date: body.advance_date,
    amount: Number(body.amount), month: body.month, notes: body.notes?.trim() || null,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
