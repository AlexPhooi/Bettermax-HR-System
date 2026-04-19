import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { calcHoursAndDays } from '@/lib/utils';

export async function GET(req: NextRequest) {
  if (!await getUser(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  let query = supabase.from('hr_attendance')
    .select('*, employees(full_name, daily_rate), projects(name, code)')
    .order('work_date', { ascending: false });
  const month = sp.get('month');
  if (month) {
    const [y, m] = month.split('-');
    query = query.gte('work_date', `${month}-01`)
      .lte('work_date', new Date(+y, +m, 0).toISOString().split('T')[0]);
  }
  if (sp.get('employee_id')) query = query.eq('employee_id', sp.get('employee_id')!);
  if (sp.get('project_id'))  query = query.eq('project_id',  sp.get('project_id')!);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  if (!await getUser(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const ids: string[] = body.employee_ids?.length ? body.employee_ids : (body.employee_id ? [body.employee_id] : []);
  if (!ids.length) return NextResponse.json({ error: 'At least one employee is required.' }, { status: 400 });
  if (!body.work_date)           return NextResponse.json({ error: 'Work date is required.' }, { status: 400 });
  if (!body.clock_in || !body.clock_out) return NextResponse.json({ error: 'Clock in and out required.' }, { status: 400 });

  const calc = calcHoursAndDays(body.work_date, body.clock_in, body.clock_out);
  if (!calc) return NextResponse.json({ error: 'Clock out must be after clock in.' }, { status: 400 });

  // Detect rework: attendance on a completed project
  let is_rework = false;
  if (body.project_id) {
    const { data: proj } = await supabase.from('projects').select('status').eq('id', body.project_id).single();
    if (proj?.status === 'completed') {
      is_rework = true;
      if (!body.notes?.trim()) {
        return NextResponse.json({ error: 'Rework remark is required for completed projects.' }, { status: 400 });
      }
    }
  }

  const inserted: unknown[] = [], skipped: string[] = [];
  for (const employee_id of ids) {
    const { data, error } = await supabase.from('hr_attendance').insert({
      employee_id, project_id: body.project_id || null,
      work_date: body.work_date, clock_in: calc.clock_in, clock_out: calc.clock_out,
      hours_worked: calc.hours, days_worked: calc.days,
      notes: body.notes?.trim() || null,
      is_rework,
    }).select().single();
    if (error) {
      if (error.code === '23505') skipped.push(employee_id);
      else return NextResponse.json({ error: error.message }, { status: 500 });
    } else inserted.push(data);
  }
  return NextResponse.json({ inserted, skipped });
}
