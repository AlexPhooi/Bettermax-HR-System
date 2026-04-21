import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getUser, isManager } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isManager(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: Record<string, any> = {};

  if (body.password !== undefined) {
    if (body.password.length < 6) return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 });
    updates.password_hash = await bcrypt.hash(body.password, 10);
  }
  if (body.role !== undefined) {
    const validRoles = ['owner', 'admin', 'leader', 'worker'];
    if (!validRoles.includes(body.role)) return NextResponse.json({ error: 'Invalid role.' }, { status: 400 });
    // Only owner can assign owner/admin roles
    if ((body.role === 'owner' || body.role === 'admin') && user.role !== 'owner')
      return NextResponse.json({ error: 'Only the owner can assign owner or admin roles.' }, { status: 403 });
    updates.role = body.role;
  }
  if (body.active !== undefined) updates.active = body.active;
  if ('employee_id' in body) updates.employee_id = body.employee_id || null;

  if (!Object.keys(updates).length) return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });

  const { data, error } = await supabase.from('users')
    .update(updates).eq('id', params.id)
    .select('id, username, role, employee_id, active').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isManager(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (user.id === params.id) return NextResponse.json({ error: 'Cannot delete your own account.' }, { status: 400 });
  const { error } = await supabase.from('users').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
