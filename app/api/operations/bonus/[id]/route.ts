import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

// PUT — approve or distribute a bonus pool
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'owner') return NextResponse.json({ error: 'Owner only.' }, { status: 403 });

  const body = await req.json();
  const { action, milestone_contract_value } = body;

  // ── Update milestone_contract_value + recalc pool ──────────────────
  if (milestone_contract_value !== undefined) {
    const mcv   = Number(milestone_contract_value);
    const { data: pool } = await supabase.from('project_bonus_pool').select('bonus_percent').eq('id', params.id).single();
    const pct   = Number(pool?.bonus_percent || 5);
    const total = Math.round(mcv * pct / 100 * 100) / 100;

    const { data, error } = await supabase.from('project_bonus_pool')
      .update({ milestone_contract_value: mcv, total_bonus_pool: total })
      .eq('id', params.id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  // ── Approve ────────────────────────────────────────────────────────
  if (action === 'approve') {
    const { data, error } = await supabase.from('project_bonus_pool')
      .update({ status: 'approved', approved_by: user.id, approved_at: new Date().toISOString() })
      .eq('id', params.id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Create allocation records for workers currently on the project
    const pool = data;
    if (pool && Number(pool.total_bonus_pool) > 0) {
      const { data: allocs } = await supabase.from('worker_project_allocation')
        .select('employee_id').eq('project_id', pool.project_id).is('released_date', null);
      const workers = allocs || [];
      if (workers.length > 0) {
        const share = Math.round(Number(pool.total_bonus_pool) / workers.length * 100) / 100;
        await supabase.from('project_bonus_allocation').insert(
          workers.map(w => ({
            bonus_pool_id: pool.id,
            employee_id:   w.employee_id,
            share_amount:  share,
            status:        'approved',
          }))
        );
      }
    }
    return NextResponse.json(data);
  }

  // ── Distribute (mark as paid) ──────────────────────────────────────
  if (action === 'distribute') {
    // Mark pool as distributed
    const { data, error } = await supabase.from('project_bonus_pool')
      .update({ status: 'distributed' })
      .eq('id', params.id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Mark all allocations as distributed
    await supabase.from('project_bonus_allocation')
      .update({ status: 'distributed', paid_date: new Date().toISOString().split('T')[0] })
      .eq('bonus_pool_id', params.id);

    return NextResponse.json(data);
  }

  return NextResponse.json({ error: 'Invalid action. Use approve or distribute.' }, { status: 400 });
}
