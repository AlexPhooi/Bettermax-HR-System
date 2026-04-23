'use client';
import { useRef, useState } from 'react';
import { formatRM, formatDate, getCurrentMonth } from '@/lib/utils';
import SavingsCalculator from '@/components/SavingsCalculator';

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
  site_bonus_balance: number;   // current balance (before this month)
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
  employee_id: string;
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
  // Map: employee_id → salary record (id + payment_slip_url)
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
      // Refresh record map so slip uploads work
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

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">

      {/* ── Print styles ── */}
      <style>{`
        @media print {
          @page { margin: 1.2cm 1.5cm; size: A4 portrait; }
          nav, .no-print { display: none !important; }
          .print-letterhead { display: block !important; }
          .salary-card { break-inside: avoid; page-break-inside: avoid; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        .print-letterhead { display: none; }
      `}</style>

      {/* ── Letterhead — print only ── */}
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
            <span className="badge bg-green-100 text-green-700 px-3 py-1.5 text-sm font-semibold">
              ✓ Finalized
            </span>
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
          {isFinalized && <span className="ml-3 text-green-700 font-semibold">— Finalized</span>}
        </div>
      )}

      {loading && (
        <div className="card animate-pulse no-print">
          <div className="space-y-3">
            {Array(5).fill(0).map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded" />)}
          </div>
        </div>
      )}

      {/* ── Totals summary bar ── */}
      {result && !loading && totals && (
        <div className="card p-4 mb-4 bg-primary/5">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            {result.data.length} employee{result.data.length !== 1 ? 's' : ''} — {result.month}
          </div>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3 text-center">
            <div>
              <div className="text-xs text-gray-400">Days</div>
              <div className="font-bold text-sm">{totals.total_days.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400">Base Pay</div>
              <div className="font-bold text-sm">{formatRM(totals.base_salary)}</div>
            </div>
            <div>
              <div className="text-xs text-green-600">Site Bonus</div>
              <div className="font-bold text-sm text-green-600">+{formatRM(totals.total_site_bonus)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400">Gross</div>
              <div className="font-bold text-sm text-accent">{formatRM(totals.gross_salary)}</div>
            </div>
            <div>
              <div className="text-xs text-red-400">Advances</div>
              <div className="font-bold text-sm text-danger">({formatRM(totals.total_advances)})</div>
            </div>
            <div>
              <div className="text-xs text-gray-400">Net Total</div>
              <div className="font-bold text-base text-accent">{formatRM(totals.net_salary)}</div>
            </div>
          </div>
        </div>
      )}

      {/* ── Per-employee cards ── */}
      {result && !loading && (
        <div className="space-y-4">
          {result.data.map(row => {
            const rec = recordMap[row.employee_id];
            const newBalance = Math.round((row.site_bonus_balance + row.total_site_bonus) * 100) / 100;
            const isUploading = uploading[row.employee_id];

            return (
              <div key={row.employee_id} className="salary-card card p-0 overflow-hidden">

                {/* ── Card Header: Name / Rate / Gong ── */}
                <div className="flex items-center justify-between px-5 py-3 bg-primary/8"
                  style={{ background: 'rgba(30,58,95,0.06)' }}>
                  <div className="flex items-center gap-4 flex-wrap">
                    <span className="font-bold text-primary text-base">{row.full_name}</span>
                    <span className="text-sm text-gray-500">
                      <span className="font-medium text-gray-700">{formatRM(row.daily_rate)}</span>
                      <span className="text-gray-400">/day</span>
                    </span>
                  </div>
                  {/* Gong indicator */}
                  <div className="text-right">
                    <span className="text-sm font-semibold text-primary">
                      {row.total_days.toFixed(2)} 工
                    </span>
                    {row.total_ot_hours > 0 && (
                      <span className="ml-2 text-xs text-orange-500 font-semibold">
                        +{row.total_ot_hours.toFixed(1)}h OT
                      </span>
                    )}
                    <div className="text-xs text-gray-400">{row.attendance_days} session{row.attendance_days !== 1 ? 's' : ''}</div>
                  </div>
                </div>

                {/* ── Two sections ── */}
                <div className="grid grid-cols-1 divide-y divide-gray-100">

                  {/* Monthly Salary */}
                  <div className="p-4">
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                      💰 Monthly Salary
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Base Pay</span>
                        <span className="font-medium">{formatRM(row.base_salary)}</span>
                      </div>
                      {row.total_site_bonus > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">🧹 Site Bonus</span>
                          <span className="font-medium text-green-600">+{formatRM(row.total_site_bonus)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-semibold border-t border-dashed border-gray-200 pt-2">
                        <span className="text-gray-700">Gross</span>
                        <span className="text-accent">{formatRM(row.gross_salary)}</span>
                      </div>
                      {row.total_advances > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">Advance Deduction</span>
                          <span className="text-danger">({formatRM(row.total_advances)})</span>
                        </div>
                      )}
                      <div className="flex justify-between font-bold border-t border-gray-200 pt-2">
                        <span>Net Salary</span>
                        <span className={row.net_salary < 0 ? 'text-danger' : 'text-accent text-base'}>
                          {formatRM(row.net_salary)}
                        </span>
                      </div>
                    </div>

                    {/* Bank details */}
                    {(row.bank_name || row.bank_account) && (
                      <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500">
                        🏦 {row.bank_name && <span className="font-medium text-gray-700">{row.bank_name}</span>}
                        {row.bank_account && <span className="ml-1 font-mono text-gray-600">{row.bank_account}</span>}
                      </div>
                    )}

                    {/* Slip upload — only when finalized */}
                    {isFinalized && rec && (
                      <div className="mt-3 no-print">
                        <input
                          type="file"
                          accept="image/*,.pdf"
                          className="hidden"
                          ref={el => { fileRefs.current[row.employee_id] = el; }}
                          onChange={e => {
                            const file = e.target.files?.[0];
                            if (file) handleSlipUpload(row.employee_id, file);
                            e.target.value = '';
                          }}
                        />
                        {rec.payment_slip_url ? (
                          <div className="flex items-center gap-2">
                            <a href={rec.payment_slip_url} target="_blank" rel="noopener noreferrer"
                              className="text-xs text-blue-600 underline">
                              📄 View Slip
                            </a>
                            <button
                              className="text-xs text-gray-400 hover:text-gray-600"
                              onClick={() => fileRefs.current[row.employee_id]?.click()}
                              disabled={isUploading}
                            >
                              {isUploading ? 'Uploading…' : '↺ Replace'}
                            </button>
                          </div>
                        ) : (
                          <button
                            className="btn btn-secondary text-xs py-1 px-3"
                            onClick={() => fileRefs.current[row.employee_id]?.click()}
                            disabled={isUploading}
                          >
                            {isUploading ? 'Uploading…' : '📎 Upload Payment Slip'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Saving Account */}
                  <div className="p-4">
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                      🧹 Saving Account
                    </div>

                    {/* Quick balance summary */}
                    <div className="flex gap-3 mb-4 text-sm">
                      <div className="flex-1 rounded-lg p-2.5 text-center"
                        style={{ background: 'rgba(30,58,95,0.07)', border: '1px solid rgba(30,58,95,0.1)' }}>
                        <div className="text-xs text-gray-400 mb-0.5">This Month</div>
                        <div className={`font-bold ${row.total_site_bonus > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                          {row.total_site_bonus > 0 ? `+${formatRM(row.total_site_bonus)}` : '-'}
                        </div>
                      </div>
                      <div className="flex-1 rounded-lg p-2.5 text-center"
                        style={{ background: 'rgba(30,58,95,0.07)', border: '1px solid rgba(30,58,95,0.1)' }}>
                        <div className="text-xs text-gray-400 mb-0.5">Balance</div>
                        <div className="font-bold text-gray-700">{formatRM(row.site_bonus_balance)}</div>
                      </div>
                      <div className="flex-1 rounded-lg p-2.5 text-center"
                        style={{ background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.2)' }}>
                        <div className="text-xs text-green-600 mb-0.5">New Balance</div>
                        <div className="font-bold text-green-700">{formatRM(newBalance)}</div>
                      </div>
                    </div>

                    {/* Growth calculator */}
                    <SavingsCalculator
                      defaultMonthly={row.total_site_bonus > 0 ? row.total_site_bonus : 10}
                      currentBalance={newBalance}
                    />
                  </div>
                </div>
              </div>
            );
          })}
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
