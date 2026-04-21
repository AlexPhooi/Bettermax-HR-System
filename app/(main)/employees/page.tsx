'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Employees module has moved to /staff (unified with accounts)
export default function EmployeesRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/staff'); }, [router]);
  return (
    <div className="p-8 text-center text-gray-400">Redirecting to Staff…</div>
  );
}
