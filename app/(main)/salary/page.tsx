'use client';
import { useState } from 'react';
import { formatRM, formatDate, getCurrentMonth } from '@/lib/utils';

interface SalaryRow {
  employee_id: string;
  full_name: string;
  total_days: number;
  daily_rate: number;
  base_salary: number;
  total_site_bonus: number;
  gross_salary: number;
  total_advances: number;
  net_salary: number;
  attendance_days: number;
}

interface SalaryResult {
  month: string;
  payment_due: string;
  data: SalaryRow[];
}

export default function SalaryPage() {
  const [month, setMonth]             = useState(getCurrentMonth());
  const [result, setResult]           = useState<SalaryResult | null>(null);
  const [loading, setLoading]         = useState(false);
  const [calculated, setCalculated]   = useState(false);
  const [isFinalized, setIsFinalized] = useState(false);
  const [alertMsg, setAlertMsg]       = useState('');
  const [alertType, setAlertType]     = useState<'success' | 'danger' | 'warning'>('success');
  const [finalizing, setFinalizing]   = useState(false);

  function showAlert(msg: string, type: 'success' | 'danger' | 'warning' = 'success') {
    setAlertMsg(msg); setAlertType(type);
    setTimeout(() => setAlertMsg(''), 5000);
  }

  async function calculate() {
    setLoading(true); setCalculated(false); setIsFinalized(false); setResult(null);
    try {
      const res = await fetch(`/api/salary/calculate?month=${month}`);
      const data = await res.json();
      if (!res.ok) { showAlert(data.error, 'danger'); return; }
      setResult(data);
      setCalculated(true);

      const recRes = await fetch(`/api/salary/records?month=${month}`);
      const recData = await recRes.json();
      if (Array.isArray(recData) && recData.length > 0) setIsFinalized(true);
    } finally { setLoading(false); }
  }

  async function finalize() {
    if (!result) return;
    if (!confirm(`Finalize salary for ${result.month}? This will overwrite any existing records.`)) return;
    setFinalizing(true);
    try {
      const res = await fetch('/api/salary/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: result.month, records: result.data }),
      });
      const data = await res.json();
      if (!res.ok) { showAlert(data.error, 'danger'); return; }
      showAlert(`Salary for ${result.month} finalized successfully!`);
      setIsFinalized(true);
    } finally { setFinalizing(false); }
  }

  const totals = result ? {
    total_days:       result.data.reduce((s, r) => s + r.total_days,       0),
    base_salary:      result.data.reduce((s, r) => s + r.base_salary,      0),
    total_site_bonus: result.data.reduce((s, r) => s + r.total_site_bonus, 0),
    gross_salary:     result.data.reduce((s, r) => s + r.gross_salary,     0),
    total_advances:   result.data.reduce((s, r) => s + r.total_advances,   0),
    net_salary:       result.data.reduce((s, r) => s + r.net_salary,       0),
  } : null;

  const hasSiteBonus = result?.data.some(r => r.total_site_bonus > 0);

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">

      {/* ── Print-only styles: suppress browser header/footer, inject letterhead ── */}
      <style>{`
        @media print {
          @page { margin: 0; size: A4 portrait; }
          body > * { display: none !important; }
          #salary-print-root { display: block !important; }
          #salary-print-root .no-print { display: none !important; }
        }
        #salary-print-root { display: contents; }
      `}</style>

      <div id="salary-print-root">

        {/* ── Letterhead — hidden on screen, first thing printed ── */}
        <div className="hidden print:block px-10 pt-8 pb-4 border-b-2 border-gray-800 mb-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-2xl font-extrabold text-gray-900 tracking-tight">🏢 Bettermax Enterprise HR</p>
              <p className="text-sm text-gray-500 mt-0.5">Internal Salary Report</p>
            </div>
            <div className="text-right text-sm text-gray-500">
              <p><strong>Month:</strong> {result?.month || month}</p>
              <p><strong>Generated:</strong> {new Date().toLocaleDateString('en-MY', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
              {result && <p><strong>Payment Due:</strong> {formatDate(result.payment_due)}</p>}
              {isFinalized && <p className="text-green-700 font-semibold mt-0.5">✓ Finalized</p>}
            </div>
          </div>
        </div>

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3 no-print">
        <h1 className="text-2xl font-bold text-primary">Salary Calculator</h1>
        <div className="flex gap-2 flex-wrap">
          {calculated && !isFinalized && (
            <button className="btn btn-success" onClick={finalize} disabled={finalizing}>
              {finalizing ? 'Finalizing…' : '✓ Finalize Salary'}
            </button>
          )}
          {isFinalized && (
            <span className="badge bg-green-100 text-green-700 px-3 py-1.5 text-sm">
              ✓ Finalized
            </span>
          )}
          <button className="btn btn-secondary" onClick={() => window.print()}>🖨 Print</button>
        </div>
      </div>

      {alertMsg && <div className={`alert alert-${alertType} no-print`}>{alertMsg}</div>}

      <div className="card p-4 mb-4 no-print">
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="form-label">Salary Month</label>
            <input type="month" className="form-control" value={month}
              onChange={e => { setMonth(e.target.value); setCalculated(false); setResult(null); }} />
          </div>
          <button className="btn btn-primary" onClick={calculate} disabled={loading}>
            {loading ? 'Calculating…' : '⚡ Calculate'}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">⚠️ Only <strong>approved</strong> attendance records are included in salary calculation.</p>
      </div>

      {result && (
        <div className="alert alert-warning mb-4 no-print">
          <strong>Payment Due:</strong> {formatDate(result.payment_due)} (7th of following month)
          {isFinalized && <span className="ml-3 text-green-700 font-semibold">— This month has been finalized</span>}
        </div>
      )}

      {loading && (
        <div className="card animate-pulse no-print">
          <div className="space-y-3">
            {Array(5).fill(0).map((_, i) => (
              <div key={i} className="h-10 bg-gray-100 rounded" />
            ))}
          </div>
        </div>
      )}

      {result && !loading && (
        <div className="card p-0 overflow-hidden print:shadow-none print:border-0 print:px-10">
          <div className="px-6 py-4 border-b border-bg flex items-center justify-between">
            <span className="text-sm font-semibold text-primary">
              {result.data.length} employee{result.data.length !== 1 ? 's' : ''} — {result.month}
            </span>
            {hasSiteBonus && (
              <span className="badge bg-green-100 text-green-700 text-xs">🧹 Site Bonus included</span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-th">Employee</th>
                  <th className="table-th text-right">Days</th>
                  <th className="table-th text-right">Rate</th>
                  <th className="table-th text-right">Base Pay</th>
                  <th className="table-th text-right">🧹 Site Bonus</th>
                  <th className="table-th text-right">Gross</th>
                  <th className="table-th text-right">Advances</th>
                  <th className="table-th text-right">Net Salary</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map(row => (
                  <tr key={row.employee_id} className="table-tr">
                    <td className="table-td font-medium">{row.full_name}</td>
                    <td className="table-td text-right">
                      <span className="text-gray-500 text-xs mr-1">({row.attendance_days}d /</span>
                      <span className="font-semibold">{row.total_days.toFixed(4)}</span>
                      <span className="text-gray-500 text-xs">)</span>
                    </td>
                    <td className="table-td text-right">{formatRM(row.daily_rate)}</td>
                    <td className="table-td text-right">{formatRM(row.base_salary)}</td>
                    <td className="table-td text-right">
                      {row.total_site_bonus > 0
                        ? <span className="text-green-600 font-semibold">+{formatRM(row.total_site_bonus)}</span>
                        : <span className="text-gray-400">-</span>}
                    </td>
                    <td className="table-td text-right text-accent font-semibold">{formatRM(row.gross_salary)}</td>
                    <td className="table-td text-right">
                      {row.total_advances > 0
                        ? <span className="text-danger font-semibold">({formatRM(row.total_advances)})</span>
                        : <span className="text-gray-400">-</span>}
                    </td>
                    <td className={`table-td text-right font-bold ${row.net_salary < 0 ? 'text-danger' : 'text-accent'}`}>
                      {formatRM(row.net_salary)}
                    </td>
                  </tr>
                ))}
              </tbody>
              {totals && (
                <tfoot>
                  <tr className="bg-primary/5 font-bold">
                    <td className="table-td">TOTAL</td>
                    <td className="table-td text-right">{totals.total_days.toFixed(4)}</td>
                    <td className="table-td" />
                    <td className="table-td text-right">{formatRM(totals.base_salary)}</td>
                    <td className="table-td text-right text-green-600">
                      {totals.total_site_bonus > 0 ? `+${formatRM(totals.total_site_bonus)}` : '-'}
                    </td>
                    <td className="table-td text-right text-accent">{formatRM(totals.gross_salary)}</td>
                    <td className="table-td text-right text-danger">
                      {totals.total_advances > 0 ? `(${formatRM(totals.total_advances)})` : '-'}
                    </td>
                    <td className={`table-td text-right ${totals.net_salary < 0 ? 'text-danger' : 'text-accent'}`}>
                      {formatRM(totals.net_salary)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {!loading && !result && (
        <div className="card text-center py-12 text-gray-400 no-print">
          Select a month and click Calculate to generate the salary report.
        </div>
      )}

      </div>{/* end #salary-print-root */}
    </div>
  );
}
