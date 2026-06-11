import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { calcHoursAndDays } from '@/lib/utils';
import { calcHoursFromTimes, DEFAULT_SCHEDULE } from '@/lib/work-schedule';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  let query = supabase.from('hr_attendance')
    .select('*, employees(full_name, daily_rate), projects(name, code)')
    .is('deleted_at', null)
    .order('work_date', { ascending: false });

  // Date / month filter
  const date  = sp.get('date');
  const month = sp.get('month');
  if (date) {
    query = query.eq('work_date', date);
  } else if (month) {
    const [y, m] = month.split('-');
    query = query.gte('work_date', `${month}-01`)
      .lte('work_date', new Date(+y, +m, 0).toISOString().split('T')[0]);
  }

  // Optional status filter
  const statusFilter = sp.get('status');
  if (statusFilter) query = query.eq('status', statusFilter);

  // Role-based visibility
  if (user.role === 'viewer') {
    // Viewers see only their own records
    if (!user.employee_id) return NextResponse.json([]);
    query = query.eq('employee_id', user.employee_id);

  } else if (user.role === 'editor') {
    const mode = sp.get('mode');
    if (mode === 'personal' && user.employee_id) {
      // Leader's own attendance records (for My Attendance page)
      query = query.eq('employee_id', user.employee_id);
    } else {
      // Leader sees records submitted by themselves (team management)
      query = query.eq('submitted_by', user.id);
      // Allow filtering by project (e.g. auto-select yesterday's workers per site)
      if (sp.get('project_id')) query = query.eq('project_id', sp.get('project_id')!);
    }
  } else if (user.role === 'approval') {
    const mode = sp.get('mode');
    if (mode === 'personal' && user.employee_id) {
      // Approval role viewing own attendance (My Attendance page)
      query = query.eq('employee_id', user.employee_id);
    }
    // No mode=personal → sees all records (for Attendance approval page)
  } else {
    // Admin / owner: apply optional filters
    if (sp.get('employee_id')) query = query.eq('employee_id', sp.get('employee_id')!);
    if (sp.get('project_id'))  query = query.eq('project_id',  sp.get('project_id')!);
  }

  const limitParam = sp.get('limit');
  if (limitParam) query = query.limit(Number(limitParam));

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role === 'viewer') return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });

  const body = await req.json();
  const ids: string[] = body.employee_ids?.length ? body.employee_ids : (body.employee_id ? [body.employee_id] : []);
  if (!ids.length)      return NextResponse.json({ error: 'At least one employee required.' }, { status: 400 });
  if (!body.work_date)  return NextResponse.json({ error: 'Work date is required.' }, { status: 400 });

  // ── Check-in (draft) mode ──────────────────────────────────────────
  const isDraft = body.status === 'draft';

  if (isDraft) {
    // Morning check-in: just project, date, workers, check-in photo
    const inserted: unknown[] = [];
    const skipped: string[] = [];
    for (const employee_id of ids) {
      const { data, error } = await supabase.from('hr_attendance').insert({
        employee_id,
        project_id:        body.project_id || null,
        work_date:         body.work_date,
        hours_worked:      0,
        days_worked:       0,
        ot_hours:          0,
        status:            'draft',
        submitted_by:      user.id,
        site_clean:        false,
        site_bonus:        0,
        check_in_photo_url: body.check_in_photo_url || null,
        notes:             body.notes?.trim() || null,
      }).select().single();
      if (error) {
        if (error.code === '23505') skipped.push(employee_id);
        else return NextResponse.json({ error: error.message }, { status: 500 });
      } else inserted.push(data);
    }
    return NextResponse.json({ inserted, skipped });
  }

  // ── Full submission (pending) mode ─────────────────────────────────
  // Supports both new (work_hours/ot_hours) and legacy (clock_in/clock_out) input
  let hours_worked: number;
  let days_worked: number;
  let ot_hours = Number(body.ot_hours) || 0;
  let clock_in: string | null  = null;
  let clock_out: string | null = null;

  if (body.check_in_time && body.check_out_time) {
    // Admin time-picker flow: schedule-aware calculation
    const calc = calcHoursFromTimes(body.check_in_time, body.check_out_time, DEFAULT_SCHEDULE);
    hours_worked = calc.work_hours + calc.ot_hours;
    ot_hours     = calc.ot_hours;
    days_worked  = calc.days_worked;
  } else if (body.work_hours) {
    // Leader flow: direct hours entry
    const work_hours = Number(body.work_hours);
    hours_worked = work_hours + ot_hours;
    days_worked  = hours_worked / 8;
  } else if (body.clock_in && body.clock_out) {
    // Legacy clock-time flow
    const calc = calcHoursAndDays(body.work_date, body.clock_in, body.clock_out);
    if (!calc) return NextResponse.json({ error: 'Clock out must be after clock in.' }, { status: 400 });
    hours_worked = calc.hours;
    days_worked  = calc.days;
    clock_in     = calc.clock_in;
    clock_out    = calc.clock_out;
  } else {
    return NextResponse.json({ error: 'Provide check_in_time/check_out_time or work_hours.' }, { status: 400 });
  }

  // Detect rework
  let is_rework = false;
  if (body.project_id) {
    const { data: proj } = await supabase.from('projects').select('status').eq('id', body.project_id).single();
    if (proj?.status === 'completed') {
      is_rework = true;
      if (!body.notes?.trim()) {
        return NextResponse.json({ error: 'Rework remark required for completed projects.' }, { status: 400 });
      }
    }
  }

  // Managers can set status directly (e.g. 'approved' for manual entry)
  const { isManager: checkManager } = await import('@/lib/auth');
  const recordStatus = checkManager(user.role) && body.status === 'approved' ? 'approved' : 'pending';

  // Site bonus for manual approved entry
  const site_clean = Boolean(body.site_clean);
  const site_bonus = site_clean && hours_worked >= 8 ? 10 : 0;

  const inserted: unknown[] = [];
  const skipped: string[] = [];
  for (const employee_id of ids) {
    const { data, error } = await supabase.from('hr_attendance').insert({
      employee_id,
      project_id:           body.project_id || null,
      work_date:            body.work_date,
      check_in_time:        body.check_in_time  || null,
      check_out_time:       body.check_out_time || null,
      clock_in,
      clock_out,
      hours_worked,
      days_worked,
      ot_hours,
      notes:                body.notes?.trim() || null,
      is_rework,
      status:               recordStatus,
      submitted_by:         user.id,
      site_clean,
      site_bonus:           recordStatus === 'approved' ? site_bonus : 0,
      check_in_photo_url:   body.check_in_photo_url  || null,
      check_out_photo_url:  body.check_out_photo_url || null,
      site_photo_front_url: body.site_photo_front_url || null,
      site_photo_back_url:  body.site_photo_back_url  || null,
      site_photo_store_url: body.site_photo_store_url || null,
    }).select().single();
    if (error) {
      if (error.code === '23505') skipped.push(employee_id);
      else return NextResponse.json({ error: error.message }, { status: 500 });
    } else inserted.push(data);
  }
  return NextResponse.json({ inserted, skipped });
}
