'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { useRole } from '@/lib/role-context';

// ── Brand icon SVG (inline, 36 px tall) ───────────────────────────────
function BrandIcon({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <polyline points="14,88 100,16 186,88"
        fill="none" stroke="#C9A84C" strokeWidth="6"
        strokeLinejoin="miter" strokeLinecap="square"/>
      <rect x="22"  y="88"  width="24" height="88"  fill="#C9A84C"/>
      <rect x="88"  y="62"  width="24" height="114" fill="#E8D5A3"/>
      <rect x="154" y="88"  width="24" height="88"  fill="#C9A84C"/>
      <rect x="22"  y="130" width="156" height="6"  fill="#C9A84C" opacity=".4"/>
      <rect x="92"  y="74"  width="16" height="18"  fill="#1A0E06"/>
      <rect x="92"  y="102" width="16" height="22"  fill="#1A0E06"/>
      <rect x="10"  y="176" width="180" height="8"  fill="#C9A84C"/>
    </svg>
  );
}

// ── Nav link definitions ───────────────────────────────────────────────
const ADMIN_NAV = [
  { href: '/',           label: 'Dashboard' },
  { href: '/staff',      label: 'Staff' },
  { href: '/attendance', label: 'Attendance' },
  { href: '/advances',   label: 'Advance' },
  { href: '/salary',     label: 'Salary' },
  { href: '/saving',     label: 'Saving' },
  { href: '/settings',   label: 'Settings' },
];
const APPROVAL_NAV = [
  { href: '/',              label: 'Dashboard' },
  { href: '/attendance',    label: 'Attendance' },
  { href: '/my-attendance', label: 'My Attendance' },
  { href: '/my-salary',     label: 'My Salary' },
  { href: '/my-profile',    label: 'My Profile' },
];
const EDITOR_NAV = [
  { href: '/',              label: 'Dashboard' },
  { href: '/attendance',    label: 'Attendance' },
  { href: '/my-attendance', label: 'My Attendance' },
  { href: '/my-salary',     label: 'My Salary' },
  { href: '/my-saving',     label: 'My Saving' },
  { href: '/my-profile',    label: 'My Profile' },
];
const VIEWER_NAV = [
  { href: '/',              label: 'Dashboard' },
  { href: '/my-attendance', label: 'My Attendance' },
  { href: '/my-salary',     label: 'My Salary' },
  { href: '/my-saving',     label: 'My Saving' },
  { href: '/my-profile',    label: 'My Profile' },
];

interface ExpiryItem { id: string; full_name: string; permit_expire: string; }

