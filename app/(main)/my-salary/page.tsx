'use client';
import { useEffect, useState } from 'react';
import { formatRM } from '@/lib/utils';

interface SalaryRecord {
  id: string;
  month: string;
  total_days: number;
  daily_rate: number;
  base_salary: number;
  total_site_bonus: number;
  gross_salary: number;
  total_advances: number;
  net_salary: number;
  status: string;
  payment_slip_url: string | null;
}

export default function MySalaryPage() {
  const [records, setRecords] = useState<SalaryRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/salary/records')
      .then(r => r.json())
      .then(d => { setRecords(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // Sort ascending by month to compute running balance
  const sorted = [...records].sort((a, b) => a.month.localeCompare(b.month));
  // Build a running site bonus balance map: month → balance after that month
  const runningBalance: Record<string, { before: number; after: number }> = {};
  let accum = 0;
  for (const rec of sorted) {
    const bonus = Number(rec.total_site_bonus || 0);
    runningBalance[rec.id] = { before: accum, after: accum + bonus };
    accum += bonus;
  }

  // Display in descending order (newest first)
  const displayed = [...records].sort((a, b) => b.month.localeCompare(a.month));

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-primary mb-6">My Salary</h1>

      {loading && (
        <div className="space-y-4">
          {Array(3).fill(0).map((_, i) => (
            <div key={i} className="card animate-pulse h-40 bg-gray-100" />
          ))}
        </div>
      )}

      {!loading && records.length === 0 && (
        <div className="card text-center py-12 text-gray-400">
          No finalized salary records yet. Check back after the boss finalizes this month.
        </div>
      )}

      {!loading && displayed.length > 0 && (
        <div className="space-y-4">
          {displayed.map(rec => {
            const bal = runningBalance[rec.id] ?? { before: 0, after: 0 };
            return (
              <div key={rec.id} className="card p-0 overflow-hidden">

                {/* Month header */}
                <div className="flex items-center justify-between px-5 py-3"
                  style={{ background: 'rgba(30,58,95,0.06)', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                  <div>
                    <span className="font-bold text-primary text-base">{rec.month}</span>
                    <span className="ml-3 text-xs text-gray-400">
                      {Number(rec.total_days).toFixed(2)} 工 · {formatRM(rec.daily_rate)}/day
                    </span>
                  </div>
                  <span className="badge bg-green-100 text-green-700 text-xs">✓ Finalized</span>
                </div>

                <div className="grid grid-cols-1 divide-y divide-gray-100">

                  {/* Monthly Salary */}
                  <div className="p-4">
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                      💰 Monthly Salary
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Base Pay</span>
                        <span className="font-medium">{formatRM(Number(rec.base_salary || 0))}</span>
                      </div>
                      {Number(rec.total_site_bonus) > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">🧹 Site Bonus</span>
                          <span className="font-medium text-green-600">+{formatRM(Number(rec.total_site_bonus))}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-semibold border-t border-dashed border-gray-200 pt-2">
                        <span className="text-gray-700">Gross</span>
                        <span className="text-accent">{formatRM(Number(rec.gross_salary))}</span>
                      </div>
                      {Number(rec.total_advances) > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">Advance Deduction</span>
                          <span className="text-danger">({formatRM(Number(rec.total_advances))})</span>
                        </div>
                      )}
                      <div className="flex justify-between font-bold border-t border-gray-200 pt-2">
                        <span>Net Salary</span>
                        <span className={`text-base ${Number(rec.net_salary) < 0 ? 'text-danger' : 'text-accent'}`}>
                          {formatRM(Number(rec.net_salary))}
                        </span>
                      </div>
                    </div>

                    {/* Payment slip */}
                    {rec.payment_slip_url && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <a href={rec.payment_slip_url} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-blue-600 underline">
                          📄 View Payment Slip
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Saving Account */}
                  <div className="p-4">
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                      🧹 Saving Account
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-500">This Month Bonus</span>
                        <span className={Number(rec.total_site_bonus) > 0 ? 'font-medium text-green-600' : 'text-gray-400'}>
                          {Number(rec.total_site_bonus) > 0 ? `+${formatRM(Number(rec.total_site_bonus))}` : '-'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Previous Balance</span>
                        <span className="font-medium">{formatRM(bal.before)}</span>
                      </div>
                      <div className="flex justify-between font-bold border-t border-gray-200 pt-2">
                        <span>Total Saving</span>
                        <span className="text-green-700">{formatRM(bal.after)}</span>
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-gray-400 mt-4 text-center">
        Contact your manager if you have questions about your salary.
      </p>
    </div>
  );
}
