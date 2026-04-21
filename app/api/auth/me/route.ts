import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ user: { username: user.username, role: user.role, employee_id: user.employee_id || null } });
}