function daysDiff(dateStr: string) {
  return Math.floor((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

export default function Navbar() {
  const { role, username, loaded } = useRole();
  const pathname = usePathname();
  const router   = useRouter();
  const [open,      setOpen]      = useState(false);
  const [bellOpen,  setBellOpen]  = useState(false);
  const [expiring,  setExpiring]  = useState<ExpiryItem[]>([]);
  const [expired,   setExpired]   = useState<ExpiryItem[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [binStaff,   setBinStaff]   = useState(0);
  const [binAtt,     setBinAtt]     = useState(0);
  const [binSalary,  setBinSalary]  = useState(0);
  const bellRef = useRef<HTMLDivElement>(null);

  const isAdmin    = role === 'admin' || role === 'owner';
  const isViewer   = role === 'viewer';
  const isApproval = role === 'approval';
  const navLinks   = isAdmin ? ADMIN_NAV
                   : isViewer ? VIEWER_NAV
                   : isApproval ? APPROVAL_NAV
                   : EDITOR_NAV;

  useEffect(() => {
    if (!loaded || !isAdmin) return;
    fetch('/api/dashboard')
      .then(r => r.json())
      .then(d => {
        setExpiring(d.expiring_list || []);
        setExpired(d.expired_list || []);
        setPendingCount(d.pending_count || 0);
        setBinStaff(d.bin_staff || 0);
        setBinAtt(d.bin_att || 0);
        setBinSalary(d.bin_salary || 0);
      })
      .catch(() => {});
  }, [loaded, isAdmin]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false);
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
      {/* ── Top navigation bar ──────────────────────────────────── */}
      <nav style={{ background: '#1A0E06', borderBottom: '2px solid #C9A84C' }}
        className="sticky top-0 z-50 shadow-md">
        <div className="flex items-center h-14 px-4 md:px-6 gap-4">

          {/* Logo — taps to toggle mobile menu */}
          <button
            onClick={() => setOpen(o => !o)}
            className="flex items-center gap-2.5 shrink-0 md:cursor-default"
            aria-label="Menu">
            <BrandIcon size={32} />
            <div className="hidden md:block leading-tight">
              <p style={{ fontFamily: 'Georgia, serif', color: '#E8D5A3', fontSize: 13, fontWeight: 700, letterSpacing: 1 }}>
                BETTERMAX
              </p>
              <p style={{ fontFamily: 'Arial, sans-serif', color: '#C49A6C', fontSize: 8, letterSpacing: 3 }}>
                ENTERPRISE
              </p>
            </div>
            {/* Mobile: just "BETTERMAX" next to icon */}
            <span className="md:hidden" style={{ fontFamily: 'Georgia, serif', color: '#E8D5A3', fontSize: 13, fontWeight: 700, letterSpacing: 1 }}>
              BETTERMAX
            </span>
          </button>

          {/* Desktop nav links */}
          <ul className="hidden md:flex gap-0.5 flex-1">
            {navLinks.map(l => (
              <li key={l.href}>
                <Link href={l.href}
                  style={isActive(l.href)
                    ? { background: '#3D2B1F', color: '#C9A84C', borderBottom: '2px solid #C9A84C', fontWeight: 700 }
                    : { color: '#C49A6C' }}
                  className="px-3 py-1.5 rounded-t text-sm transition-colors block relative hover:text-[#E8D5A3] hover:bg-[#3D2B1F]"
                  onMouseEnter={e => { if (!isActive(l.href)) (e.currentTarget as HTMLElement).style.color = '#E8D5A3'; }}
                  onMouseLeave={e => { if (!isActive(l.href)) (e.currentTarget as HTMLElement).style.color = '#C49A6C'; }}>
                  {l.label}
                  {/* Pending badge */}
                  {isAdmin && l.href === '/attendance' && pendingCount > 0 && (
                    <span style={{ background: '#C9A84C', color: '#1A0E06' }}
                      className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold leading-4 text-center">
                      {pendingCount}
                    </span>
                  )}
                  {isAdmin && l.href === '/staff' && binStaff > 0 && (
                    <span className="absolute -bottom-1 -right-1 min-w-[14px] h-3.5 px-1 rounded-full text-[9px] font-bold leading-3.5 text-center text-white bg-red-600">
                      {binStaff}
                    </span>
                  )}
                  {isAdmin && l.href === '/attendance' && binAtt > 0 && (
                    <span className="absolute -bottom-1 -right-1 min-w-[14px] h-3.5 px-1 rounded-full text-[9px] font-bold leading-3.5 text-center text-white bg-red-600">
                      {binAtt}
                    </span>
                  )}
                  {isAdmin && l.href === '/salary' && binSalary > 0 && (
                    <span className="absolute -bottom-1 -right-1 min-w-[14px] h-3.5 px-1 rounded-full text-[9px] font-bold leading-3.5 text-center text-white bg-red-600">
                      {binSalary}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>

          {/* Right side */}
          <div className="ml-auto flex items-center gap-2">

            {/* Username chip — desktop */}
            {loaded && username && (
              <span className="hidden md:block text-xs px-2.5 py-1 rounded"
                style={{ color: '#C49A6C', background: '#3D2B1F' }}>
                {username}
              </span>
            )}

            {/* Bell — admin permit alerts */}
            {isAdmin && (
              <div className="relative" ref={bellRef}>
                <button
                  onClick={() => setBellOpen(b => !b)}
                  className="relative p-1.5 rounded transition-colors"
                  style={{ color: '#C9A84C' }}
                  title="Permit expiry alerts">
                  <span className="text-lg leading-none">🔔</span>
                  {totalAlerts > 0 && (
                    <span className={`absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold leading-4 text-center text-white
                      ${expired.length > 0 ? 'bg-red-600' : 'bg-orange-500'}`}>
                      {totalAlerts}
                    </span>
                  )}
                </button>

                {bellOpen && (
                  <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-lg shadow-xl z-50 overflow-hidden"
                    style={{ border: '1px solid #C9A84C' }}>
                    <div className="px-4 py-3" style={{ background: '#1A0E06', borderBottom: '1px solid #C9A84C' }}>
                      <p className="text-sm font-semibold" style={{ color: '#E8D5A3', fontFamily: 'Georgia, serif' }}>
                        Permit Expiry Alerts
                      </p>
                    </div>
                    {totalAlerts === 0 ? (
                      <div className="px-4 py-6 text-center text-sm" style={{ color: '#C49A6C' }}>
                        ✅ All permits are valid
                      </div>
                    ) : (
                      <div className="max-h-80 overflow-y-auto divide-y divide-[#FAF5E9]">
                        {expired.length > 0 && (
                          <>
                            <div className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wider"
                              style={{ background: '#fcebeb', color: '#791f1f' }}>❌ Expired</div>
                            {expired.map(e => (
                              <div key={e.id} className="px-4 py-2.5 flex items-center justify-between hover:bg-[#FAF5E9]">
                                <div>
                                  <p className="text-sm font-medium" style={{ color: '#2C1A0E' }}>{e.full_name}</p>
                                  <p className="text-xs text-red-600">Expired {Math.abs(daysDiff(e.permit_expire))} days ago</p>
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
                            <div className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wider"
                              style={{ background: '#faeeda', color: '#633806' }}>⚠️ Expiring Soon</div>
                            {expiring.map(e => {
                              const d = daysDiff(e.permit_expire);
                              return (
                                <div key={e.id} className="px-4 py-2.5 flex items-center justify-between hover:bg-[#FAF5E9]">
                                  <div>
                                    <p className="text-sm font-medium" style={{ color: '#2C1A0E' }}>{e.full_name}</p>
                                    <p className={`text-xs ${d <= 14 ? 'text-red-600' : 'text-orange-600'}`}>
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
                    <div className="px-4 py-2.5" style={{ borderTop: '1px solid #E8D5A3', background: '#FAF5E9' }}>
                      <Link href="/employees" onClick={() => setBellOpen(false)}
                        className="text-xs font-semibold hover:underline" style={{ color: '#C9A84C' }}>
                        View all employees →
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            )}

            <button onClick={logout}
              className="text-xs px-3 py-1.5 rounded transition-colors font-semibold"
              style={{ border: '1px solid #6B4226', color: '#C49A6C', background: 'transparent' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#3D2B1F'; (e.currentTarget as HTMLElement).style.color = '#E8D5A3'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#C49A6C'; }}>
              Logout
            </button>
          </div>
        </div>
      </nav>

      {/* ── Mobile dropdown menu (fixed overlay, doesn't shift layout) ── */}
      {open && (
        <div className="md:hidden fixed top-14 left-0 right-0 z-40 shadow-lg"
          style={{ background: '#1A0E06', borderBottom: '2px solid #C9A84C' }}>
          {navLinks.map(l => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)}
              className="flex items-center justify-between px-6 py-3 text-sm transition-colors relative"
              style={isActive(l.href)
                ? { background: '#3D2B1F', color: '#C9A84C', fontWeight: 700, borderLeft: '3px solid #C9A84C' }
                : { color: '#C49A6C', borderLeft: '3px solid transparent' }}>
              {l.label}
              {/* Badges on mobile */}
              {isAdmin && l.href === '/attendance' && pendingCount > 0 && (
                <span style={{ background: '#C9A84C', color: '#1A0E06' }}
                  className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-bold">
                  {pendingCount}
                </span>
              )}
            </Link>
          ))}
          {/* Username on mobile */}
          {loaded && username && (
            <div className="px-6 py-2.5 text-xs" style={{ color: '#6B4226', borderTop: '1px solid #3D2B1F' }}>
              Logged in as <strong style={{ color: '#C49A6C' }}>{username}</strong>
            </div>
          )}
        </div>
      )}
    </>
  );
}
