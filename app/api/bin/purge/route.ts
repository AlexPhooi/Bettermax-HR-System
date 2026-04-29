// POST /api/bin/purge
// Permanently deletes all soft-deleted records older than 30 days.
// Called daily by Vercel Cron — secured by CRON_SECRET header.
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const EXPIRY_DAYS = 30;

export async function POST(req: NextRequest) {
  // Verify Vercel cron secret (set in Vercel env vars as CRON_SECRET)
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - EXPIRY_DAYS);
  const cutoffStr = cutoff.toISOString();

  const results: Record<string, number> = {};

  // Permanently delete attendance records
  const { data: att } = await supabase.from('hr_attendance')
    .delete()
    .not('deleted_at', 'is', null)
    .lt('deleted_at', cutoffStr)
    .select('id');
  results.attendance = att?.length ?? 0;

  // Permanently delete salary records
  const { data: sal } = await supabase.from('salary_records')
    .delete()
    .not('deleted_at', 'is', null)
    .lt('deleted_at', cutoffStr)
    .select('id');
  results.salary = sal?.length ?? 0;

  // Permanently delete employees
  const { data: emp } = await supabase.from('employees')
    .delete()
    .not('deleted_at', 'is', null)
    .lt('deleted_at', cutoffStr)
    .select('id');
  results.employees = emp?.length ?? 0;

  // Permanently delete users (staff accounts)
  const { data: usr } = await supabase.from('users')
    .delete()
    .not('deleted_at', 'is', null)
    .lt('deleted_at', cutoffStr)
    .select('id');
  results.staff = usr?.length ?? 0;

  const total = Object.values(results).reduce((a, b) => a + b, 0);
  console.log(`[bin/purge] Purged ${total} records older than ${EXPIRY_DAYS} days:`, results);

  return NextResponse.json({
    purged: total,
    breakdown: results,
    cutoff: cutoffStr,
    expiry_days: EXPIRY_DAYS,
  });
}
