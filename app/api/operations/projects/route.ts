import { NextRequest, NextResponse } from 'next/server';
import { getUser, isManager } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const status = sp.get('status');
  const active_only = sp.get('active_only') === '1';

  let query = supabase.from('projects')
    .select('id, name, code, location, status, start_date, target_completion, progress_percent, contract_value, deposit_received, progress_billed, total_collected, gp_percent, foreman_id, project_type, estimated_duration_days, notes, created_at')
    .order('name');

  if (status) query = query.eq('status', status);
  else if (active_only) query = query.eq('status', 'active');

  // Foreman (editor) sees only their own project
  if (user.role === 'editor' && user.employee_id) {
    query = query.eq('foreman_id', user.employee_id).eq('status', 'active');
  }

  // Viewer sees only their allocated project(s)
  if (user.role === 'viewer' && user.employee_id) {
    const { data: alloc } = await supabase.from('worker_project_allocation')
      .select('project_id').eq('employee_id', user.employee_id).is('released_date', null);
    const ids = (alloc || []).map(a => a.project_id);
    if (!ids.length) return NextResponse.json([]);
    query = query.in('id', ids);
  }

  const { data: projects, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fetch foreman names and latest log dates
  const foremanIds = [...new Set((projects || []).map(p => p.foreman_id).filter(Boolean))];
  let foremanMap: Record<string, string> = {};
  if (foremanIds.length) {
    const { data: emps } = await supabase.from('employees')
      .select('id, full_name').in('id', foremanIds as string[]);
    for (const e of emps || []) foremanMap[e.id] = e.full_name;
  }

  const { data: latestLogs } = await supabase.from('project_daily_logs')
    .select('project_id, log_date')
    .order('log_date', { ascending: false });

  const latestLogMap: Record<string, string> = {};
  for (const log of latestLogs || []) {
    if (!latestLogMap[log.project_id]) latestLogMap[log.project_id] = log.log_date;
  }

  const result = (projects || []).map(p => ({
    ...p,
    foreman_name: p.foreman_id ? foremanMap[p.foreman_id] || null : null,
    latest_log_date: latestLogMap[p.id] || null,
  }));

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isManager(user.role)) return NextResponse.json({ error: 'Admin/Owner only.' }, { status: 403 });

  const body = await req.json();
  if (!body.name?.trim()) return NextResponse.json({ error: 'Project name is required.' }, { status: 400 });

  const { data, error } = await supabase.from('projects').insert({
    name:                 body.name.trim(),
    code:                 body.code?.trim() || null,
    location:             body.location?.trim() || null,
    maps_url:             body.maps_url?.trim() || null,
    waze_url:             body.waze_url?.trim() || null,
    status:               'active',
    project_type:         body.project_type || null,
    start_date:           body.start_date || null,
    target_completion:    body.target_completion || null,
    contract_value:       body.contract_value ? Number(body.contract_value) : null,
    foreman_id:           body.foreman_id || null,
    estimated_duration_days: body.estimated_duration_days ? Number(body.estimated_duration_days) : null,
    progress_percent:     0,
    notes:                body.notes?.trim() || null,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Optionally seed default milestones
  if (body.seed_milestones) {
    const defaults = [
      'Demolition','Foundation & Footing','Reinforced Concrete Structure',
      'Roofing','Brickwork','Plaster & Screeding',
      'M&E Rough-in','Tiling & Finishing','Final Touch & Handover',
    ];
    await supabase.from('project_milestones').insert(
      defaults.map((name, i) => ({
        project_id: data.id, name, sequence_order: i + 1, status: 'pending',
      }))
    );
  }

  return NextResponse.json(data);
}
