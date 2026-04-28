// GET  /api/settings/app — read all app_settings key-value pairs
// PUT  /api/settings/app — update one or more key-value pairs (admin/owner only)
import { NextRequest, NextResponse } from 'next/server';
import { getUser, isManager } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase.from('app_settings').select('key, value');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Return as flat object: { salary_payment_day: '7', ... }
  const result: Record<string, string> = {};
  for (const row of data || []) result[row.key] = row.value;
  return NextResponse.json(result);
}

export async function PUT(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isManager(user.role)) return NextResponse.json({ error: 'Admin/Owner only.' }, { status: 403 });

  const body = await req.json();
  const updated: Record<string, string> = {};

  for (const [key, value] of Object.entries(body)) {
    if (value === null || value === undefined) continue;
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'object') continue;
    const strVal = typeof value === 'object' ? JSON.stringify(value) : String(value);

    // Validate known keys
    if (key === 'salary_payment_day') {
      const day = Number(strVal);
      if (isNaN(day) || day < 1 || day > 28)
        return NextResponse.json({ error: 'salary_payment_day must be 1–28.' }, { status: 400 });
    }

    const { error } = await supabase.from('app_settings')
      .upsert({ key, value: strVal, updated_by: user.id, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    updated[key] = strVal;
  }

  return NextResponse.json(updated);
}
