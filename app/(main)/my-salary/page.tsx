'use client';
import { useEffect, useState } from 'react';

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

function fmtRM(n: number) {
  return 'RM ' + Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function monthLabel(ym: string) {
  const [y, m] = ym.split('-');
  return new Date(Number(y), Number(m) - 1).toLocaleString('en-MY', { month: 'long', year: 'numeric' });
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

  const displayed = [...records].sort((a, b) => b.month.localeCompare(a.month));

  return (
    <div className="p-4 md:p-6 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-primary mb-6">My Salary</h1>

      {loading && (
        <div className="space-y-3">
          {Array(3).fill(0).map((_, i) => (
            <div key={i} className="card animate-pulse h-28 bg-gray-100" />
          ))}
        </div>
      )}

      {!loading && records.length === 0 && (
        <div className="card text-center py-12 text-gray-400">
          No salary records yet. Check back after your manager finalizes this month.
        </div>
      )}

      {!loading && displayed.length > 0 && (
        <div className="space-y-3">
          {displayed.map(rec => {
            const days      = Number(rec.total_days || 0);
            const rate      = Number(rec.daily_rate || 0);
            const basePay   = Number(rec.base_salary || 0);
            const bonus     = Number(rec.total_site_bonus || 0);
            const advances  = Number(rec.total_advances || 0);
            const net       = Number(rec.net_salary || 0);
            const isNeg     = net < 0;

            return (
              <div key={rec.id} className="card p-0 overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 bg-primary/5 border-b border-gray-100">
                  <div>
                    <p className="font-bold text-primary text-base">{monthLabel(rec.month)}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {days.toFixed(1)} days × {fmtRM(rate)}/day
                    </p>
                  </div>
                  <span className={`badge text-xs ${rec.status === 'finalized' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {rec.status === 'finalized' ? '✓ Paid' : '⏳ Draft'}
                  </span>
                </div>

                {/* Breakdown */}
                <div className="px-4 py-3 space-y-2 text-sm">
                  <div className="flex justify-between text-gray-500">
                    <span>Base Pay ({days.toFixed(1)} days)</span>
                    <span>{fmtRM(basePay)}</span>
                  </div>

                  {bonus > 0 && (
                    <div className="flex justify-between text-green-600">
                      <span>🧹 Site Bonus</span>
                      <span>+ {fmtRM(bonus)}</span>
                    </div>
                  )}

                  {advances > 0 && (
                    <div className="flex justify-between text-red-500">
                      <span>Advance Deduction</span>
                      <span>- {fmtRM(advances)}</span>
                    </div>
                  )}

                  {/* Net */}
                  <div className="flex justify-between items-center border-t border-gray-100 pt-2 mt-1">
                    <span className="font-bold text-gray-800">Net Salary</span>
                    <span className={`text-xl font-extrabold ${isNeg ? 'text-red-500' : 'text-primary'}`}>
                      {fmtRM(net)}
                    </span>
                  </div>
                </div>

                {/* Payment slip */}
                {rec.payment_slip_url && (
                  <div className="px-4 pb-3 -mt-1">
                    <a href={rec.payment_slip_url} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline">
                      📄 View Payment Slip
                    </a>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-gray-400 mt-5 text-center">
        Questions about your salary? Contact your manager.
      </p>
    </div>
  );
}
