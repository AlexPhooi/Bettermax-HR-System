import { NextRequest, NextResponse } from 'next/server';
import { getUser, isManager } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isManager(user.role) && user.role !== 'editor')
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });

  const today = new Date().toISOString().split('T')[0];
  const in7   = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

  const [projectsRes, workersRes, allocRes, workersOnSiteRes, materialAlertRes, milestonesRes] = await Promise.all([
    // Active projects with foreman
    supabase.from('projects')
      .select('id, name, code, location, status, start_date, target_completion, progress_percent, contract_value, gp_percent, foreman_id, notes')
      .eq('status', 'active').order('name'),

    // All active employees (for available workers calc)
    supabase.from('employees')
      .select('id, full_name, rank, daily_rate')
      .eq('status', 'active').is('deleted_at', null),

    // Active allocations (released_date IS NULL)
    supabase.from('worker_project_allocation')
      .select('id, employee_id, project_id')
      .is('released_date', null),

    // Workers on site today
    supabase.from('hr_attendance')
      .select('id', { count: 'exact', head: true })
      .eq('work_date', today).neq('status', 'rejected').is('deleted_at', null),

    // Material alerts: planned materials with order_by_date ≤ today+7
    supabase.from('project_material_schedule')
      .select('project_id, material_name, order_by_date')
      .eq('status', 'planned').lte('order_by_date', in7).gte('order_by_date', today),

    // In-progress milestones per project
    supabase.from('project_milestones')
      .select('project_id, name, sequence_order')
      .eq('status', 'in_progress'),
  ]);

  const projects   = projectsRes.data   || [];
  const allWorkers = workersRes.data    || [];
  const allAllocs  = allocRes.data      || [];
  const matAlerts  = materialAlertRes.data || [];
  const inProgressMS = milestonesRes.data || [];

  // Build maps
  const allocatedEmpIds = new Set(allAllocs.map(a => a.employee_id));
  const allocsByProject: Record<string, number> = {};
  for (const a of allAllocs) {
    allocsByProject[a.project_id] = (allocsByProject[a.project_id] || 0) + 1;
  }
  const matAlertProjectIds = new Set(matAlerts.map(m => m.project_id));
  const inProgressByProject: Record<string, string> = {};
  for (const m of inProgressMS) {
    if (!inProgressByProject[m.project_id]) inProgressByProject[m.project_id] = m.name;
  }

  // Fetch foreman names
  const foremanIds = Array.from(new Set(projects.map(p => p.foreman_id).filter(Boolean))) as string[];
  let foremanMap: Record<string, string> = {};
  if (foremanIds.length) {
    const { data: emps } = await supabase.from('employees').select('id, full_name').in('id', foremanIds);
    for (const e of emps || []) foremanMap[e.id] = e.full_name;
  }

  // Latest log per project
  const { data: latestLogs } = await supabase.from('project_daily_logs')
    .select('project_id, log_date').order('log_date', { ascending: false });
  const latestLogMap: Record<string, string> = {};
  for (const log of latestLogs || []) {
    if (!latestLogMap[log.project_id]) latestLogMap[log.project_id] = log.log_date;
  }

  const now = new Date();
  const activeProjectIds = new Set(projects.map(p => p.id));

  const projectCards = projects.map(p => {
    const latestLog    = latestLogMap[p.id] || null;
    const daysSinceLog = latestLog ? Math.floor((now.getTime() - new Date(latestLog).getTime()) / 86400000) : null;
    const daysRemaining = p.target_completion
      ? Math.ceil((new Date(p.target_completion).getTime() - now.getTime()) / 86400000) : null;
    return {
      id: p.id, name: p.name, code: p.code, location: p.location,
      progress_percent: p.progress_percent || 0,
      contract_value: p.contract_value,
      gp_percent: p.gp_percent,
      target_completion: p.target_completion,
      days_remaining: daysRemaining,
      foreman_name: p.foreman_id ? foremanMap[p.foreman_id] || null : null,
      latest_log_date: latestLog,
      days_since_log: daysSinceLog,
      no_log_alert: daysSinceLog === null || daysSinceLog >= 2,
      workers_allocated: allocsByProject[p.id] || 0,
      current_milestone: inProgressByProject[p.id] || null,
      material_alert: matAlertProjectIds.has(p.id),
    };
  });

  // Available workers = active employees NOT in any active-project allocation
  const availableWorkers = allWorkers.filter(w => !allocatedEmpIds.has(w.id));
  const allocatedWorkers = allWorkers.filter(w => allocatedEmpIds.has(w.id));

  const totalContractValue = projects.reduce((s, p) => s + Number(p.contract_value || 0), 0);
  const onSchedule = projectCards.filter(p => (p.days_remaining ?? 1) > 0).length;
  const delayed    = projectCards.filter(p => p.days_remaining !== null && p.days_remaining <= 0).length;

  let capacityStatus: 'available' | 'limited' | 'full' = 'available';
  if (availableWorkers.length === 0)  capacityStatus = 'full';
  else if (availableWorkers.length < 4) capacityStatus = 'limited';

  return NextResponse.json({
    total_active_projects:  projects.length,
    workers_on_site_today:  workersOnSiteRes.count || 0,
    available_workers:      availableWorkers.length,
    allocated_workers:      allocatedWorkers.length,
    total_workers:          allWorkers.length,
    projects_on_schedule:   onSchedule,
    projects_delayed:       delayed,
    total_contract_value:   totalContractValue,
    capacity_status:        capacityStatus,
    projects: projectCards,
  });
}
