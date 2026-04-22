import { NextRequest, NextResponse } from 'next/server';
import { getUser, isManager } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

// PATCH: restore a soft-deleted item
// Body: { type: 'staff' | 'employee' | 'attendance' | 'salary', id: string }
export async function PATCH(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isManager(user.role)) return NextResponse.json({ error: 'Admin/Owner only.' }, { status: 403 });

  const { type, id } = await req.json();
  if (!type || !id) return NextResponse.json({ error: 'type and id are required.' }, { status: 400 });

  const clear = { deleted_at: null };

  if (type === 'staff') {
    // Restore user account
    const { error } = await supabase.from('users').update(clear).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Also restore linked employee if they were deleted at (roughly) the same time
    const { data: usr } = await supabase.from('users').select('employee_id').eq('id', id).single();
    if (usr?.employee_id) {
      await supabase.from('employees').update(clear).eq('id', usr.employee_id);
    }
    return NextResponse.json({ success: true });
  }

  if (type === 'employee') {
    const { error } = await supabase.from('employees').update(clear).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (type === 'attendance') {
    const { error } = await supabase.from('hr_attendance').update(clear).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (type === 'salary') {
    const { error } = await supabase.from('salary_records').update(clear).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Invalid type.' }, { status: 400 });
}
