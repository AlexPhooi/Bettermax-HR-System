import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import bcrypt from 'bcryptjs';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ user: { id: user.id, username: user.username, role: user.role, employee_id: user.employee_id || null } });
}

// Change own password
export async function PATCH(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { current_password, new_password } = await req.json();
  if (!current_password || !new_password)
    return NextResponse.json({ error: 'current_password and new_password required.' }, { status: 400 });
  if (new_password.length < 6)
    return NextResponse.json({ error: 'New password must be at least 6 characters.' }, { status: 400 });

  // Fetch current hash
  const { data: row, error } = await supabase.from('users').select('password_hash').eq('id', user.id).single();
  if (error || !row) return NextResponse.json({ error: 'User not found.' }, { status: 404 });

  const valid = await bcrypt.compare(current_password, row.password_hash);
  if (!valid) return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 400 });

  const hash = await bcrypt.hash(new_password, 10);
  const { error: upErr } = await supabase.from('users').update({ password_hash: hash }).eq('id', user.id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
