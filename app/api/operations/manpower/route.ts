import { NextRequest, NextResponse } from 'next/server';
import { getUser, isManager } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

// GET — list all workers with current allocation status
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isManager(user.role)) return NextResponse.json({ error: 'Admin/Owner only.' }, { status: 403 });

  const project_id = req.nextUrl.searchParams.get('project_id');

  // All active employees
  const { data: employees } = await supabase.from('employees')
    .select('id, full_name, rank, daily_rate')
    .eq('status', 'active').is('deleted_at', null).order('rank').order('full_name');

  // Active allocations with project info
  let allocQuery = supabase.from('worker_project_allocation')
    .select('id, employee_id, project_id, allocated_date, notes, projects(name, code)')
    .is('released_date', null);
  if (project_id) allocQuery = allocQuery.eq('project_id', project_id);

  const { data: allocations } = await allocQuery;

  // Build allocation map
  const allocMap: Record<string, { alloc_id: string; project_id: string; project_name: string; allocated_date: string }> = {};
  for (const a of allocations || []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const proj = a.projects as any;
    allocMap[a.employee_id] = {
      alloc_id:       a.id,
      project_id:     a.project_id,
      project_name:   proj?.name || 'Unknown',
      allocated_date: a.allocated_date,
    };
  }

  const workers = (employees || []).map(emp => ({
    ...emp,
    is_allocated:   !!allocMap[emp.id],
    allocation:     allocMap[emp.id] || null,
  }));

  // If project_id filter — separate into allocated here, available, and allocated elsewhere
  if (project_id) {
    const onThisProject  = workers.filter(w => w.allocation?.project_id === project_id);
    const available      = workers.filter(w => !w.is_allocated);
    const onOtherProject = workers.filter(w => w.is_allocated && w.allocation?.project_id !== project_id);
    return NextResponse.json({ on_project: onThisProject, available, on_other_project: onOtherProject });
  }

  return NextResponse.json(workers);
}

// POST — allocate a worker to a project
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isManager(user.role)) return NextResponse.json({ error: 'Admin/Owner only.' }, { status: 403 });

  const body = await req.json();
  if (!body.employee_id) return NextResponse.json({ error: 'employee_id required.' }, { status: 400 });
  if (!body.project_id)  return NextResponse.json({ error: 'project_id required.' }, { status: 400 });

  // Check worker not already allocated
  const { data: existing } = await supabase.from('worker_project_allocation')
    .select('id, projects(name)').eq('employee_id', body.employee_id).is('released_date', null).single();
  if (existing) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const proj = existing.projects as any;
    return NextResponse.json({ error: `Worker is already allocated to ${proj?.name || 'another project'}.` }, { status: 409 });
  }

  const { data, error } = await supabase.from('worker_project_allocation').insert({
    employee_id:    body.employee_id,
    project_id:     body.project_id,
    allocated_date: body.allocated_date || new Date().toISOString().split('T')[0],
    allocated_by:   user.id,
    notes:          body.notes?.trim() || null,
  }).select('*, employees(full_name, rank, daily_rate), projects(name)').single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
