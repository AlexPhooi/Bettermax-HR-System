import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { calcHoursAndDays } from '@/lib/utils';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'admin' && user.role !== 'owner') return NextResponse.json({ error: 'Forbidden — admin/owner only' }, { status: 403 });
  const body = await req.json();
  const { status } = body;
  if (!['approved', 'rejected'].includes(status))
    return NextResponse.json({ error: 'Status must be approved or rejected.' }, { status: 400 });
  const { data, error } = await supabase.from('hr_attendance')
    .update({ status })
    .eq('id', params.id)
    .select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await getUser(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const calc = calcHoursAndDays(body.work_date, body.clock_in, body.clock_out);
  if (!calc) return NextResponse.json({ error: 'Clock out must be after clock in.' }, { status: 400 });
  const { data, error } = await supabase.from('hr_attendance').update({
    employee_id: body.employee_id, project_id: body.project_id || null,
    work_date: body.work_date, clock_in: calc.clock_in, clock_out: calc.clock_out,
    hours_worked: calc.hours, days_worked: calc.days, notes: body.notes?.trim() || null,
  }).eq('id', params.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await getUser(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { error } = await supabase.from('hr_attendance').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
