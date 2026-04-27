import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Non-admin roles can only see their own employee record
  if (user.role === 'viewer' || user.role === 'editor' || user.role === 'approval') {
    if (!user.employee_id) return NextResponse.json([]);
    const { data, error } = await supabase.from('employees')
      .select('*').eq('id', user.employee_id).is('deleted_at', null).single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ? [data] : []);
  }

  const { searchParams } = req.nextUrl;
  let query = supabase.from('employees').select('*')
    .is('deleted_at', null)   // ← exclude soft-deleted
    .order('full_name');
  const search = searchParams.get('search');
  const status = searchParams.get('status');
  if (search) query = query.ilike('full_name', `%${search}%`);
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  if (!await getUser(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  if (!body.full_name?.trim()) return NextResponse.json({ error: 'Full name is required.' }, { status: 400 });
  if (!body.daily_rate || Number(body.daily_rate) <= 0)
    return NextResponse.json({ error: 'Valid daily rate is required.' }, { status: 400 });
  const { data, error } = await supabase.from('employees').insert({
    full_name:       body.full_name.trim(),
    passport_no:     body.passport_no?.trim()  || null,
    permit_no:       body.permit_no?.trim()    || null,
    permit_expire:   body.permit_expire        || null,
    date_of_birth:   body.date_of_birth        || null,
    phone:           body.phone?.trim()        || null,
    daily_rate:      Number(body.daily_rate),
    rank:            body.rank                 || null,
    bank_name:       body.bank_name            || null,
    bank_account:    body.bank_account?.trim() || null,
    passport_doc_url: body.passport_doc_url?.trim() || null,
    permit_doc_url:   body.permit_doc_url?.trim()   || null,
    status: 'active',
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
