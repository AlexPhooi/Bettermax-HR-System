import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { supabase } from '@/lib/supabase';
import { signToken } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();
  if (!username?.trim() || !password)
    return NextResponse.json({ error: 'Username and password required.' }, { status: 400 });

  const { data: users } = await supabase.from('users').select('*').eq('username', username.trim()).limit(1);
  const user = users?.[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash)))
    return NextResponse.json({ error: 'Invalid username or password.' }, { status: 401 });

  // Block deactivated accounts
  if (user.active === false)
    return NextResponse.json({ error: 'Your account has been deactivated. Please contact your manager.' }, { status: 403 });

  const token = await signToken({ id: user.id, username: user.username, role: user.role, employee_id: user.employee_id || null });
  const res = NextResponse.json({ success: true, user: { username: user.username, role: user.role, employee_id: user.employee_id || null } });
  res.cookies.set('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 8 * 60 * 60,
    path: '/',
  });
  return res;
}
