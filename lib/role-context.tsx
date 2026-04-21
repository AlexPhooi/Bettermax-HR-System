'use client';
import { createContext, useContext, useEffect, useState } from 'react';

interface RoleCtx {
  role: string;
  employee_id: string | null;
  username: string;
  loaded: boolean;
}

const RoleContext = createContext<RoleCtx>({ role: '', employee_id: null, username: '', loaded: false });

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [ctx, setCtx] = useState<RoleCtx>({ role: '', employee_id: null, username: '', loaded: false });

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.user) {
          setCtx({ role: d.user.role, employee_id: d.user.employee_id || null, username: d.user.username, loaded: true });
        } else {
          setCtx(c => ({ ...c, loaded: true }));
        }
      })
      .catch(() => setCtx(c => ({ ...c, loaded: true })));
  }, []);

  return <RoleContext.Provider value={ctx}>{children}</RoleContext.Provider>;
}

export function useRole() { return useContext(RoleContext); }

/** True for owner or admin — can access management features */
export function useIsManager() {
  const { role } = useContext(RoleContext);
  return role === 'owner' || role === 'admin';
}
