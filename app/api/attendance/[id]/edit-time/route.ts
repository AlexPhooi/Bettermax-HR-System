// POST /api/attendance/[id]/edit-time
// Admin edits check_in_time / check_out_time for a single record.
// Recalculates hours from the work schedule and writes an immutable audit entry.
import { NextRequest, NextResponse } from 'next/server';
import { getUser, isApprover } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { calcHoursFromTimes, DEFAULT_SCHEDULE, WorkSchedule } from '@/lib/work-schedule';

async function getSchedule(): Promise<WorkSchedule> {
  const { data } = await supabase
    .from('app_settings').select('value').eq('key', 'work_schedule').single();
  if (!data?.value) return DEFAULT_SCHEDULE;
  try { return JSON.parse(data.value) as WorkSchedule; } catch { return DEFAULT_SCHEDULE; }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isApprover(user.role))
    return NextResponse.json({ error: 'Admin / Approver only.' }, { status: 403 });

  const body = await req.json();
  const { check_in_time, check_out_time } = body;
  if (!check_in_time || !check_out_time)
    return NextResponse.json(
      { error: 'check_in_time and check_out_time required.' },
      { status: 400 },
    );

  // Fetch current record so we can log old values
  const { data: current, error: fetchErr } = await supabase
    .from('hr_attendance')
    .select('id, check_in_time, check_out_time, site_clean, hours_worked')
    .eq('id', params.id)
    .single();
  if (fetchErr || !current)
    return NextResponse.json({ error: 'Record not found.' }, { status: 404 });

  // Recalculate hours from the new times
  const schedule = await getSchedule();
  const { work_hours, ot_hours, days_worked } = calcHoursFromTimes(
    check_in_time, check_out_time, schedule,
  );

  // Update the attendance record
  const { data: updated, error: updateErr } = await supabase
    .from('hr_attendance')
    .update({ check_in_time, check_out_time, hours_worked: work_hours, ot_hours, days_worked })
    .eq('id', params.id)
    .select()
    .single();
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  // Write immutable audit entry (even if values are unchanged — captures intent)
  await supabase.from('hr_attendance_edits').insert({
    attendance_id:      params.id,
    edited_by:          user.id,
    old_check_in_time:  current.check_in_time  ?? null,
    new_check_in_time:  check_in_time,
    old_check_out_time: current.check_out_time ?? null,
    new_check_out_time: check_out_time,
  });

  return NextResponse.json(updated);
}
