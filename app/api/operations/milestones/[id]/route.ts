import { NextRequest, NextResponse } from 'next/server';
import { getUser, isManager } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isManager(user.role) && user.role !== 'editor')
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });

  const body = await req.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: Record<string, any> = { updated_at: new Date().toISOString() };

  if (body.name !== undefined)            update.name = body.name?.trim();
  if (body.status !== undefined)          update.status = body.status;
  if (body.planned_start !== undefined)   update.planned_start = body.planned_start || null;
  if (body.planned_end !== undefined)     update.planned_end = body.planned_end || null;
  if (body.actual_start !== undefined)    update.actual_start = body.actual_start || null;
  if (body.actual_end !== undefined)      update.actual_end = body.actual_end || null;
  if (body.sequence_order !== undefined)  update.sequence_order = Number(body.sequence_order);
  if (body.notes !== undefined)           update.notes = body.notes?.trim() || null;
  if (body.completion_pct !== undefined)  update.completion_pct = Number(body.completion_pct);

  // Auto-derive status from completion_pct if status not explicitly set
  if (body.completion_pct !== undefined && body.status === undefined) {
    const pct = Number(body.completion_pct);
    if (pct === 0)        update.status = 'pending';
    else if (pct === 100) update.status = 'completed';
    else                  update.status = 'in_progress';
  }

  // If marking complete, set actual_end to today if not set
  if (body.status === 'completed' && !body.actual_end) {
    update.actual_end = new Date().toISOString().split('T')[0];
  }

  // Auto-set actual_start when moving to in_progress
  if (body.status === 'in_progress' && !body.actual_start) {
    const { data: cur } = await supabase.from('project_milestones')
      .select('actual_start').eq('id', params.id).single();
    if (!cur?.actual_start) update.actual_start = new Date().toISOString().split('T')[0];
  }

  const { data: milestone, error } = await supabase.from('project_milestones')
    .update(update).eq('id', params.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // ── Auto-recalculate project progress_percent ─────────────────────
  if (milestone) {
    const { data: allPhases } = await supabase
      .from('project_milestones')
      .select('completion_pct, status')
      .eq('project_id', milestone.project_id);

    if (allPhases && allPhases.length > 0) {
      // Use completion_pct if set, else derive from status
      const pcts = allPhases.map(p => {
        if (p.completion_pct != null) return p.completion_pct;
        if (p.status === 'completed')  return 100;
        if (p.status === 'in_progress') return 50;
        return 0;
      });
      const avg = Math.round(pcts.reduce((s, v) => s + v, 0) / pcts.length);
      await supabase.from('projects')
        .update({ progress_percent: avg })
        .eq('id', milestone.project_id);
    }
  }

  // ── Bonus pool logic on completion ────────────────────────────────
  if (body.status === 'completed' && milestone) {
    const mcv = Number(body.milestone_contract_value || 0);

    // Check if bonus pool already exists
    const { data: existingPool } = await supabase.from('project_bonus_pool')
      .select('id, status').eq('milestone_id', params.id).single();

    if (existingPool) {
      // Update status to pending_approval if not already approved/distributed
      if (existingPool.status === 'locked') {
        await supabase.from('project_bonus_pool')
          .update({
            status:         'pending_approval',
            completed_date: update.actual_end,
            ...(mcv > 0 ? {
              milestone_contract_value: mcv,
              total_bonus_pool: Math.round(mcv * 5 / 100 * 100) / 100,
            } : {}),
          })
          .eq('id', existingPool.id);
      }
    } else if (mcv > 0) {
      // Create new bonus pool
      await supabase.from('project_bonus_pool').insert({
        project_id:              milestone.project_id,
        milestone_id:            params.id,
        milestone_contract_value: mcv,
        bonus_percent:           5,
        total_bonus_pool:        Math.round(mcv * 5 / 100 * 100) / 100,
        status:                  'pending_approval',
        completed_date:          update.actual_end,
      });
    }
  }

  // ── Handle milestone_contract_value update (create/update bonus pool) ──
  if (body.milestone_contract_value !== undefined && body.status !== 'completed') {
    const mcv   = Number(body.milestone_contract_value);
    const total = Math.round(mcv * 5 / 100 * 100) / 100;

    const { data: existingPool } = await supabase.from('project_bonus_pool')
      .select('id').eq('milestone_id', params.id).single();

    if (existingPool) {
      await supabase.from('project_bonus_pool')
        .update({ milestone_contract_value: mcv, total_bonus_pool: total })
        .eq('id', existingPool.id);
    } else if (mcv > 0) {
      await supabase.from('project_bonus_pool').insert({
        project_id:              milestone.project_id,
        milestone_id:            params.id,
        milestone_contract_value: mcv,
        bonus_percent:           5,
        total_bonus_pool:        total,
        status:                  'locked',
      });
    }
  }

  return NextResponse.json(milestone);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isManager(user.role)) return NextResponse.json({ error: 'Admin/Owner only.' }, { status: 403 });

  const { error } = await supabase.from('project_milestones').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
