// GET /api/savings  — summary of all employees' savings balances
import { NextRequest, NextResponse } from 'next/server';
import { getUser, isManager } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { employee_id: qEmpId } = Object.fromEntries(req.nextUrl.searchParams);

  // Workers can only see their own
  const empIdFilter = !isManager(user.role) ? user.employee_id : (qEmpId || null);

  // Fetch active employees
  let empQ = supabase
    .from('employees')
    .select('id, full_name, rank, daily_rate, status, site_bonus_balance')
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('full_name');
  if (empIdFilter) empQ = empQ.eq('id', empIdFilter);
  const { data: employees, error: empErr } = await empQ;
  if (empErr) return NextResponse.json({ error: empErr.message }, { status: 500 });

  // Fetch all savings rows
  let savQ = supabase
    .from('savings')
    .select('employee_id, type, type_detail, amount, balance_after, created_at, month');
  if (empIdFilter) savQ = savQ.eq('employee_id', empIdFilter);
  const { data: rows } = await savQ;
  const savings = rows || [];

  // Build per-employee summary
  const summary = (employees || []).map(emp => {
    const empRows = savings.filter(r => r.employee_id === emp.id);
    const credits  = empRows.filter(r => r.type === 'credit');
    const debits   = empRows.filter(r => r.type === 'debit');
    const totalCredits  = credits.reduce((s, r) => s + Number(r.amount), 0);
    const totalDebits   = debits.reduce((s, r) => s + Number(r.amount), 0);
    const currentBal    = totalCredits - totalDebits;
    const interestEarned = credits
      .filter(r => r.type_detail === 'monthly_interest')
      .reduce((s, r) => s + Number(r.amount), 0);
    const totalWithdrawn = totalDebits;

    // Months saving = distinct months with any credit activity
    const months = new Set(credits.map(r => r.month).filter(Boolean));
    const monthsSaving = months.size;

    // Projected 12mo at 2% compounded + avg monthly bonus
    const rate = 0.02;
    const avgMonthlyBonus = monthsSaving > 0
      ? credits.filter(r => r.type_detail === 'mission_bonus').reduce((s, r) => s + Number(r.amount), 0) / Math.max(monthsSaving, 1)
      : 0;
    let proj = currentBal;
    for (let i = 0; i < 12; i++) {
      proj = proj * (1 + rate) + avgMonthlyBonus;
    }

    // Last credit date
    const sorted = [...empRows].sort((a, b) => b.created_at > a.created_at ? 1 : -1);
    const lastActivity = sorted[0]?.created_at ?? null;

    return {
      employee_id:      emp.id,
      full_name:        emp.full_name,
      rank:             emp.rank,
      daily_rate:       emp.daily_rate,
      months_saving:    monthsSaving,
      total_contributed: credits.filter(r => r.type_detail === 'mission_bonus').reduce((s, r) => s + Number(r.amount), 0),
      interest_earned:  interestEarned,
      total_withdrawn:  totalWithdrawn,
      current_balance:  Math.round(currentBal * 100) / 100,
      projected_12mo:   Math.round(proj * 100) / 100,
      last_activity:    lastActivity,
    };
  });

  return NextResponse.json(summary);
}
