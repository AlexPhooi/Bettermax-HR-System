import { NextRequest, NextResponse } from 'next/server';
import { getUser, isManager, isApprover } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { calcHoursAndDays } from '@/lib/utils';

// PATCH: approve / reject (admin/approval/owner) — also supports hours edit
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isApprover(user.role)) return NextResponse.json({ error: 'Approver/Admin/Owner only.' }, { status: 403 });

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

// PUT: edit a record (manager or original submitter only)
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Only managers or the editor who submitted this record can edit it
  if (!isManager(user.role)) {
    const { data: existing } = await supabase
      .from('hr_attendance').select('submitted_by').eq('id', params.id).single();
    if (!existing || existing.submitted_by !== user.id)
      return NextResponse.json({ error: 'Forbidden — you can only edit records you submitted.' }, { status: 403 });
  }

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

// DELETE: soft-delete — sends record to Bin, reverses any savings credit
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isManager(user.role)) return NextResponse.json({ error: 'Admin/Owner only.' }, { status: 403 });

  // Fetch record before deleting to check for savings credit to reverse
  const { data: rec } = await supabase.from('hr_attendance')
    .select('employee_id, status, site_bonus')
    .eq('id', params.id).single();

  // Soft-delete the attendance record
  const { error } = await supabase.from('hr_attendance')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // ── Reverse savings credit if this was an approved record with site bonus ──
  if (rec && rec.status === 'approved' && Number(rec.site_bonus) > 0) {
    const bonus = Number(rec.site_bonus);

    // Check if a savings credit exists for this attendance record
    const { data: savRow } = await supabase.from('savings')
      .select('id, amount')
      .eq('reference_id', params.id)
      .eq('type_detail', 'mission_bonus')
      .single();

    if (savRow) {
      // Recalculate current balance for this employee
      const { data: allRows } = await supabase.from('savings')
        .select('type, amount').eq('employee_id', rec.employee_id);
      const currentBal = (allRows || []).reduce((s, r) =>
        r.type === 'credit' ? s + Number(r.amount) : s - Number(r.amount), 0);
      const balanceAfter = Math.round((currentBal - bonus) * 100) / 100;

      // Insert reversal debit
      await supabase.from('savings').insert({
        employee_id:   rec.employee_id,
        type:          'debit',
        type_detail:   'mission_bonus_reversal',
        amount:        bonus,
        balance_after: balanceAfter,
        reason:        `Reversal — attendance record deleted`,
        reference_id:  params.id,
        month:         new Date().toISOString().slice(0, 7),
        created_by:    user.id,
      });

      // Sync employees.site_bonus_balance
      await supabase.from('employees')
        .update({ site_bonus_balance: Math.max(0, balanceAfter) })
        .eq('id', rec.employee_id);
    }
  }

  return NextResponse.json({ success: true });
}
