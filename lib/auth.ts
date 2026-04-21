import { SignJWT, jwtVerify } from 'jose';
import { NextRequest } from 'next/server';

if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET environment variable is not set.');
const secret = new TextEncoder().encode(process.env.JWT_SECRET);

export interface UserPayload {
  id: string;
  username: string;
  role: 'owner' | 'admin' | 'leader' | 'worker' | string;
  employee_id?: string | null;
}

/** True for roles with full management access */
export function isManager(role: string) {
  return role === 'owner' || role === 'admin';
}

export async function signToken(payload: UserPayload) {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(secret);
}

export async function verifyToken(token: string): Promise<UserPayload> {
  const { payload } = await jwtVerify(token, secret);
  return payload as unknown as UserPayload;
}

export async function getUser(req: NextRequest): Promise<UserPayload | null> {
  const token = req.cookies.get('token')?.value;
  if (!token) return null;
  try { return await verifyToken(token); } catch { return null; }
}
