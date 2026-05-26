import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role === 'viewer') return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const project_id  = sp.get('project_id');
  const submitted_by = sp.get('submitted_by');
  const from        = sp.get('from');
  const to          = sp.get('to');
  const limit       = Number(sp.get('limit') || 100);

  let query = supabase.from('project_daily_logs')
    .select('*, projects(name, code), users(username)')
    .order('log_date', { ascending: false })
    .limit(limit);

  if (project_id)   query = query.eq('project_id', project_id);
  if (submitted_by) query = query.eq('submitted_by', submitted_by);
  if (from)         query = query.gte('log_date', from);
  if (to)           query = query.lte('log_date', to);

  // Editors see only their own submissions
  if (user.role === 'editor') {
    query = query.eq('submitted_by', user.id);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role === 'viewer') return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });

  const body = await req.json();
  if (!body.project_id) return NextResponse.json({ error: 'Project is required.' }, { status: 400 });
  if (!body.log_date)   return NextResponse.json({ error: 'Date is required.' }, { status: 400 });
  if (!body.work_done?.trim()) return NextResponse.json({ error: 'Work done description is required.' }, { status: 400 });

  // Check for duplicate log (same project + date)
  const { data: existing } = await supabase.from('project_daily_logs')
    .select('id').eq('project_id', body.project_id).eq('log_date', body.log_date).single();
  if (existing) return NextResponse.json({ error: 'A log for this project and date already exists.' }, { status: 409 });

  const { data, error } = await supabase.from('project_daily_logs').insert({
    project_id:      body.project_id,
    log_date:        body.log_date,
    submitted_by:    user.id,
    weather:         body.weather || 'sunny',
    workers_present: body.workers_present ? Number(body.workers_present) : null,
    work_done:       body.work_done.trim(),
    issues_found:    body.issues_found?.trim() || null,
    materials_used:  body.materials_used?.trim() || null,
    photo_url:       body.photo_url || null,
    milestone_id:    body.milestone_id || null,
  }).select('*, projects(name, code), users(username)').single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
