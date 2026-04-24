'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatRM, formatDate, getPermitStatus } from '@/lib/utils';
import HolidayCalendar from '@/components/HolidayCalendar';
import { useRole } from '@/lib/role-context';

interface BirthdayEntry {
  id: string; full_name: string; date_of_birth: string;
  day?: number;       // for this-month list
  days_until?: number; // for upcoming list
}

interface DashData {
  active_employees: number;
  month_attendance_days: number;
  month_payroll: number;
  permits_expiring: number;
  pending_count: number;
  expiring_list: { id: string; full_name: string; permit_expire: string }[];
  current_month: string;
  birthdays_this_month: BirthdayEntry[];
  upcoming_birthdays:   BirthdayEntry[];
  bin_staff: number; bin_att: number; bin_salary: number;
}

function currentMonthLabel() {
  return new Date().toLocaleString('en-GB', { month: 'long', year: 'numeric' });
}

const ADMIN_QUICK = [
  { href: '/projects',   icon: '🏗️', label: 'Projects' },
  { href: '/employees',  icon: '👷', label: 'Employees' },
  { href: '/attendance', icon: '📋', label: 'Record' },
  { href: '/salary',     icon: '💰', label: 'Salary' },
  { href: '/advances',   icon: '💳', label: 'Advances' },
];

export default function DashboardPage() {
  const { role } = useRole();
  const isAdmin = role === 'admin' || role === 'owner';

  const [data, setData] = useState<DashData | null>(null);
  const [interestApplied,   setInterestApplied]   = useState<boolean | null>(null);
  const [applyingInterest,  setApplyingInterest]  = useState(false);
  const [interestMsg,       setInterestMsg]        = useState('');

  useEffect(() => {
    fetch('/api/dashboard').then(r => r.json()).then(setData);
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    fetch('/api/savings/apply-interest')
      .then(r => r.json())
      .then(d => { if (typeof d.applied_this_month === 'boolean') setInterestApplied(d.applied_this_month); });
  }, [isAdmin]);

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

  const stats = data && isAdmin ? [
    { label: 'Active Employees', value: data.active_employees, color: 'border-primary' },
    { label: 'This Month — Days Worked', value: data.month_attendance_days.toFixed(2), color: 'border-accent', valColor: 'text-accent' },
    { label: 'This Month — Payroll Est.', value: formatRM(data.month_payroll), color: 'border-accent', valColor: 'text-accent', small: true },
    { label: '🟡 Pending Approvals', value: data.pending_count || 0, color: data.pending_count > 0 ? 'border-yellow-400' : 'border-gray-200', valColor: data.pending_count > 0 ? 'text-yellow-600' : '' },
    { label: 'Permits Expiring (60d)', value: data.permits_expiring, color: 'border-warn', valColor: data.permits_expiring > 0 ? 'text-warn' : '' },
  ] : data ? [
    { label: 'My Days Worked This Month', value: data.month_attendance_days.toFixed(2), color: 'border-accent', valColor: 'text-accent' },
  ] : [];

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-primary">Dashboard</h1>
        {data && <span className="text-sm text-gray-500">Month: <strong>{data.current_month}</strong></span>}
      </div>

      {/* ── Interest banner (admin only) ── */}
      {isAdmin && interestApplied === false && !interestMsg && (
        <div className="mb-4 flex items-center justify-between gap-3 bg-amber-50 border border-amber-300 text-amber-800 rounded-lg px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">💰</span>
            <span className="text-sm font-medium">
              Monthly interest not yet applied for <strong>{currentMonthLabel()}</strong>.
            </span>
          </div>
          <button
            onClick={applyInterest}
            disabled={applyingInterest}
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
          ? Array(isAdmin ? 5 : 1).fill(0).map((_, i) => (
              <div key={i} className="bg-white rounded-lg shadow-sm p-5 border-l-4 border-gray-200 animate-pulse">
                <div className="h-3 bg-gray-200 rounded w-3/4 mb-3" />
                <div className="h-8 bg-gray-200 rounded w-1/2" />
              </div>
            ))
          : stats.map((s, i) => (
              <div key={i} className={`bg-white rounded-lg shadow-sm p-5 border-l-4 ${s.color}`}>
                <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">{s.label}</div>
                <div className={`font-bold ${s.small ? 'text-xl' : 'text-3xl'} ${s.valColor || 'text-primary'}`}>
                  {s.value}
                </div>
              </div>
            ))}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">

        {/* ── Birthday widget (admin) ── */}
        {isAdmin && (() => {
          const bdays = data?.birthdays_this_month ?? [];
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
                      const isToday = daysUntil === 0;
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

        {/* ── Expiring permits (admin only) ── */}
        {isAdmin && data?.expiring_list?.length ? (
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
                    const p = getPermitStatus(e.permit_expire);
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

      {/* Quick actions (admin only) */}
      {isAdmin && (
        <div className="card">
          <div className="card-title">Quick Actions</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {ADMIN_QUICK.map(q => (
              <Link key={q.href} href={q.href}
                className="block bg-white border-2 border-gray-200 hover:border-primary rounded-lg p-4 text-center transition-all hover:shadow-md hover:-translate-y-0.5 group relative">
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
      )}

      {/* Editor / Approval quick links */}
      {(role === 'editor' || role === 'approval') && (
        <div className="card">
          <div className="card-title">Quick Access</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { href: '/attendance',  icon: '📋', label: 'Record' },
              { href: '/my-salary',   icon: '💰', label: 'My Salary' },
              { href: '/my-profile',  icon: '👤', label: 'My Profile' },
            ].map(q => (
              <Link key={q.href} href={q.href}
                className="block bg-white border-2 border-gray-200 hover:border-primary rounded-lg p-4 text-center transition-all hover:shadow-md hover:-translate-y-0.5">
                <div className="text-3xl mb-2">{q.icon}</div>
                <div className="text-sm font-semibold text-primary">{q.label}</div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Viewer quick links */}
      {role === 'viewer' && (
        <div className="card">
          <div className="card-title">Quick Access</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { href: '/my-attendance', icon: '📋', label: 'My Attendance' },
              { href: '/my-salary',     icon: '💰', label: 'My Salary' },
              { href: '/my-profile',    icon: '👤', label: 'My Profile' },
            ].map(q => (
              <Link key={q.href} href={q.href}
                className="block bg-white border-2 border-gray-200 hover:border-primary rounded-lg p-4 text-center transition-all hover:shadow-md hover:-translate-y-0.5">
                <div className="text-3xl mb-2">{q.icon}</div>
                <div className="text-sm font-semibold text-primary">{q.label}</div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
