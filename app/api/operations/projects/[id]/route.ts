import { NextRequest, NextResponse } from 'next/server';
import { getUser, isManager } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [projRes, milestonesRes, logsRes, stagesRes] = await Promise.all([
    supabase.from('projects').select('*').eq('id', params.id).single(),
    supabase.from('project_milestones').select('*').eq('project_id', params.id).order('sequence_order'),
    supabase.from('project_daily_logs').select('*, users(username)').eq('project_id', params.id).order('log_date', { ascending: false }).limit(50),
    supabase.from('project_payment_stages').select('*').eq('project_id', params.id).order('sequence_order'),
  ]);

  if (projRes.error) return NextResponse.json({ error: projRes.error.message }, { status: 500 });
  if (!projRes.data)  return NextResponse.json({ error: 'Project not found.' }, { status: 404 });

  // Fetch foreman name
  let foreman_name: string | null = null;
  if (projRes.data.foreman_id) {
    const { data: emp } = await supabase.from('employees').select('full_name').eq('id', projRes.data.foreman_id).single();
    foreman_name = emp?.full_name || null;
  }

  return NextResponse.json({
    project: { ...projRes.data, foreman_name },
    milestones: milestonesRes.data || [],
    logs: logsRes.data || [],
    payment_stages: stagesRes.data || [],
  });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isManager(user.role) && user.role !== 'editor')
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });

  const body = await req.json();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: Record<string, any> = {};

  if (body.name !== undefined)             update.name = body.name?.trim();
  if (body.code !== undefined)             update.code = body.code?.trim() || null;
  if (body.location !== undefined)         update.location = body.location?.trim() || null;
  if (body.project_type !== undefined)     update.project_type = body.project_type || null;
  if (body.status !== undefined)           update.status = body.status;
  if (body.start_date !== undefined)       update.start_date = body.start_date || null;
  if (body.target_completion !== undefined) update.target_completion = body.target_completion || null;
  if (body.actual_completion !== undefined) update.actual_completion = body.actual_completion || null;
  if (body.contract_value !== undefined)   update.contract_value = body.contract_value ? Number(body.contract_value) : null;
  if (body.deposit_received !== undefined) update.deposit_received = body.deposit_received ? Number(body.deposit_received) : null;
  if (body.progress_billed !== undefined)  update.progress_billed = body.progress_billed ? Number(body.progress_billed) : null;
  if (body.total_collected !== undefined)  update.total_collected = body.total_collected ? Number(body.total_collected) : null;
  if (body.foreman_id !== undefined)       update.foreman_id = body.foreman_id || null;
  if (body.progress_percent !== undefined) update.progress_percent = Number(body.progress_percent);
  if (body.gp_percent !== undefined)       update.gp_percent = body.gp_percent ? Number(body.gp_percent) : null;
  if (body.total_labor_cost !== undefined) update.total_labor_cost = body.total_labor_cost ? Number(body.total_labor_cost) : null;
  if (body.total_material_cost !== undefined) update.total_material_cost = body.total_material_cost ? Number(body.total_material_cost) : null;
  if (body.estimated_duration_days !== undefined) update.estimated_duration_days = body.estimated_duration_days ? Number(body.estimated_duration_days) : null;
  if (body.notes !== undefined)            update.notes = body.notes?.trim() || null;
  if (body.maps_url !== undefined)         update.maps_url = body.maps_url?.trim() || null;
  if (body.waze_url !== undefined)         update.waze_url = body.waze_url?.trim() || null;

  const { data, error } = await supabase.from('projects').update(update).eq('id', params.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
