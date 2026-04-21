import Navbar from '@/components/Navbar';
import { RoleProvider } from '@/lib/role-context';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleProvider>
      <Navbar />
      <main className="min-h-screen bg-bg">{children}</main>
    </RoleProvider>
  );
}
