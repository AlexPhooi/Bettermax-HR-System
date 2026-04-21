'use client';
import { useEffect, useState } from 'react';
import { formatDate, formatTime, getCurrentMonth } from '@/lib/utils';

interface AttRecord {
  id: string;
  work_date: string;
  clock_in: string;
  clock_out: string;
  hours_worked: number;
  days_worked: number;
  notes: string | null;
  is_rework: boolean;
  status: string;
  site_clean: boolean;
  site_bonus: number;
  projects: { name: string; code: string | null } | null;
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    pending:  'bg-yellow-100 text-yellow-700',
    approved: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
  };
  const icons: Record<string, string> = { pending: '🟡', approved: '✅', rejected: '❌' };
  return (
    <span className={`badge text-xs ${cfg[status] || 'bg-gray-100 text-gray-500'}`}>
      {icons[status]} {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export default function MyAttendancePage() {
  const [records, setRecords] = useState<AttRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth]     = useState(getCurrentMonth());

  useEffect(() => {
    setLoading(true);
    fetch(`/api/attendance?month=${month}`)
      .then(r => r.json())
      .then(d => { setRecords(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [month]);

  const totalDays       = records.filter(r => r.status === 'approved').reduce((s, r) => s + Number(r.days_worked || 0), 0);
  const totalSiteBonus  = records.filter(r => r.status === 'approved').reduce((s, r) => s + Number(r.site_bonus || 0), 0);

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-primary mb-6">My Attendance</h1>

      <div className="card p-4 mb-4">
        <div className="flex items-end gap-3">
          <div>
            <label className="form-label">Month</label>
            <input type="month" className="form-control" value={month} onChange={e => setMonth(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
        <div className="bg-white rounded-lg shadow-sm p-4 border-l-4 border-primary">
          <div className="text-xs text-gray-500 uppercase mb-1">Days Worked (approved)</div>
          <div className="text-2xl font-bold text-primary">{totalDays.toFixed(2)}</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-4 border-l-4 border-accent">
          <div className="text-xs text-gray-500 uppercase mb-1">Records</div>
          <div className="text-2xl font-bold text-accent">{records.length}</div>
        </div>
        {totalSiteBonus > 0 && (
          <div className="bg-white rounded-lg shadow-sm p-4 border-l-4 border-green-400">
            <div className="text-xs text-gray-500 uppercase mb-1">🧹 Site Bonus</div>
            <div className="text-2xl font-bold text-green-600">+RM{totalSiteBonus.toFixed(2)}</div>
          </div>
        )}
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center text-gray-400">Loading…</div>
          ) : records.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No attendance records for this month.</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-th">Date</th>
                  <th className="table-th">Project</th>
                  <th className="table-th">Clock In</th>
                  <th className="table-th">Clock Out</th>
                  <th className="table-th">Hours</th>
                  <th className="table-th">Days</th>
                  <th className="table-th">Bonus</th>
                  <th className="table-th">Status</th>
                </tr>
              </thead>
              <tbody>
                {records.map(rec => (
                  <tr key={rec.id} className={`table-tr ${rec.status === 'rejected' ? 'bg-red-50/40' : ''}`}>
                    <td className="table-td whitespace-nowrap">{formatDate(rec.work_date)}</td>
                    <td className="table-td">
                      {rec.projects
                        ? <span className="badge bg-blue-100 text-blue-700">{rec.projects.code || rec.projects.name}</span>
                        : <span className="text-gray-400">-</span>}
                      {rec.is_rework && <span className="badge bg-orange-100 text-orange-700 text-xs ml-1">🔄</span>}
                    </td>
                    <td className="table-td">{formatTime(rec.clock_in)}</td>
                    <td className="table-td">{formatTime(rec.clock_out)}</td>
                    <td className="table-td">
                      <span className={Number(rec.hours_worked) > 8 ? 'text-warn font-semibold' : ''}>
                        {Number(rec.hours_worked).toFixed(2)}h
                      </span>
                    </td>
                    <td className="table-td">{Number(rec.days_worked).toFixed(4)}</td>
                    <td className="table-td">
                      {Number(rec.site_bonus) > 0
                        ? <span className="badge bg-green-100 text-green-700">+RM{Number(rec.site_bonus).toFixed(2)}</span>
                        : <span className="text-gray-400">-</span>}
                    </td>
                    <td className="table-td"><StatusBadge status={rec.status || 'pending'} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <p className="text-xs text-gray-400 mt-3 text-center">
        Only <strong>approved</strong> attendance days are counted in salary calculations.
      </p>
    </div>
  );
}
