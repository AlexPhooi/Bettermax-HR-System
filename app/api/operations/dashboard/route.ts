import { NextRequest, NextResponse } from 'next/server';
import { getUser, isManager } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isManager(user.role) && user.role !== 'editor')
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });

  const today = new Date().toISOString().split('T')[0];

  const [projectsRes, logsRes, workersRes] = await Promise.all([
    // All active projects with foreman info
    supabase.from('projects')
      .select('id, name, code, location, status, start_date, target_completion, progress_percent, contract_value, gp_percent, foreman_id, notes')
      .eq('status', 'active')
      .order('name'),
    // Latest log per project
    supabase.from('project_daily_logs')
      .select('project_id, log_date, submitted_by')
      .order('log_date', { ascending: false }),
    // Workers on site today
    supabase.from('hr_attendance')
      .select('id', { count: 'exact', head: true })
      .eq('work_date', today)
      .neq('status', 'rejected')
      .is('deleted_at', null),
  ]);

  const projects = projectsRes.data || [];
  const allLogs  = logsRes.data  || [];

  // Build latest-log map per project
  const latestLogMap: Record<string, string> = {};
  for (const log of allLogs) {
    if (!latestLogMap[log.project_id]) latestLogMap[log.project_id] = log.log_date;
  }

  // Fetch foreman names
  const foremanIds = [...new Set(projects.map(p => p.foreman_id).filter(Boolean))];
  let foremanMap: Record<string, string> = {};
  if (foremanIds.length) {
    const { data: emps } = await supabase.from('employees')
      .select('id, full_name').in('id', foremanIds as string[]);
    for (const e of emps || []) foremanMap[e.id] = e.full_name;
  }

  const now = new Date();
  const projectCards = projects.map(p => {
    const latestLog = latestLogMap[p.id] || null;
    const daysSinceLog = latestLog
      ? Math.floor((now.getTime() - new Date(latestLog).getTime()) / 86400000)
      : null;
    const daysRemaining = p.target_completion
      ? Math.ceil((new Date(p.target_completion).getTime() - now.getTime()) / 86400000)
      : null;

    return {
      id: p.id,
      name: p.name,
      code: p.code,
      location: p.location,
      progress_percent: p.progress_percent || 0,
      contract_value: p.contract_value,
      gp_percent: p.gp_percent,
      target_completion: p.target_completion,
      days_remaining: daysRemaining,
      foreman_name: p.foreman_id ? foremanMap[p.foreman_id] || null : null,
      latest_log_date: latestLog,
      days_since_log: daysSinceLog,
      no_log_alert: daysSinceLog === null || daysSinceLog >= 2,
    };
  });

  const totalContractValue = projects.reduce((s, p) => s + Number(p.contract_value || 0), 0);
  const onSchedule = projectCards.filter(p => (p.days_remaining ?? 1) > 0).length;
  const delayed    = projectCards.filter(p => p.days_remaining !== null && p.days_remaining <= 0).length;

  return NextResponse.json({
    total_active_projects: projects.length,
    workers_on_site_today: workersRes.count || 0,
    projects_on_schedule: onSchedule,
    projects_delayed: delayed,
    total_contract_value: totalContractValue,
    projects: projectCards,
  });
}
