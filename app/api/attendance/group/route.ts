// PATCH /api/attendance/group
// Admin bulk-approves / bulk-rejects a group of records (same project+date session)
// On approval: auto-credits savings ledger for any site_bonus > 0
import { NextRequest, NextResponse } from 'next/server';
import { getUser, isManager } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export async function PATCH(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isManager(user.role)) return NextResponse.json({ error: 'Admin/Owner only.' }, { status: 403 });

  const body = await req.json();
  const { ids, status, site_clean, work_hours, ot_hours } = body;

  if (!Array.isArray(ids) || ids.length === 0)
    return NextResponse.json({ error: 'ids array required.' }, { status: 400 });
  if (!['approved', 'rejected'].includes(status))
    return NextResponse.json({ error: 'status must be approved or rejected.' }, { status: 400 });

  // Build update payload
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: Record<string, any> = { status };

  if (site_clean !== undefined) {
    update.site_clean = Boolean(site_clean);
  }

  if (work_hours && Number(work_hours) >= 1) {
    const total_hours = Number(work_hours) + (Number(ot_hours) || 0);
    update.hours_worked = total_hours;
    update.days_worked  = total_hours / 8;
    update.ot_hours     = Number(ot_hours) || 0;
  }

  // Fetch attendance records with project + employee info
  const { data: records } = await supabase.from('hr_attendance')
    .select('id, hours_worked, employee_id, project_id, work_date, projects(name, code)')
    .in('id', ids);

  if (!records) {
    const { error } = await supabase.from('hr_attendance').update(update).in('id', ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ updated: ids.length });
  }

  // Update each record with correct site_bonus
  let savingsCredited = 0;
  const month = new Date().toISOString().slice(0, 7);

  for (const rec of records) {
    const effectiveHours = update.hours_worked ?? Number(rec.hours_worked);
    const bonus = (site_clean !== undefined)
      ? (Boolean(site_clean) && effectiveHours >= 8 ? 10 : 0)
      : 0;

    const recUpdate = site_clean !== undefined
      ? { ...update, site_bonus: bonus }
      : update;

    await supabase.from('hr_attendance').update(recUpdate).eq('id', rec.id);

    // ── Auto-credit savings on approval ──────────────────────────────
    if (status === 'approved' && bonus > 0) {
      // Get current savings balance for this employee
      const { data: savRows } = await supabase
        .from('savings')
        .select('type, amount')
        .eq('employee_id', rec.employee_id);

      const currentBal = (savRows || []).reduce((s, r) =>
        r.type === 'credit' ? s + Number(r.amount) : s - Number(r.amount), 0);
      const balanceAfter = Math.round((currentBal + bonus) * 100) / 100;

      // Check if this attendance record already credited (idempotent)
      const { count: existing } = await supabase
        .from('savings')
        .select('id', { count: 'exact', head: true })
        .eq('reference_id', rec.id)
        .eq('type_detail', 'mission_bonus');

      if ((existing || 0) === 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const proj: any = rec.projects;
        const projectName = proj?.name || proj?.code || 'Site';
        const dateStr = rec.work_date;

        await supabase.from('savings').insert({
          employee_id:   rec.employee_id,
          type:          'credit',
          type_detail:   'mission_bonus',
          amount:        bonus,
          balance_after: balanceAfter,
          reason:        `Site bonus — ${projectName} (${dateStr})`,
          reference_id:  rec.id,
          month,
          created_by:    user.id,
        });

        // Keep employees.site_bonus_balance in sync
        await supabase.from('employees')
          .update({ site_bonus_balance: balanceAfter })
          .eq('id', rec.employee_id);

        savingsCredited++;
      }
    }
  }

  return NextResponse.json({
    updated:          records.length,
    savings_credited: savingsCredited,
  });
}
