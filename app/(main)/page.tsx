'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatRM, RANK_COLORS } from '@/lib/utils';
import HolidayCalendar from '@/components/HolidayCalendar';
import { useRole } from '@/lib/role-context';

/* ── Types ──────────────────────────────────────────────────────── */
interface BirthdayEntry {
  id: string; full_name: string; date_of_birth: string;
  day?: number; days_until?: number;
}
interface DashData {
  active_employees: number;
  month_attendance_days: number;
  month_payroll: number;
  permits_expiring: number;
  pending_count: number;
  expiring_list: { id: string; full_name: string; permit_expire: string }[];
  expired_list:  { id: string; full_name: string; permit_expire: string }[];
  current_month: string;
  birthdays_this_month: BirthdayEntry[];
  upcoming_birthdays:   BirthdayEntry[];
  bin_staff: number; bin_att: number; bin_salary: number;
}
interface EmpData {
  id: string; full_name: string; rank: string | null;
  daily_rate: number; permit_expire: string | null;
  date_of_birth: string | null; avatar_url: string | null;
}
interface SalaryRecord {
  id: string; month: string; net_salary: number; status: string;
}

/* ── Helpers ────────────────────────────────────────────────────── */
const ROLE_BADGE: Record<string, string> = {
  owner:    'bg-white text-gray-800 border border-gray-300 shadow-sm',
  admin:    'bg-amber-400 text-amber-900',
  approval: 'bg-slate-300 text-slate-700',
  editor:   'bg-amber-700 text-amber-50',
  viewer:   'bg-gray-100 text-gray-600',
};
const ROLE_ICON: Record<string, string> = {
  owner: '👑', admin: '🔑', approval: '✅', editor: '✏️', viewer: '👁️',
};
const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner', admin: 'Admin', approval: 'Approval', editor: 'Editor', viewer: 'Viewer',
};

function lastMonthStr() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function monthLabel(ym: string) {
  const [y, m] = ym.split('-');
  return new Date(Number(y), Number(m) - 1).toLocaleString('en-MY', { month: 'long', year: 'numeric' });
}
function currentMonthLabel() {
  return new Date().toLocaleString('en-GB', { month: 'long', year: 'numeric' });
}

/* ── Permit status helper (shared by both dashboards) ─────────── */
function getPermitBadge(expire: string | null) {
  if (!expire) return null;
  const days = Math.floor((new Date(expire).getTime() - Date.now()) / 86400000);
  const dateStr = new Date(expire).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  if (days < 0)   return { icon: '🔴', label: 'Expired',       sub: `since ${dateStr}`,    cls: 'bg-red-50 border-red-300 text-red-700' };
  if (days === 0) return { icon: '🔴', label: 'Expires Today!', sub: dateStr,               cls: 'bg-red-50 border-red-300 text-red-700' };
  if (days <= 30) return { icon: '🔴', label: `${days} Days Left`, sub: `Expires ${dateStr}`, cls: 'bg-red-50 border-red-300 text-red-700' };
  if (days <= 60) return { icon: '🟡', label: `${days} Days Left`, sub: `Expires ${dateStr}`, cls: 'bg-yellow-50 border-yellow-300 text-yellow-700' };
  return           { icon: '🟢', label: 'Active',              sub: `Expires ${dateStr}`,  cls: 'bg-green-50 border-green-200 text-green-700' };
}

/* ══════════════════════════════════════════════════════════════════
   ADMIN DASHBOARD
══════════════════════════════════════════════════════════════════ */
const ADMIN_QUICK = [
  { href: '/projects',   icon: '🏗️', label: 'Projects' },
  { href: '/employees',  icon: '👷', label: 'Employees' },
  { href: '/attendance', icon: '📋', label: 'Record' },
  { href: '/salary',     icon: '💰', label: 'Salary' },
  { href: '/advances',   icon: '💳', label: 'Advances' },
];

