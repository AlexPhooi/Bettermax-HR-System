// PATCH /api/attendance/complete
// Leader completes today's draft records → sets hours, OT, photos, status='pending'
import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export async function PATCH(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role === 'worker') return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });

  const body = await req.json();
  const { project_id, work_date, work_hours, ot_hours = 0 } = body;

  if (!work_date)  return NextResponse.json({ error: 'work_date required.' }, { status: 400 });
  if (!work_hours || Number(work_hours) < 1) return NextResponse.json({ error: 'work_hours must be 1–8.' }, { status: 400 });

  const total_hours = Number(work_hours) + Number(ot_hours);
  const days_worked = total_hours / 8;

  // Find all draft records for this project+date submitted by this leader
  let query = supabase.from('hr_attendance')
    .select('id')
    .eq('work_date', work_date)
    .eq('status', 'draft')
    .eq('submitted_by', user.id);

  if (project_id) query = query.eq('project_id', project_id);

  const { data: drafts, error: findErr } = await query;
  if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 });
  if (!drafts || drafts.length === 0)
    return NextResponse.json({ error: 'No draft records found for this session.' }, { status: 404 });

  const ids = drafts.map(d => d.id);

  // Update all draft records to pending with hours + photos
  const { error: updateErr } = await supabase.from('hr_attendance')
    .update({
      hours_worked:         total_hours,
      days_worked,
      ot_hours:             Number(ot_hours),
      status:               'pending',
      check_out_photo_url:  body.check_out_photo_url  || null,
      site_photo_front_url: body.site_photo_front_url || null,
      site_photo_back_url:  body.site_photo_back_url  || null,
      site_photo_store_url: body.site_photo_store_url || null,
    })
    .in('id', ids);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
  return NextResponse.json({ updated: ids.length });
}
