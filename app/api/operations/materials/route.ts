import { NextRequest, NextResponse } from 'next/server';
import { getUser, isManager } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const project_id  = sp.get('project_id');
  const milestone_id = sp.get('milestone_id');
  const urgent_only = sp.get('urgent_only') === '1';

  if (!project_id) return NextResponse.json({ error: 'project_id required.' }, { status: 400 });

  let query = supabase.from('project_material_schedule')
    .select('*, project_milestones(name, sequence_order)')
    .eq('project_id', project_id)
    .order('order_by_date', { ascending: true, nullsFirst: false });

  if (milestone_id) query = query.eq('milestone_id', milestone_id);
  if (urgent_only) {
    const in7 = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
    const today = new Date().toISOString().split('T')[0];
    query = query.eq('status', 'planned').lte('order_by_date', in7).gte('order_by_date', today);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isManager(user.role)) return NextResponse.json({ error: 'Admin/Owner only.' }, { status: 403 });

  const body = await req.json();
  if (!body.project_id)       return NextResponse.json({ error: 'project_id required.' }, { status: 400 });
  if (!body.material_name?.trim()) return NextResponse.json({ error: 'Material name required.' }, { status: 400 });

  const qty  = Number(body.quantity || 0);
  const unit_cost = Number(body.estimated_unit_cost || 0);

  const { data, error } = await supabase.from('project_material_schedule').insert({
    project_id:          body.project_id,
    milestone_id:        body.milestone_id || null,
    material_name:       body.material_name.trim(),
    unit:                body.unit?.trim() || null,
    quantity:            qty,
    estimated_unit_cost: unit_cost,
    estimated_total_cost: body.estimated_total_cost ? Number(body.estimated_total_cost) : qty * unit_cost,
    required_by_date:    body.required_by_date || null,
    order_by_date:       body.order_by_date    || null,
    supplier:            body.supplier?.trim() || null,
    status:              body.status || 'planned',
    notes:               body.notes?.trim() || null,
    created_by:          user.id,
  }).select('*, project_milestones(name, sequence_order)').single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
