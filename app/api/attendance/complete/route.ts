// PATCH /api/attendance/complete
// Leader completes today's draft records → sets check-in/out times, calculates hours, status='pending'
import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { calcHoursFromTimes, DEFAULT_SCHEDULE, WorkSchedule } from '@/lib/work-schedule';

interface WorkerPayload {
  employee_id:    string;
  check_in_time:  string; // "HH:MM"
  check_out_time: string; // "HH:MM"
}

async function getSchedule(): Promise<WorkSchedule> {
  const { data } = await supabase.from('app_settings').select('value').eq('key', 'work_schedule').single();
  if (!data?.value) return DEFAULT_SCHEDULE;
  try { return JSON.parse(data.value) as WorkSchedule; } catch { return DEFAULT_SCHEDULE; }
}

export async function PATCH(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role === 'viewer') return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });

  const body = await req.json();
  const {
    project_id,
    work_date,
    workers     = [] as WorkerPayload[],
    new_workers = [] as WorkerPayload[],
    check_out_photo_url,
    site_photo_front_url,
    site_photo_back_url,
    site_photo_store_url,
  } = body;

  if (!work_date) return NextResponse.json({ error: 'work_date required.' }, { status: 400 });
  if (!workers.length && !new_workers.length)
    return NextResponse.json({ error: 'No workers provided.' }, { status: 400 });

  const schedule = await getSchedule();

  const sharedPhotos = {
    check_out_photo_url:  check_out_photo_url  || null,
    site_photo_front_url: site_photo_front_url || null,
    site_photo_back_url:  site_photo_back_url  || null,
    site_photo_store_url: site_photo_store_url || null,
  };

  // ── 1. Fetch draft records for this session ──────────────────────────
  let draftQuery = supabase.from('hr_attendance')
    .select('id, employee_id')
    .eq('work_date', work_date)
    .eq('status', 'draft')
    .eq('submitted_by', user.id);

  if (project_id) draftQuery = draftQuery.eq('project_id', project_id);

  const { data: drafts, error: findErr } = await draftQuery;
  if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 });

  const draftMap = new Map<string, string>((drafts || []).map(d => [d.employee_id, d.id]));

  // ── 2. Update existing draft records individually ────────────────────
  let updated = 0;
  for (const w of workers as WorkerPayload[]) {
    const id = draftMap.get(w.employee_id);
    if (!id) continue;
    const { work_hours, ot_hours, days_worked } = calcHoursFromTimes(
      w.check_in_time, w.check_out_time, schedule
    );
    const { error } = await supabase.from('hr_attendance').update({
      check_in_time:  w.check_in_time,
      check_out_time: w.check_out_time,
      hours_worked:   work_hours,
      ot_hours,
      days_worked,
      status: 'pending',
      ...sharedPhotos,
    }).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    updated++;
  }

  // ── 3. Insert late-join workers directly as pending ──────────────────
  if ((new_workers as WorkerPayload[]).length > 0) {
    const inserts = (new_workers as WorkerPayload[]).map(w => {
      const { work_hours, ot_hours, days_worked } = calcHoursFromTimes(
        w.check_in_time, w.check_out_time, schedule
      );
      return {
        employee_id:    w.employee_id,
        project_id:     project_id || null,
        work_date,
        check_in_time:  w.check_in_time,
        check_out_time: w.check_out_time,
        hours_worked:   work_hours,
        ot_hours,
        days_worked,
        status:         'pending',
        submitted_by:   user.id,
        ...sharedPhotos,
      };
    });
    const { error: insErr } = await supabase.from('hr_attendance').insert(inserts);
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
    updated += inserts.length;
  }

  if (updated === 0)
    return NextResponse.json({ error: 'No matching draft records found for this session.' }, { status: 404 });

  return NextResponse.json({ updated });
}
