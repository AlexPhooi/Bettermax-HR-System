// PATCH /api/attendance/group
// Admin bulk-approves / bulk-rejects a group of records (same project+date session)
// On approval: auto-credits savings ledger for any site_bonus > 0
// Birthday month: x2 site bonus (RM20 instead of RM10)
import { NextRequest, NextResponse } from 'next/server';
import { getUser, isApprover } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export async function PATCH(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isApprover(user.role)) return NextResponse.json({ error: 'Approver/Admin/Owner only.' }, { status: 403 });

  const body = await req.json();
  const { ids, status, site_clean } = body;

  if (!Array.isArray(ids) || ids.length === 0)
    return NextResponse.json({ error: 'ids array required.' }, { status: 400 });
  if (!['approved', 'rejected'].includes(status))
    return NextResponse.json({ error: 'status must be approved or rejected.' }, { status: 400 });

  // Hours/days are already set per-worker via the complete or edit-time routes.
  // Approval only stamps status + site_clean/site_bonus.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: Record<string, any> = { status };

  if (site_clean !== undefined) {
    update.site_clean = Boolean(site_clean);
  }

  // Fetch attendance records with project + employee info (including date_of_birth for birthday bonus)
  const { data: records } = await supabase.from('hr_attendance')
    .select('id, hours_worked, employee_id, project_id, work_date, projects(name, code), employees(date_of_birth)')
    .in('id', ids);

  if (!records) {
    const { error } = await supabase.from('hr_attendance').update(update).in('id', ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ updated: ids.length });
  }

  const month = new Date().toISOString().slice(0, 7);

  // ── Compute per-record bonus in memory (no DB round-trips) ─────────────
  const recBonus = new Map<string, { bonus: number; isBirthdayMonth: boolean }>();
  for (const rec of records) {
    const effectiveHours = Number(rec.hours_worked);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const emp: any = rec.employees;
    const dob: string | null = emp?.date_of_birth ?? null;
    const workMonth = rec.work_date ? rec.work_date.slice(5, 7) : null;
    const dobMonth  = dob ? dob.slice(5, 7) : null;
    const isBirthdayMonth = Boolean(dobMonth && workMonth && dobMonth === workMonth);

    let bonus = 0;
    if (site_clean !== undefined && Boolean(site_clean) && effectiveHours >= 8) {
      bonus = isBirthdayMonth ? 20 : 10; // x2 on birthday month
    }
    recBonus.set(rec.id, { bonus, isBirthdayMonth });
  }

  // ── Batch the status/site_clean/site_bonus update — one query per distinct bonus value ──
  if (site_clean !== undefined) {
    const idsByBonus = new Map<number, string[]>();
    for (const rec of records) {
      const bonus = recBonus.get(rec.id)!.bonus;
      if (!idsByBonus.has(bonus)) idsByBonus.set(bonus, []);
      idsByBonus.get(bonus)!.push(rec.id);
    }
    await Promise.all(
      Array.from(idsByBonus.entries()).map(([bonus, ids]) =>
        supabase.from('hr_attendance').update({ ...update, site_bonus: bonus }).in('id', ids)
      )
    );
  } else {
    await supabase.from('hr_attendance').update(update).in('id', ids);
  }

  // ── Auto-credit savings on approval — batched, not per-record ──────────
  let savingsCredited  = 0;
  let birthdayBonuses  = 0;

  if (status === 'approved') {
    const bonusRecs = records.filter(rec => (recBonus.get(rec.id)?.bonus || 0) > 0);

    if (bonusRecs.length > 0) {
      const employeeIds = Array.from(new Set(bonusRecs.map(r => r.employee_id)));

      const [{ data: savRows }, { data: alreadyCredited }] = await Promise.all([
        supabase.from('savings').select('employee_id, type, amount').in('employee_id', employeeIds),
        supabase.from('savings').select('reference_id')
          .in('reference_id', bonusRecs.map(r => r.id)).eq('type_detail', 'mission_bonus'),
      ]);

      const creditedIds = new Set((alreadyCredited || []).map(r => r.reference_id));
      const balances = new Map<string, number>();
      for (const empId of employeeIds) {
        const bal = (savRows || [])
          .filter(r => r.employee_id === empId)
          .reduce((s, r) => r.type === 'credit' ? s + Number(r.amount) : s - Number(r.amount), 0);
        balances.set(empId, bal);
      }

      const newSavings: {
        employee_id: string; type: string; type_detail: string; amount: number;
        balance_after: number; reason: string; reference_id: string; month: string; created_by: string;
      }[] = [];

      for (const rec of bonusRecs) {
        if (creditedIds.has(rec.id)) continue; // idempotent — already credited
        const { bonus, isBirthdayMonth } = recBonus.get(rec.id)!;
        const balanceAfter = Math.round(((balances.get(rec.employee_id) || 0) + bonus) * 100) / 100;
        balances.set(rec.employee_id, balanceAfter);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const proj: any = rec.projects;
        const projectName  = proj?.name || proj?.code || 'Site';
        const bonusLabel   = isBirthdayMonth
          ? `🎂 Birthday bonus — ${projectName} (${rec.work_date})`
          : `Site bonus — ${projectName} (${rec.work_date})`;

        newSavings.push({
          employee_id:   rec.employee_id,
          type:          'credit',
          type_detail:   'mission_bonus',
          amount:        bonus,
          balance_after: balanceAfter,
          reason:        bonusLabel,
          reference_id:  rec.id,
          month,
          created_by:    user.id,
        });
        savingsCredited++;
        if (isBirthdayMonth) birthdayBonuses++;
      }

      if (newSavings.length > 0) {
        await Promise.all([
          supabase.from('savings').insert(newSavings),
          // Keep employees.site_bonus_balance in sync — one update per employee, in parallel
          ...Array.from(balances.entries()).map(([empId, bal]) =>
            supabase.from('employees').update({ site_bonus_balance: bal }).eq('id', empId)
          ),
        ]);
      }
    }
  }

  return NextResponse.json({
    updated:          records.length,
    savings_credited: savingsCredited,
    birthday_bonuses: birthdayBonuses,
  });
}