function AdminDashboard() {
  const [data, setData]                   = useState<DashData | null>(null);
  const [interestApplied,  setInterestApplied]  = useState<boolean | null>(null);
  const [applyingInterest, setApplyingInterest] = useState(false);
  const [interestMsg,      setInterestMsg]      = useState('');

  useEffect(() => {
    fetch('/api/dashboard').then(r => r.json()).then(setData);
    fetch('/api/savings/apply-interest')
      .then(r => r.json())
      .then(d => { if (typeof d.applied_this_month === 'boolean') setInterestApplied(d.applied_this_month); });
  }, []);

  async function applyInterest() {
    setApplyingInterest(true); setInterestMsg('');
    try {
      const res = await fetch('/api/savings/apply-interest', { method: 'POST' });
      const d   = await res.json();
      if (res.ok) {
        setInterestApplied(true);
        setInterestMsg(`✅ Interest applied for ${currentMonthLabel()} — RM ${Number(d.total_interest_credited || 0).toFixed(2)} credited across ${d.processed || 0} accounts.`);
      } else {
        setInterestMsg(`⚠️ ${d.error || 'Failed to apply interest.'}`);
      }
    } finally { setApplyingInterest(false); }
  }

  const stats = data ? [
    { label: 'Active Employees',        value: data.active_employees,              color: 'border-primary' },
    { label: 'This Month — Days Worked', value: data.month_attendance_days.toFixed(2), color: 'border-accent', valColor: 'text-accent' },
    { label: 'This Month — Payroll Est.',value: formatRM(data.month_payroll),       color: 'border-accent', valColor: 'text-accent', small: true },
    { label: '🟡 Pending Approvals',     value: data.pending_count || 0,            color: data.pending_count > 0 ? 'border-yellow-400' : 'border-gray-200', valColor: data.pending_count > 0 ? 'text-yellow-600' : '' },
    { label: 'Permits Expiring (60d)',   value: data.permits_expiring,              color: 'border-warn', valColor: data.permits_expiring > 0 ? 'text-warn' : '' },
  ] : [];

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-primary">Dashboard</h1>
        {data && <span className="text-sm text-gray-500">Month: <strong>{data.current_month}</strong></span>}
      </div>

      {/* Interest banner */}
      {interestApplied === false && !interestMsg && (
        <div className="mb-4 flex items-center justify-between gap-3 bg-amber-50 border border-amber-300 text-amber-800 rounded-lg px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">💰</span>
            <span className="text-sm font-medium">Monthly interest not yet applied for <strong>{currentMonthLabel()}</strong>.</span>
          </div>
          <button onClick={applyInterest} disabled={applyingInterest}
            className="shrink-0 text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-md transition disabled:opacity-60">
            {applyingInterest ? 'Applying…' : 'Apply Now →'}
          </button>
        </div>
      )}
      {interestMsg && (
        <div className={`mb-4 text-sm px-4 py-3 rounded-lg border ${interestMsg.startsWith('✅') ? 'bg-green-50 border-green-300 text-green-800' : 'bg-red-50 border-red-300 text-red-800'}`}>
          {interestMsg}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        {!data
          ? Array(5).fill(0).map((_, i) => (
              <div key={i} className="bg-white rounded-lg shadow-sm p-5 border-l-4 border-gray-200 animate-pulse">
                <div className="h-3 bg-gray-200 rounded w-3/4 mb-3" />
                <div className="h-8 bg-gray-200 rounded w-1/2" />
              </div>
            ))
          : stats.map((s, i) => (
              <div key={i} className={`bg-white rounded-lg shadow-sm p-5 border-l-4 ${s.color}`}>
                <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">{s.label}</div>
                <div className={`font-bold ${s.small ? 'text-xl' : 'text-3xl'} ${s.valColor || 'text-primary'}`}>{s.value}</div>
              </div>
            ))}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Birthday widget */}
        {(() => {
          const bdays   = data?.birthdays_this_month ?? [];
          const upcoming = data?.upcoming_birthdays ?? [];
          if (bdays.length === 0 && upcoming.length === 0) return null;
          return (
            <div className="card">
              <div className="card-title">🎂 Birthdays</div>
              {bdays.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">This Month</p>
                  <div className="space-y-2 mb-3">
                    {bdays.map(b => {
                      const dob = new Date(b.date_of_birth);
                      const thisYearBday = new Date(new Date().getFullYear(), dob.getMonth(), dob.getDate());
                      const daysUntil = Math.round((thisYearBday.getTime() - Date.now()) / 86400000);
                      const isToday   = daysUntil === 0;
                      return (
                        <div key={b.id} className={`flex items-center gap-3 rounded-lg px-3 py-2 ${isToday ? 'bg-pink-100 ring-2 ring-pink-300' : 'bg-pink-50'}`}>
                          <span className="text-xl">{isToday ? '🎂' : '🎉'}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-pink-800 truncate">{b.full_name}</p>
                            <p className="text-xs text-pink-500">
                              {dob.toLocaleDateString('en-MY', { day: 'numeric', month: 'long' })}
                              {isToday ? ' — Today! 🎊' : ` — in ${daysUntil} day${daysUntil !== 1 ? 's' : ''}`}
                            </p>
                          </div>
                          {isToday && <span className="badge bg-pink-500 text-white text-xs shrink-0">x2 Bonus!</span>}
                          {!isToday && <span className="badge bg-pink-100 text-pink-600 text-xs shrink-0">x2 Month</span>}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
              {upcoming.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Upcoming (30 days)</p>
                  <div className="space-y-1.5">
                    {upcoming.map(b => {
                      const dob = new Date(b.date_of_birth);
                      return (
                        <div key={b.id} className="flex items-center gap-3 px-3 py-2 bg-gray-50 rounded-lg">
                          <span className="text-base">🎈</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-700 truncate">{b.full_name}</p>
                            <p className="text-xs text-gray-400">
                              {dob.toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })} — in {b.days_until} day{b.days_until !== 1 ? 's' : ''}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          );
        })()}

        {/* Expiring permits */}
        {data?.expiring_list?.length ? (
          <div className="card">
            <div className="card-title">⚠ Permits Expiring Soon</div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr>
                  <th className="table-th">Employee</th>
                  <th className="table-th">Permit Expiry</th>
                </tr></thead>
                <tbody>
                  {data.expiring_list.map(e => {
                    const p = getPermitBadge(e.permit_expire);
                    return (
                      <tr key={e.id} className="table-tr">
                        <td className="table-td">{e.full_name}</td>
                        <td className={`table-td ${p.cls}`}>{p.label}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {/* Holiday calendar */}
        <HolidayCalendar mode="upcoming" maxItems={5} />
      </div>

      {/* Quick actions */}
      <div className="card">
        <div className="card-title">Quick Actions</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {ADMIN_QUICK.map(q => (
            <Link key={q.href} href={q.href}
              className="block bg-white border-2 border-gray-200 hover:border-primary rounded-lg p-4 text-center transition-all hover:shadow-md hover:-translate-y-0.5 relative">
              <div className="text-3xl mb-2">{q.icon}</div>
              <div className="text-sm font-semibold text-primary">{q.label}</div>
              {q.href === '/attendance' && (data?.pending_count ?? 0) > 0 && (
                <span className="absolute -top-2 -right-2 min-w-[20px] h-5 px-1 rounded-full text-xs font-bold leading-5 text-center text-white bg-yellow-500">
                  {data?.pending_count}
                </span>
              )}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   EMPLOYEE DASHBOARD  (viewer / editor / approval)
══════════════════════════════════════════════════════════════════ */
function EmployeeDashboard({ role }: { role: string }) {
  const [dash,    setDash]    = useState<DashData | null>(null);
  const [emp,     setEmp]     = useState<EmpData | null>(null);
  const [salary,  setSalary]  = useState<SalaryRecord | null>(null);
  const [savings, setSavings] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/dashboard').then(r => r.json()).then(setDash);

    fetch('/api/employees?self=true').then(r => r.json()).then(d => {
      if (Array.isArray(d) && d.length > 0) setEmp(d[0]);
      else if (d && !Array.isArray(d) && !d.error) setEmp(d);
    });

    fetch(`/api/salary/records?month=${lastMonthStr()}`).then(r => r.json()).then(d => {
      if (Array.isArray(d) && d.length > 0) setSalary(d[0]);
      else setSalary(null);
    });

    fetch('/api/savings').then(r => r.json()).then(d => {
      if (Array.isArray(d) && d.length > 0) setSavings(Number(d[0].current_balance ?? 0));
      else setSavings(0);
    });
  }, []);

  const daysWorked   = dash?.month_attendance_days ?? 0;
  const pendingCount = dash?.pending_count ?? 0;
  const loading      = !dash || !emp;

  // ── Birthday ──────────────────────────────────────────────────
  const now           = new Date();
  const currentMonth  = now.getMonth() + 1;
  const currentDay    = now.getDate();
  const dobMonth      = emp?.date_of_birth ? Number(emp.date_of_birth.slice(5, 7)) : null;
  const dobDay        = emp?.date_of_birth ? Number(emp.date_of_birth.slice(8, 10)) : null;
  const isBirthdayMonth = dobMonth !== null && dobMonth === currentMonth;
  const isBirthdayToday = isBirthdayMonth && dobDay === currentDay;

  // ── Permit Status ─────────────────────────────────────────────
  const permitBadge = getPermitBadge(emp?.permit_expire ?? null);

  return (
    <div className="p-4 md:p-6 max-w-lg mx-auto space-y-4">

      {/* ── Section 1: Basic Information ────────────────────────── */}
      <div className={`card p-4 overflow-hidden relative ${isBirthdayMonth ? 'border-2 border-pink-300' : ''}`}>
        {/* Birthday month background shimmer */}
        {isBirthdayMonth && (
          <div className="absolute inset-0 bg-gradient-to-br from-pink-50 via-purple-50 to-yellow-50 opacity-60 pointer-events-none" />
        )}

        {loading ? (
          <div className="flex items-center gap-4 animate-pulse relative">
            <div className="w-16 h-16 rounded-full bg-gray-200 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-5 bg-gray-200 rounded w-2/3" />
              <div className="h-4 bg-gray-200 rounded w-1/2" />
            </div>
          </div>
        ) : (
          <div className="relative">
            {/* Avatar + name row */}
            <div className="flex items-center gap-4">
              <div className="shrink-0 relative">
                {emp?.avatar_url
                  ? <img src={emp.avatar_url} alt="avatar"
                      className={`w-16 h-16 rounded-full object-cover border-2 ${isBirthdayMonth ? 'border-pink-400 ring-2 ring-pink-200' : 'border-primary/20'}`} />
                  : <div className={`w-16 h-16 rounded-full flex items-center justify-center text-3xl select-none ${isBirthdayMonth ? 'bg-pink-100' : 'bg-primary/10'}`}>
                      {ROLE_ICON[role] || '👤'}
                    </div>
                }
                {/* Birthday icon above avatar */}
                {isBirthdayToday && (
                  <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-2xl drop-shadow-sm">🎂</span>
                )}
                {isBirthdayMonth && !isBirthdayToday && (
                  <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-2xl drop-shadow-sm">🎉</span>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className={`text-lg font-bold truncate ${isBirthdayMonth ? 'text-pink-800' : 'text-gray-800'}`}>
                  {emp?.full_name || '—'}
                </p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className={`badge text-xs font-semibold px-2 py-0.5 rounded-full ${ROLE_BADGE[role] || 'bg-gray-100 text-gray-600'}`}>
                    {ROLE_ICON[role]} {ROLE_LABEL[role] || role}
                  </span>
                  {emp?.rank && (
                    <span className={`badge text-xs ${RANK_COLORS[emp.rank] ?? 'bg-blue-50 text-blue-600'}`}>
                      {emp.rank}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Birthday banner */}
            {isBirthdayToday && (
              <div className="mt-3 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 px-4 py-2.5 text-white">
                <p className="font-extrabold text-sm">🎂 Happy Birthday, {emp?.full_name?.split(' ')[0]}! 🎊</p>
                <p className="text-xs opacity-90 mt-0.5">Your site bonus is doubled today — enjoy your special day! 🎁</p>
              </div>
            )}
            {isBirthdayMonth && !isBirthdayToday && (
              <div className="mt-3 rounded-xl bg-gradient-to-r from-pink-100 to-purple-100 border border-pink-200 px-4 py-2.5">
                <p className="font-bold text-sm text-pink-700">🎉 Birthday Month!</p>
                <p className="text-xs text-pink-600 mt-0.5">x2 Site Bonus active all month · Every approved day earns RM 20</p>
              </div>
            )}

            {/* Permit status */}
            {permitBadge && (
              <div className={`mt-3 flex items-center justify-between rounded-xl border px-3 py-2 ${permitBadge.cls}`}>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide opacity-60 mb-0.5">Work Permit</p>
                  <p className="font-bold text-sm leading-none">{permitBadge.icon} {permitBadge.label}</p>
                </div>
                <p className="text-xs opacity-70 text-right">{permitBadge.sub}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Section 2: Upcoming Public Holidays ─────────────────── */}
      <HolidayCalendar mode="upcoming" maxItems={3} />

      {/* ── Section 3: Attendance Action (editor / approval only) ─ */}
      {(role === 'editor' || role === 'approval') && (
        <div className="card p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            {role === 'approval' ? 'Attendance Approval' : 'Update Attendance'}
          </p>

          {role === 'approval' ? (
            pendingCount > 0 ? (
              <Link href="/attendance"
                className="flex items-center justify-between bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 hover:bg-yellow-100 transition-colors">
                <div>
                  <p className="font-semibold text-yellow-800">🟡 Pending Approvals</p>
                  <p className="text-xs text-yellow-600 mt-0.5">Tap to review and approve</p>
                </div>
                <span className="text-4xl font-extrabold text-yellow-500 leading-none">{pendingCount}</span>
              </Link>
            ) : (
              <Link href="/attendance"
                className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-4 py-3 hover:bg-green-100 transition-colors">
                <div>
                  <p className="font-semibold text-green-700">✅ All Up to Date</p>
                  <p className="text-xs text-green-500 mt-0.5">No pending approvals</p>
                </div>
                <span className="text-2xl text-green-400">→</span>
              </Link>
            )
          ) : (
            <Link href="/attendance"
              className="flex items-center justify-between bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 hover:bg-primary/10 transition-colors">
              <div>
                <p className="font-semibold text-primary">Submit Today's Attendance</p>
                <p className="text-xs text-gray-400 mt-0.5">Check in your team</p>
              </div>
              <span className="text-3xl leading-none">📋</span>
            </Link>
          )}
        </div>
      )}

      {/* ── Section 4: 4 Summary Tiles ──────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">

        {/* a. Days Worked This Month */}
        <Link href={role === 'viewer' ? '/my-attendance' : '/attendance'}
          className="card p-4 hover:shadow-md transition-shadow text-left block">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Days Worked</p>
          {loading
            ? <div className="h-8 bg-gray-200 rounded animate-pulse w-2/3" />
            : <p className="text-3xl font-extrabold text-primary leading-none">{daysWorked.toFixed(2)}</p>
          }
          <p className="text-xs text-gray-400 mt-2">This Month · Approved</p>
        </Link>

        {/* b. Last Month Salary */}
        <Link href="/my-salary"
          className="card p-4 hover:shadow-md transition-shadow text-left block">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Last Salary</p>
          {salary === undefined ? (
            <div className="h-8 bg-gray-200 rounded animate-pulse w-2/3" />
          ) : salary ? (
            <>
              <p className="text-xl font-extrabold text-primary leading-none">{formatRM(salary.net_salary)}</p>
              <span className={`inline-flex items-center mt-2 badge text-xs ${salary.status === 'finalized' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                {salary.status === 'finalized' ? '✓ Paid' : '⏳ Unpaid'}
              </span>
              <p className="text-xs text-gray-400 mt-1">{monthLabel(salary.month)}</p>
            </>
          ) : (
            <p className="text-sm text-gray-400 mt-1">No record yet</p>
          )}
        </Link>

        {/* c. Saving Account */}
        {(role === 'viewer' || role === 'editor') ? (
          <Link href="/my-saving" className="card p-4 hover:shadow-md transition-shadow text-left block">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Saving Account</p>
            {savings === null
              ? <div className="h-8 bg-gray-200 rounded animate-pulse w-2/3" />
              : <p className="text-xl font-extrabold text-green-600 leading-none">{formatRM(savings)}</p>
            }
            <p className="text-xs text-gray-400 mt-2">Current Balance →</p>
          </Link>
        ) : (
          <div className="card p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Saving Account</p>
            {savings === null
              ? <div className="h-8 bg-gray-200 rounded animate-pulse w-2/3" />
              : <p className="text-xl font-extrabold text-green-600 leading-none">{formatRM(savings)}</p>
            }
            <p className="text-xs text-gray-400 mt-2">Current Balance</p>
          </div>
        )}

        {/* d. Daily Rate (Settings) */}
        <Link href="/my-profile"
          className="card p-4 hover:shadow-md transition-shadow text-left block">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Daily Rate</p>
          {loading
            ? <div className="h-8 bg-gray-200 rounded animate-pulse w-2/3" />
            : <p className="text-xl font-extrabold text-primary leading-none">{formatRM(emp?.daily_rate ?? 0)}</p>
          }
          <p className="text-xs text-gray-400 mt-2">My Profile →</p>
        </Link>

      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   ROOT — picks which dashboard to show
══════════════════════════════════════════════════════════════════ */
export default function DashboardPage() {
  const { role, loaded } = useRole();

  if (!loaded) return (
    <div className="p-4 md:p-6 max-w-lg mx-auto space-y-4 animate-pulse">
      <div className="card h-24" />
      <div className="card h-32" />
      <div className="grid grid-cols-2 gap-3">
        {Array(4).fill(0).map((_, i) => <div key={i} className="card h-24" />)}
      </div>
    </div>
  );

  const isAdmin = role === 'admin' || role === 'owner';
  if (isAdmin) return <AdminDashboard />;
  return <EmployeeDashboard role={role} />;
}
