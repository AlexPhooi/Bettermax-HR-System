import { NextRequest, NextResponse } from 'next/server';
import { getUser, isManager } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

// GET single employee by ID — admin/owner
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data, error } = await supabase.from('employees').select('*').eq('id', params.id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// Full update — admin/owner only
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isManager(user.role)) return NextResponse.json({ error: 'Admin/Owner only.' }, { status: 403 });

  const body = await req.json();
  if (!body.full_name?.trim()) return NextResponse.json({ error: 'Full name is required.' }, { status: 400 });

  const { data, error } = await supabase.from('employees').update({
    full_name:       body.full_name.trim(),
    passport_no:     body.passport_no?.trim()    || null,
    permit_no:       body.permit_no?.trim()       || null,
    permit_expire:   body.permit_expire           || null,
    date_of_birth:   body.date_of_birth           || null,
    phone:           body.phone?.trim()           || null,
    daily_rate:      Number(body.daily_rate)      || 0,
    rank:            body.rank                    || null,
    bank_name:       body.bank_name               || null,
    bank_account:    body.bank_account?.trim()    || null,
    passport_doc_url: body.passport_doc_url?.trim() || null,
    permit_doc_url:   body.permit_doc_url?.trim()   || null,
    avatar_url:      body.avatar_url?.trim()      || null,
    status:          body.status                  || 'active',
  }).eq('id', params.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// Self-update — worker/leader can update own limited fields
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!isManager(user.role) && user.employee_id !== params.id)
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });

  const body = await req.json();
  const allowed: Record<string, unknown> = {};
  // Full name — self or manager; always stored in UPPERCASE
  if (body.full_name !== undefined) {
    const name = body.full_name?.trim() || '';
    if (!name) return NextResponse.json({ error: 'Name cannot be empty.' }, { status: 400 });
    allowed.full_name = name;
  }
  if (body.phone            !== undefined) allowed.phone            = body.phone?.trim()            || null;
  if (body.bank_name        !== undefined) allowed.bank_name        = body.bank_name                || null;
  if (body.bank_account     !== undefined) allowed.bank_account     = body.bank_account?.trim()     || null;
  if (body.avatar_url       !== undefined) allowed.avatar_url       = body.avatar_url?.trim()       || null;
  // Workers can update their own permit/passport details
  if (body.passport_no      !== undefined) allowed.passport_no      = body.passport_no?.trim()      || null;
  if (body.permit_no        !== undefined) allowed.permit_no        = body.permit_no?.trim()        || null;
  if (body.permit_expire    !== undefined) allowed.permit_expire    = body.permit_expire            || null;
  // Workers can upload their own documents
  if (body.passport_doc_url !== undefined) allowed.passport_doc_url = body.passport_doc_url?.trim() || null;
  if (body.permit_doc_url   !== undefined) allowed.permit_doc_url   = body.permit_doc_url?.trim()   || null;
  // Manager-only: adjust site bonus balance (e.g. withdrawal)
  if (body.site_bonus_balance !== undefined && isManager(user.role))
    allowed.site_bonus_balance = Number(body.site_bonus_balance);

  if (Object.keys(allowed).length === 0)
    return NextResponse.json({ error: 'No updatable fields provided.' }, { status: 400 });

  const { data, error } = await supabase.from('employees').update(allowed).eq('id', params.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// Soft-delete — standalone employee (no user account)
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isManager(user.role)) return NextResponse.json({ error: 'Admin/Owner only.' }, { status: 403 });

  const { error } = await supabase.from('employees')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
