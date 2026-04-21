'use client';
import { useEffect, useState } from 'react';
import { formatRM } from '@/lib/utils';

interface SalaryRecord {
  id: string;
  month: string;
  total_days: number;
  daily_rate: number;
  gross_salary: number;
  total_advances: number;
  net_salary: number;
  status: string;
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

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-primary mb-6">My Salary Records</h1>

      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading…</div>
        ) : records.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No finalized salary records yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-th">Month</th>
                  <th className="table-th text-right">Days</th>
                  <th className="table-th text-right">Daily Rate</th>
                  <th className="table-th text-right">Gross</th>
                  <th className="table-th text-right">Advances</th>
                  <th className="table-th text-right">Net Salary</th>
                  <th className="table-th">Status</th>
                </tr>
              </thead>
              <tbody>
                {records.map(rec => (
                  <tr key={rec.id} className="table-tr">
                    <td className="table-td font-medium">{rec.month}</td>
                    <td className="table-td text-right">{Number(rec.total_days).toFixed(4)}</td>
                    <td className="table-td text-right">{formatRM(rec.daily_rate)}</td>
                    <td className="table-td text-right text-accent font-semibold">{formatRM(rec.gross_salary)}</td>
                    <td className="table-td text-right">
                      {Number(rec.total_advances) > 0
                        ? <span className="text-danger">({formatRM(rec.total_advances)})</span>
                        : <span className="text-gray-400">-</span>}
                    </td>
                    <td className={`table-td text-right font-bold ${rec.net_salary < 0 ? 'text-danger' : 'text-accent'}`}>
                      {formatRM(rec.net_salary)}
                    </td>
                    <td className="table-td">
                      <span className={`badge ${rec.status === 'finalized' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                        {rec.status === 'finalized' ? '✓ Finalized' : rec.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400 mt-3 text-center">
        Contact your manager if you have questions about your salary.
      </p>
    </div>
  );
}
