// PATCH /api/attendance/group
// Admin bulk-approves / bulk-rejects a group of records (same project+date session)
import { NextRequest, NextResponse } from 'next/server';
import { getUser, isManager } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export async function PATCH(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isManager(user.role)) return NextResponse.json({ error: 'Admin/Owner only.' }, { status: 403 });

  const body = await req.json();
  const { ids, status, site_clean, work_hours, ot_hours } = body;

  if (!Array.isArray(ids) || ids.length === 0)
    return NextResponse.json({ error: 'ids array required.' }, { status: 400 });
  if (!['approved', 'rejected'].includes(status))
    return NextResponse.json({ error: 'status must be approved or rejected.' }, { status: 400 });

  // Build update payload
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: Record<string, any> = { status };

  if (site_clean !== undefined) {
    update.site_clean = Boolean(site_clean);
    // site_bonus applied per-record based on hours (done below)
  }

  if (work_hours && Number(work_hours) >= 1) {
    const total_hours = Number(work_hours) + (Number(ot_hours) || 0);
    update.hours_worked = total_hours;
    update.days_worked  = total_hours / 8;
    update.ot_hours     = Number(ot_hours) || 0;
  }

  // For site bonus, we need to check hours per record (must be ≥ 8h)
  // Fetch hours first if site_clean is being set
  if (site_clean !== undefined) {
    const { data: records } = await supabase.from('hr_attendance')
      .select('id, hours_worked')
      .in('id', ids);

    if (records) {
      for (const rec of records) {
        const effectiveHours = update.hours_worked ?? Number(rec.hours_worked);
        const bonus = Boolean(site_clean) && effectiveHours >= 8 ? 10 : 0;
        const recUpdate = { ...update, site_bonus: bonus };
        await supabase.from('hr_attendance').update(recUpdate).eq('id', rec.id);
      }
      return NextResponse.json({ updated: records.length });
    }
  }

  // Simple update (no site bonus calculation needed)
  const { error } = await supabase.from('hr_attendance').update(update).in('id', ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ updated: ids.length });
}
