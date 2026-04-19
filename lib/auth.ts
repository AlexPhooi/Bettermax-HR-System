import { SignJWT, jwtVerify } from 'jose';
import { NextRequest } from 'next/server';

if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET environment variable is not set.');
const secret = new TextEncoder().encode(process.env.JWT_SECRET);

export async function signToken(payload: Record<string, unknown>) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(secret);
}

export async function verifyToken(token: string) {
  const { payload } = await jwtVerify(token, secret);
  return payload;
}

export async function getUser(req: NextRequest) {
  const token = req.cookies.get('token')?.value;
  if (!token) return null;
  try { return await verifyToken(token); } catch { return null; }
}
