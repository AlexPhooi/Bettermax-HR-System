import { NextRequest, NextResponse } from 'next/server';
import { getUser, isManager } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { calcHoursAndDays } from '@/lib/utils';

// PATCH: approve / reject (admin only) — also supports hours edit
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isManager(user.role)) return NextResponse.json({ error: 'Admin/Owner only.' }, { status: 403 });

  const body = await req.json();
  const { status, site_clean, work_hours, ot_hours } = body;

  if (!['approved', 'rejected'].includes(status))
    return NextResponse.json({ error: 'Status must be approved or rejected.' }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: Record<string, any> = { status };

  if (work_hours && Number(work_hours) >= 1) {
    const total = Number(work_hours) + (Number(ot_hours) || 0);
    update.hours_worked = total;
    update.days_worked  = total / 8;
    update.ot_hours     = Number(ot_hours) || 0;
  }

  if (site_clean !== undefined) {
    update.site_clean = Boolean(site_clean);
    const effectiveHours = update.hours_worked;
    if (effectiveHours !== undefined) {
      update.site_bonus = Boolean(site_clean) && effectiveHours >= 8 ? 10 : 0;
    } else {
      const { data: rec } = await supabase.from('hr_attendance').select('hours_worked').eq('id', params.id).single();
      update.site_bonus = Boolean(site_clean) && Number(rec?.hours_worked) >= 8 ? 10 : 0;
    }
  }

  const { data, error } = await supabase.from('hr_attendance')
    .update(update).eq('id', params.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// PUT: edit a record
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  let hours_worked: number | undefined;
  let days_worked: number | undefined;
  let ot_hours: number | undefined;
  let clock_in: string | null  = null;
  let clock_out: string | null = null;

  if (body.work_hours) {
    ot_hours     = Number(body.ot_hours) || 0;
    hours_worked = Number(body.work_hours) + ot_hours;
    days_worked  = hours_worked / 8;
  } else if (body.clock_in && body.clock_out && body.work_date) {
    const calc = calcHoursAndDays(body.work_date, body.clock_in, body.clock_out);
    if (!calc) return NextResponse.json({ error: 'Clock out must be after clock in.' }, { status: 400 });
    hours_worked = calc.hours; days_worked = calc.days; clock_in = calc.clock_in; clock_out = calc.clock_out;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: Record<string, any> = {
    employee_id: body.employee_id, project_id: body.project_id || null,
    work_date: body.work_date, notes: body.notes?.trim() || null,
  };
  if (hours_worked !== undefined) { update.hours_worked = hours_worked; update.days_worked = days_worked; }
  if (ot_hours !== undefined)     update.ot_hours = ot_hours;
  if (clock_in)  update.clock_in  = clock_in;
  if (clock_out) update.clock_out = clock_out;

  const { data, error } = await supabase.from('hr_attendance').update(update).eq('id', params.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE: soft-delete — sends record to Bin
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isManager(user.role)) return NextResponse.json({ error: 'Admin/Owner only.' }, { status: 403 });

  const { error } = await supabase.from('hr_attendance')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
