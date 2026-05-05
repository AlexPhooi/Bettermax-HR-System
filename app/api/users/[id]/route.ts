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

  // Username — admin/owner only
  if (body.username !== undefined) {
    const newUsername = body.username.trim().toLowerCase();
    if (!newUsername) return NextResponse.json({ error: 'Username cannot be empty.' }, { status: 400 });
    if (!/^[a-z0-9_]+$/.test(newUsername))
      return NextResponse.json({ error: 'Username may only contain letters, numbers and underscores.' }, { status: 400 });
    updates.username = newUsername;
  }

  if (body.password !== undefined) {
    if (body.password.length < 6) return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 });
    // Admin/owner force-resetting another user's password — no self-verification needed
    // If changing own password, still require current password for safety
    const isSelf = user.id === params.id;
    if (isSelf) {
      if (!body.current_password) return NextResponse.json({ error: 'Your current password is required to change your own password.' }, { status: 400 });
      const { data: me } = await supabase.from('users').select('password_hash').eq('id', user.id).single();
      const valid = me && await bcrypt.compare(body.current_password, me.password_hash);
      if (!valid) return NextResponse.json({ error: 'Your current password is incorrect.' }, { status: 403 });
    }
    updates.password_hash = await bcrypt.hash(body.password, 10);
  }
  if (body.role !== undefined) {
    const validRoles = ['owner', 'admin', 'approval', 'editor', 'viewer'];
    if (!validRoles.includes(body.role)) return NextResponse.json({ error: 'Invalid role.' }, { status: 400 });
    if ((body.role === 'owner' || body.role === 'admin' || body.role === 'approval') && user.role !== 'owner' && user.role !== 'admin')
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

  // Cannot delete self
  if (user.id === params.id)
    return NextResponse.json({ error: 'You cannot delete your own account.' }, { status: 400 });

  // Fetch target to check role + linked employee
  const { data: target } = await supabase.from('users')
    .select('role, employee_id').eq('id', params.id).single();
  if (!target) return NextResponse.json({ error: 'User not found.' }, { status: 404 });

  // Admin cannot delete Admin or Owner accounts
  if (user.role === 'admin' && (target.role === 'admin' || target.role === 'owner'))
    return NextResponse.json({ error: 'Admin cannot delete Admin or Owner accounts.' }, { status: 403 });

  // Owner cannot delete other Owner accounts
  if (user.role === 'owner' && target.role === 'owner')
    return NextResponse.json({ error: 'Owner accounts cannot be deleted.' }, { status: 403 });

  const now = new Date().toISOString();

  // Soft-delete the user
  const { error } = await supabase.from('users').update({ deleted_at: now }).eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Soft-delete the linked employee record (if any)
  if (target.employee_id) {
    await supabase.from('employees').update({ deleted_at: now }).eq('id', target.employee_id);
  }

  return NextResponse.json({ success: true });
}
