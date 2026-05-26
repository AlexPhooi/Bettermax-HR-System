import { NextRequest, NextResponse } from 'next/server';
import { getUser, isManager } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isManager(user.role)) return NextResponse.json({ error: 'Admin/Owner only.' }, { status: 403 });

  const project_id = req.nextUrl.searchParams.get('project_id');

  let query = supabase.from('project_bonus_pool')
    .select('*, projects(name, code), project_milestones(name, sequence_order)')
    .order('created_at', { ascending: false });

  if (project_id) query = query.eq('project_id', project_id);

  const { data: pools, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // For each pool, fetch allocations + worker count
  const poolIds = (pools || []).map(p => p.id);
  let allocMap: Record<string, { count: number; workers: { full_name: string; share_amount: number; status: string }[] }> = {};
  if (poolIds.length) {
    const { data: allocs } = await supabase.from('project_bonus_allocation')
      .select('bonus_pool_id, share_amount, status, employees(full_name)')
      .in('bonus_pool_id', poolIds);
    for (const a of allocs || []) {
      if (!allocMap[a.bonus_pool_id]) allocMap[a.bonus_pool_id] = { count: 0, workers: [] };
      allocMap[a.bonus_pool_id].count++;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const emp = a.employees as any;
      allocMap[a.bonus_pool_id].workers.push({
        full_name:    emp?.full_name || '—',
        share_amount: Number(a.share_amount),
        status:       a.status,
      });
    }
  }

  const result = (pools || []).map(p => ({
    ...p,
    allocations: allocMap[p.id] || { count: 0, workers: [] },
  }));

  // Worker bonus summary: sum of approved/distributed bonus per employee
  const { data: allAllocs } = await supabase.from('project_bonus_allocation')
    .select('employee_id, share_amount, status, employees(full_name, rank)')
    .in('status', ['approved', 'distributed']);

  const workerSummary: Record<string, { employee_id: string; full_name: string; rank: string; approved_total: number; distributed_total: number }> = {};
  for (const a of allAllocs || []) {
    const eid = a.employee_id;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const emp = a.employees as any;
    if (!workerSummary[eid]) {
      workerSummary[eid] = { employee_id: eid, full_name: emp?.full_name || '—', rank: emp?.rank || '—', approved_total: 0, distributed_total: 0 };
    }
    if (a.status === 'approved')     workerSummary[eid].approved_total    += Number(a.share_amount);
    if (a.status === 'distributed')  workerSummary[eid].distributed_total += Number(a.share_amount);
  }

  return NextResponse.json({
    pools: result,
    worker_summary: Object.values(workerSummary).sort((a, b) => b.approved_total - a.approved_total),
  });
}
