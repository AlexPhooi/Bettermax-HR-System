// POST /api/savings/apply-interest
// Applies monthly compound interest to all active employees with a balance.
// Uses birthday_rate (double) if this month is the employee's birthday month.
// Idempotent: will not double-apply for the same month.
import { NextRequest, NextResponse } from 'next/server';
import { getUser, isManager } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  // Quick check: has interest been applied this month?
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const month = new Date().toISOString().slice(0, 7); // YYYY-MM
  const { count } = await supabase
    .from('savings')
    .select('id', { count: 'exact', head: true })
    .eq('type_detail', 'monthly_interest')
    .eq('month', month);

  return NextResponse.json({ applied_this_month: (count || 0) > 0, month });
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isManager(user.role)) return NextResponse.json({ error: 'Admin/Owner only.' }, { status: 403 });

  const now   = new Date();
  const month = now.toISOString().slice(0, 7); // YYYY-MM
  const currentMonthNum = now.getMonth() + 1;  // 1-12

  // Prevent double-apply for same month
  const { count: alreadyApplied } = await supabase
    .from('savings')
    .select('id', { count: 'exact', head: true })
    .eq('type_detail', 'monthly_interest')
    .eq('month', month);

  if ((alreadyApplied || 0) > 0)
    return NextResponse.json({ error: `Interest already applied for ${month}.` }, { status: 409 });

  // Get current interest rate + birthday rate
  const { data: settings } = await supabase
    .from('savings_settings')
    .select('interest_rate, birthday_rate')
    .lte('effective_from', now.toISOString().split('T')[0])
    .order('effective_from', { ascending: false })
    .limit(1)
    .single();
  const standardRate  = Number(settings?.interest_rate ?? 0.02);
  const birthdayRate  = Number(settings?.birthday_rate  ?? 0.04);

  // Get all active employees with date_of_birth
  const { data: employees } = await supabase
    .from('employees')
    .select('id, date_of_birth')
    .eq('status', 'active')
    .is('deleted_at', null);

  if (!employees || employees.length === 0)
    return NextResponse.json({ processed: 0, total_interest_credited: 0 });

  let processed      = 0;
  let totalInterest  = 0;
  let birthdayBonus  = 0;

  for (const emp of employees) {
    // Compute current balance from ledger
    const { data: rows } = await supabase
      .from('savings')
      .select('type, amount')
      .eq('employee_id', emp.id);

    const balance = (rows || []).reduce((s, r) =>
      r.type === 'credit' ? s + Number(r.amount) : s - Number(r.amount), 0);

    if (balance <= 0) continue; // No balance, no interest

    // Use birthday rate if this month is employee's birthday month
    const dobMonth = emp.date_of_birth ? Number(emp.date_of_birth.slice(5, 7)) : 0;
    const isBirthdayMonth = dobMonth > 0 && dobMonth === currentMonthNum;
    const rate = isBirthdayMonth ? birthdayRate : standardRate;

    const interest     = Math.round(balance * rate * 100) / 100;
    const balanceAfter = Math.round((balance + interest) * 100) / 100;
    const rateLabel    = isBirthdayMonth
      ? `🎂 Birthday month interest @ ${(rate * 100).toFixed(1)}%`
      : `Monthly interest @ ${(rate * 100).toFixed(1)}%`;

    const { error } = await supabase.from('savings').insert({
      employee_id:   emp.id,
      type:          'credit',
      type_detail:   'monthly_interest',
      amount:        interest,
      balance_after: balanceAfter,
      reason:        rateLabel,
      month,
      created_by:    user.id,
    });

    if (!error) {
      processed++;
      totalInterest += interest;
      if (isBirthdayMonth) birthdayBonus++;

      // Sync employees.site_bonus_balance
      await supabase.from('employees')
        .update({ site_bonus_balance: balanceAfter })
        .eq('id', emp.id);
    }
  }

  return NextResponse.json({
    processed,
    total_interest_credited: Math.round(totalInterest * 100) / 100,
    birthday_bonuses_applied: birthdayBonus,
    standard_rate:  standardRate,
    birthday_rate:  birthdayRate,
    month,
  });
}
