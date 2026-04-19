import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import Navbar from '@/components/Navbar';

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const token = cookies().get('token')?.value;
  let username = '';
  if (token) {
    try {
      const p = await verifyToken(token);
      username = p.username as string;
    } catch {}
  }
  return (
    <>
      <Navbar username={username} />
      <main className="min-h-screen bg-bg">{children}</main>
    </>
  );
}
