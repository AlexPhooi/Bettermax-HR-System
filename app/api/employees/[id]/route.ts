import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await getUser(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  if (!body.full_name?.trim()) return NextResponse.json({ error: 'Full name is required.' }, { status: 400 });
  if (!body.daily_rate || Number(body.daily_rate) <= 0)
    return NextResponse.json({ error: 'Valid daily rate is required.' }, { status: 400 });
  const { data, error } = await supabase.from('employees').update({
    full_name: body.full_name.trim(),
    passport_no: body.passport_no?.trim() || null,
    permit_no: body.permit_no?.trim() || null,
    permit_expire: body.permit_expire || null,
    phone: body.phone?.trim() || null,
    daily_rate: Number(body.daily_rate),
    rank: body.rank || null,
    bank_name: body.bank_name || null,
    bank_account: body.bank_account?.trim() || null,
    passport_doc_url: body.passport_doc_url?.trim() || null,
    permit_doc_url:   body.permit_doc_url?.trim()   || null,
    status: body.status || 'active',
  }).eq('id', params.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
