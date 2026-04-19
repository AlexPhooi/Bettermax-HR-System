'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';

const NAV = [
  { href: '/',            label: 'Dashboard' },
  { href: '/projects',    label: 'Projects' },
  { href: '/employees',   label: 'Employees' },
  { href: '/attendance',  label: 'Attendance' },
  { href: '/salary',      label: 'Salary' },
  { href: '/advances',    label: 'Advances' },
];

interface ExpiryItem { id: string; full_name: string; permit_expire: string; }

function daysDiff(dateStr: string) {
  return Math.floor((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

export default function Navbar({ username }: { username: string }) {
  const pathname = usePathname();
  const router   = useRouter();
  const [open, setOpen]         = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [expiring, setExpiring] = useState<ExpiryItem[]>([]);
  const [expired, setExpired]   = useState<ExpiryItem[]>([]);
  const bellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/dashboard')
      .then(r => r.json())
      .then(d => {
        setExpiring(d.expiring_list || []);
        setExpired(d.expired_list || []);
      })
      .catch(() => {});
  }, []);

  // Close bell dropdown when clicking outside
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setBellOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  const totalAlerts = expiring.length + expired.length;

  return (
    <>
      <nav className="bg-primary text-white sticky top-0 z-50 shadow-md">
        <div className="flex items-center h-14 px-4 md:px-6">
          <Link href="/" className="font-bold text-base md:text-lg mr-6 whitespace-nowrap shrink-0">
            🏢 Bettermax Enterprise
          </Link>
          <ul className="hidden md:flex gap-0.5 flex-1">
            {NAV.map(l => (
              <li key={l.href}>
                <Link href={l.href}
                  className={`px-3 py-1.5 rounded text-sm transition-colors block
                    ${isActive(l.href)
                      ? 'bg-white/20 text-white font-medium'
                      : 'text-white/80 hover:bg-white/15 hover:text-white'}`}>
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>

          <div className="ml-auto flex items-center gap-2">
            {/* Permit Expiry Bell */}
            <div className="relative" ref={bellRef}>
              <button
                onClick={() => setBellOpen(b => !b)}
                className="relative p-1.5 rounded hover:bg-white/15 transition-colors"
                title="Permit expiry alerts">
                <span className="text-lg leading-none">🔔</span>
                {totalAlerts > 0 && (
                  <span className={`absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold leading-4 text-center text-white
                    ${expired.length > 0 ? 'bg-red-500' : 'bg-orange-400'}`}>
                    {totalAlerts}
                  </span>
                )}
              </button>

              {bellOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-lg shadow-xl border border-gray-200 z-50 overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                    <p className="text-sm font-semibold text-gray-700">Permit Expiry Alerts</p>
                  </div>

                  {totalAlerts === 0 ? (
                    <div className="px-4 py-6 text-center text-gray-400 text-sm">
                      ✅ All permits are valid
                    </div>
                  ) : (
                    <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
                      {expired.length > 0 && (
                        <>
                          <div className="px-4 py-1.5 bg-red-50 text-xs font-semibold text-red-600 uppercase tracking-wider">
                            ❌ Expired
                          </div>
                          {expired.map(e => (
                            <div key={e.id} className="px-4 py-2.5 flex items-center justify-between hover:bg-gray-50">
                              <div>
                                <p className="text-sm font-medium text-gray-800">{e.full_name}</p>
                                <p className="text-xs text-red-500">Expired {Math.abs(daysDiff(e.permit_expire))} days ago</p>
                              </div>
                              <span className="text-xs text-gray-400 shrink-0 ml-2">
                                {new Date(e.permit_expire).toLocaleDateString('en-GB')}
                              </span>
                            </div>
                          ))}
                        </>
                      )}
                      {expiring.length > 0 && (
                        <>
                          <div className="px-4 py-1.5 bg-orange-50 text-xs font-semibold text-orange-600 uppercase tracking-wider">
                            ⚠️ Expiring Soon
                          </div>
                          {expiring.map(e => {
                            const d = daysDiff(e.permit_expire);
                            return (
                              <div key={e.id} className="px-4 py-2.5 flex items-center justify-between hover:bg-gray-50">
                                <div>
                                  <p className="text-sm font-medium text-gray-800">{e.full_name}</p>
                                  <p className={`text-xs ${d <= 14 ? 'text-red-500' : 'text-orange-500'}`}>
                                    {d === 0 ? 'Expires today' : `${d} day${d !== 1 ? 's' : ''} left`}
                                  </p>
                                </div>
                                <span className="text-xs text-gray-400 shrink-0 ml-2">
                                  {new Date(e.permit_expire).toLocaleDateString('en-GB')}
                                </span>
                              </div>
                            );
                          })}
                        </>
                      )}
                    </div>
                  )}

                  <div className="px-4 py-2.5 border-t border-gray-200 bg-gray-50">
                    <Link href="/employees" onClick={() => setBellOpen(false)}
                      className="text-xs text-blue-600 hover:underline">
                      View all employees →
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {username && (
              <span className="hidden sm:block text-white/60 text-xs">{username}</span>
            )}
            <button onClick={logout}
              className="text-xs border border-white/30 bg-white/10 hover:bg-white/20 text-white/90 px-3 py-1.5 rounded transition-colors">
              Logout
            </button>
            <button onClick={() => setOpen(!open)}
              className="md:hidden text-white text-2xl leading-none ml-1">
              ☰
            </button>
          </div>
        </div>
      </nav>
      {open && (
        <div className="md:hidden bg-primary-light shadow-lg z-40">
          {NAV.map(l => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)}
              className={`block px-6 py-3 text-sm border-b border-white/10 transition-colors
                ${isActive(l.href) ? 'text-white bg-white/15 font-medium' : 'text-white/85 hover:bg-white/10'}`}>
              {l.label}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
