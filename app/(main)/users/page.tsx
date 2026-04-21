'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Users/Accounts module has moved to /staff
export default function UsersRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/staff'); }, [router]);
  return (
    <div className="p-8 text-center text-gray-400">Redirecting to Staff…</div>
  );
}
