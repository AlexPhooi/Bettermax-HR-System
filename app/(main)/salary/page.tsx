'use client';
import { useRef, useState } from 'react';
import { formatRM, formatDate, getCurrentMonth } from '@/lib/utils';

interface SalaryRow {
  employee_id: string;
  full_name: string;
  total_days: number;
  total_ot_hours: number;
  daily_rate: number;
  base_salary: number;
  total_site_bonus: number;
  gross_salary: number;
  total_advances: number;
  net_salary: number;
  attendance_days: number;
  site_bonus_balance: number;
  bank_name: string | null;
  bank_account: string | null;
}

interface SalaryResult {
  month: string;
  payment_due: string;
  data: SalaryRow[];
}

interface SalaryRecord {
  id: string;
  payment_slip_url: string | null;
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
  const [recordMap, setRecordMap]     = useState<Record<string, SalaryRecord>>({});
  const [uploading, setUploading]     = useState<Record<string, boolean>>({});
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  function showAlert(msg: string, type: 'success' | 'danger' | 'warning' = 'success') {
    setAlertMsg(msg); setAlertType(type);
    setTimeout(() => setAlertMsg(''), 5000);
  }

  async function calculate() {
    setLoading(true); setCalculated(false); setIsFinalized(false);
    setResult(null); setRecordMap({});
    try {
      const res = await fetch(`/api/salary/calculate?month=${month}`);
      const data = await res.json();
      if (!res.ok) { showAlert(data.error, 'danger'); return; }
      setResult(data);
      setCalculated(true);
      const recRes = await fetch(`/api/salary/records?month=${month}`);
      const recData = await recRes.json();
      if (Array.isArray(recData) && recData.length > 0) {
        setIsFinalized(true);
        const map: Record<string, SalaryRecord> = {};
        for (const r of recData) map[r.employee_id] = { id: r.id, payment_slip_url: r.payment_slip_url };
        setRecordMap(map);
      }
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
      showAlert(`Salary for ${result.month} finalized! Site bonus balances updated.`);
      setIsFinalized(true);
      const recRes = await fetch(`/api/salary/records?month=${result.month}`);
      const recData = await recRes.json();
      if (Array.isArray(recData)) {
        const map: Record<string, SalaryRecord> = {};
        for (const r of recData) map[r.employee_id] = { id: r.id, payment_slip_url: r.payment_slip_url };
        setRecordMap(map);
      }
    } finally { setFinalizing(false); }
  }

