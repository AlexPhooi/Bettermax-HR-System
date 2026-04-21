'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatRM, formatDate, getPermitStatus } from '@/lib/utils';
import HolidayCalendar from '@/components/HolidayCalendar';
import { useRole } from '@/lib/role-context';

interface DashData {
  active_employees: number;
  month_attendance_days: number;
  month_payroll: number;
  permits_expiring: number;
  pending_count: number;
  expiring_list: { id: string; full_name: string; permit_expire: string }[];
  current_month: string;
}

const ADMIN_QUICK = [
  { href: '/projects',   icon: '🏗️', label: 'Projects' },
  { href: '/employees',  icon: '👷', label: 'Employees' },
  { href: '/attendance', icon: '📋', label: 'Attendance' },
  { href: '/salary',     icon: '💰', label: 'Salary' },
  { href: '/advances',   icon: '💳', label: 'Advances' },
];

export default function DashboardPage() {
  const { role } = useRole();
  const isAdmin = role === 'admin';

  const [data, setData] = useState<DashData | null>(null);

  useEffect(() => {
    fetch('/api/dashboard').then(r => r.json()).then(setData);
  }, []);

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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Expiring permits (admin only) */}
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
        ) : <div />}

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

      {/* Worker quick links */}
      {!isAdmin && (
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
