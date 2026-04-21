import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getUser, isManager } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isManager(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data, error } = await supabase
    .from('users')
    .select('id, username, role, employee_id, active, created_at, employees(id, full_name, rank, daily_rate, permit_expire, status)')
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isManager(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  if (!body.username?.trim()) return NextResponse.json({ error: 'Username is required.' }, { status: 400 });
  if (!body.password || body.password.length < 6) return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 });

  const validRoles = ['owner', 'admin', 'leader', 'worker'];
  if (!validRoles.includes(body.role)) return NextResponse.json({ error: 'Invalid role.' }, { status: 400 });

  // Only owner can create owner/admin accounts
  if ((body.role === 'owner' || body.role === 'admin') && user.role !== 'owner')
    return NextResponse.json({ error: 'Only the owner can create owner or admin accounts.' }, { status: 403 });

  const password_hash = await bcrypt.hash(body.password, 10);
  const { data, error } = await supabase.from('users').insert({
    username: body.username.trim().toLowerCase(),
    password_hash,
    role: body.role,
    employee_id: body.employee_id || null,
    active: true,
  }).select('id, username, role, employee_id, active').single();

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Username already exists.' }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
