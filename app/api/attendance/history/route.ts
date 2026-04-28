// GET /api/attendance/history?ids=id1,id2,...
// Returns the immutable edit audit log for the given attendance record IDs.
// Admin / approver only. Ordered newest first.
import { NextRequest, NextResponse } from 'next/server';
import { getUser, isApprover } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isApprover(user.role))
    return NextResponse.json({ error: 'Admin / Approver only.' }, { status: 403 });

  const ids = (req.nextUrl.searchParams.get('ids') || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  if (!ids.length) return NextResponse.json([]);

  const { data, error } = await supabase
    .from('hr_attendance_edits')
    .select('id, attendance_id, edited_at, old_check_in_time, new_check_in_time, old_check_out_time, new_check_out_time, users(username)')
    .in('attendance_id', ids)
    .order('edited_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}