  async function handleSlipUpload(employeeId: string, file: File) {
    const rec = recordMap[employeeId];
    if (!rec) { showAlert('Finalize salary first before uploading slip.', 'warning'); return; }
    setUploading(u => ({ ...u, [employeeId]: true }));
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('type', 'salary_slip');
      const upRes = await fetch('/api/upload', { method: 'POST', body: form });
      const upData = await upRes.json();
      if (!upRes.ok) { showAlert(upData.error || 'Upload failed.', 'danger'); return; }
      const patchRes = await fetch(`/api/salary/records/${rec.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_slip_url: upData.url }),
      });
      if (!patchRes.ok) { showAlert('Failed to save slip URL.', 'danger'); return; }
      setRecordMap(m => ({ ...m, [employeeId]: { ...m[employeeId], payment_slip_url: upData.url } }));
      showAlert('Payment slip uploaded!');
    } finally {
      setUploading(u => ({ ...u, [employeeId]: false }));
    }
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

      {/* ── Print styles ── */}
      <style>{`
        @media print {
          @page { margin: 1.2cm 1.5cm; size: A4 landscape; }
          nav, .no-print { display: none !important; }
          .print-letterhead { display: block !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        .print-letterhead { display: none; }
      `}</style>

      {/* ── Letterhead (print only) ── */}
      <div className="print-letterhead pb-4 mb-5" style={{ borderBottom: '2px solid #1e3a5f' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#1e3a5f' }}>🏢 Bettermax Enterprise HR</div>
            <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '2px' }}>Internal Salary Report</div>
          </div>
          <div style={{ textAlign: 'right', fontSize: '12px', color: '#6b7280', lineHeight: '1.6' }}>
            <div><strong>Month:</strong> {result?.month || month}</div>
            <div><strong>Generated:</strong> {new Date().toLocaleDateString('en-MY', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
            {result && <div><strong>Payment Due:</strong> {formatDate(result.payment_due)}</div>}
            {isFinalized && <div style={{ color: '#16a34a', fontWeight: 600 }}>✓ Finalized</div>}
          </div>
        </div>
      </div>

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3 no-print">
        <h1 className="text-2xl font-bold text-primary">Salary Calculator</h1>
        <div className="flex gap-2 flex-wrap">
          {calculated && !isFinalized && (
            <button className="btn btn-success" onClick={finalize} disabled={finalizing}>
              {finalizing ? 'Finalizing…' : '✓ Finalize Salary'}
            </button>
          )}
          {isFinalized && (
            <span className="badge bg-green-100 text-green-700 px-3 py-1.5 text-sm font-semibold">✓ Finalized</span>
          )}
          <button className="btn btn-secondary" onClick={() => window.print()}>🖨 Print</button>
        </div>
      </div>

      {alertMsg && <div className={`alert alert-${alertType} no-print`}>{alertMsg}</div>}

      {/* ── Month selector ── */}
      <div className="card p-4 mb-4 no-print">
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="form-label">Salary Month</label>
            <input type="month" className="form-control" value={month}
              onChange={e => { setMonth(e.target.value); setCalculated(false); setResult(null); setRecordMap({}); }} />
          </div>
          <button className="btn btn-primary" onClick={calculate} disabled={loading}>
            {loading ? 'Calculating…' : '⚡ Calculate'}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">⚠️ Only <strong>approved</strong> attendance records are included.</p>
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
            {Array(5).fill(0).map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded" />)}
          </div>
        </div>
      )}

      {/* ── Table ── */}
      {result && !loading && (
        <div className="card p-0 overflow-hidden print:shadow-none print:border-0">
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
                  <th className="table-th text-center no-print">Slip</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map(row => {
                  const rec = recordMap[row.employee_id];
                  const isUploading = uploading[row.employee_id];
                  return (
                    <tr key={row.employee_id} className="table-tr">
                      <td className="table-td">
                        <div className="font-medium">{row.full_name}</div>
                        {(row.bank_name || row.bank_account) && (
                          <div className="text-xs text-gray-400 mt-0.5">
                            🏦 {row.bank_name} {row.bank_account}
                          </div>
                        )}
                      </td>
                      <td className="table-td text-right">
                        <span className="text-gray-400 text-xs">({row.attendance_days}d /</span>
                        <span className="font-semibold ml-0.5">{row.total_days.toFixed(4)}</span>
                        <span className="text-gray-400 text-xs">)</span>
                        {row.total_ot_hours > 0 && (
                          <div className="text-xs text-orange-500">+{row.total_ot_hours.toFixed(1)}h OT</div>
                        )}
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
                      {/* Slip upload — only after finalize */}
                      <td className="table-td text-center no-print">
                        <input type="file" accept="image/*,.pdf" className="hidden"
                          ref={el => { fileRefs.current[row.employee_id] = el; }}
                          onChange={e => {
                            const file = e.target.files?.[0];
                            if (file) handleSlipUpload(row.employee_id, file);
                            e.target.value = '';
                          }} />
                        {isFinalized && rec ? (
                          rec.payment_slip_url ? (
                            <div className="flex items-center justify-center gap-1">
                              <a href={rec.payment_slip_url} target="_blank" rel="noopener noreferrer"
                                className="text-xs text-blue-600 underline">📄</a>
                              <button className="text-xs text-gray-400 hover:text-gray-600"
                                onClick={() => fileRefs.current[row.employee_id]?.click()}
                                disabled={isUploading}>
                                {isUploading ? '…' : '↺'}
                              </button>
                            </div>
                          ) : (
                            <button className="text-xs text-gray-400 hover:text-primary"
                              onClick={() => fileRefs.current[row.employee_id]?.click()}
                              disabled={isUploading}
                              title="Upload payment slip">
                              {isUploading ? '…' : '📎'}
                            </button>
                          )
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
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
                    <td className="table-td no-print" />
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
    </div>
  );
}
