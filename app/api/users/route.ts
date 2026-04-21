import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { data, error } = await supabase
    .from('users')
    .select('id, username, role, employee_id, created_at, employees(full_name)')
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  if (!body.username?.trim()) return NextResponse.json({ error: 'Username is required.' }, { status: 400 });
  if (!body.password || body.password.length < 6) return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 });
  if (!['admin', 'leader', 'worker'].includes(body.role)) return NextResponse.json({ error: 'Invalid role.' }, { status: 400 });

  const password_hash = await bcrypt.hash(body.password, 10);
  const { data, error } = await supabase.from('users').insert({
    username: body.username.trim().toLowerCase(),
    password_hash,
    role: body.role,
    employee_id: body.employee_id || null,
  }).select('id, username, role, employee_id').single();
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Username already exists.' }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
