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
          <div className="px-6 py-3 border-b border-bg flex items-center justify-between">
            <span className="text-sm font-semibold text-primary">
              {result.data.length} employee{result.data.length !== 1 ? 's' : ''} — {result.month}
            </span>
            {isFinalized && <span className="badge bg-green-100 text-green-700 text-xs">✓ Finalized</span>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: 1100 }}>
              <thead>
                {/* ── Section group headers ── */}
                <tr>
                  {/* Profile */}
                  <th colSpan={3} className="px-4 py-2 text-center text-xs font-bold tracking-widest uppercase text-white"
                    style={{ background: '#1e3a5f', borderRight: '2px solid rgba(255,255,255,0.15)' }}>
                    👤 Profile
                  </th>
                  {/* Saving Account */}
                  <th colSpan={6} className="px-4 py-2 text-center text-xs font-bold tracking-widest uppercase text-white"
                    style={{ background: '#166534', borderRight: '2px solid rgba(255,255,255,0.15)' }}>
                    🧹 Saving Account
                  </th>
                  {/* Monthly Salary */}
                  <th colSpan={5} className="px-4 py-2 text-center text-xs font-bold tracking-widest uppercase text-white"
                    style={{ background: '#1e40af' }}>
                    💰 Monthly Salary
                  </th>
                </tr>
                {/* ── Column sub-headers ── */}
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  {/* Profile cols */}
                  <th className="table-th text-left" style={{ borderRight: '1px solid #e2e8f0' }}>Name</th>
                  <th className="table-th text-right" style={{ borderRight: '1px solid #e2e8f0' }}>Rate</th>
                  <th className="table-th text-right" style={{ borderRight: '2px solid #cbd5e1' }}>Gong</th>
                  {/* Saving Account cols */}
                  <th className="table-th text-right" style={{ borderRight: '1px solid #e2e8f0' }}>Current</th>
                  <th className="table-th text-right" style={{ borderRight: '1px solid #e2e8f0' }}>Bonus</th>
                  <th className="table-th text-right" style={{ borderRight: '1px solid #e2e8f0' }}>Withdrawal</th>
                  <th className="table-th text-left" style={{ borderRight: '1px solid #e2e8f0' }}>Transfer To</th>
                  <th className="table-th text-center no-print" style={{ borderRight: '1px solid #e2e8f0' }}>Slip</th>
                  <th className="table-th text-right" style={{ borderRight: '2px solid #cbd5e1' }}>New Balance</th>
                  {/* Monthly Salary cols */}
                  <th className="table-th text-right" style={{ borderRight: '1px solid #e2e8f0' }}>Gross</th>
                  <th className="table-th text-right" style={{ borderRight: '1px solid #e2e8f0' }}>Advance</th>
                  <th className="table-th text-right" style={{ borderRight: '1px solid #e2e8f0' }}>Net</th>
                  <th className="table-th text-left" style={{ borderRight: '1px solid #e2e8f0' }}>Transfer To</th>
                  <th className="table-th text-center no-print">Slip</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((row, idx) => {
                  const rec = recordMap[row.employee_id];
                  const isUploading = uploading[row.employee_id];
                  const newBalance = Math.round((row.site_bonus_balance + row.total_site_bonus) * 100) / 100;
                  const rowBg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
                  const tdStyle = (extra?: string) =>
                    `px-3 py-2.5 text-sm align-middle ${extra ?? ''}`;
                  return (
                    <tr key={row.employee_id} style={{ background: rowBg, borderBottom: '1px solid #f1f5f9' }}>

                      {/* ── Profile ── */}
                      <td className={tdStyle('font-medium text-gray-800')} style={{ borderRight: '1px solid #e2e8f0' }}>
                        {row.full_name}
                      </td>
                      <td className={tdStyle('text-right text-gray-600')} style={{ borderRight: '1px solid #e2e8f0' }}>
                        {formatRM(row.daily_rate)}/d
                      </td>
                      <td className={tdStyle('text-right')} style={{ borderRight: '2px solid #cbd5e1' }}>
                        <span className="font-semibold text-primary">{row.total_days.toFixed(2)} 工</span>
                        {row.total_ot_hours > 0 && (
                          <div className="text-xs text-orange-500">+{row.total_ot_hours.toFixed(1)}h OT</div>
                        )}
                      </td>

                      {/* ── Saving Account ── */}
                      <td className={tdStyle('text-right text-gray-600')} style={{ borderRight: '1px solid #e2e8f0' }}>
                        {formatRM(row.site_bonus_balance)}
                      </td>
                      <td className={tdStyle('text-right')} style={{ borderRight: '1px solid #e2e8f0' }}>
                        {row.total_site_bonus > 0
                          ? <span className="text-green-600 font-semibold">+{formatRM(row.total_site_bonus)}</span>
                          : <span className="text-gray-300">-</span>}
                      </td>
                      <td className={tdStyle('text-right text-gray-300')} style={{ borderRight: '1px solid #e2e8f0' }}>-</td>
                      <td className={tdStyle('text-left text-gray-500 text-xs')} style={{ borderRight: '1px solid #e2e8f0', maxWidth: 120 }}>
                        {row.bank_name || row.bank_account
                          ? <span>{row.bank_name && <span className="font-medium text-gray-700 block">{row.bank_name}</span>}{row.bank_account}</span>
                          : <span className="text-gray-300">-</span>}
                      </td>
                      <td className={tdStyle('text-center no-print text-gray-300')} style={{ borderRight: '1px solid #e2e8f0' }}>-</td>
                      <td className={tdStyle('text-right font-semibold text-green-700')} style={{ borderRight: '2px solid #cbd5e1' }}>
                        {formatRM(newBalance)}
                      </td>

                      {/* ── Monthly Salary ── */}
                      <td className={tdStyle('text-right font-semibold text-accent')} style={{ borderRight: '1px solid #e2e8f0' }}>
                        {formatRM(row.gross_salary)}
                      </td>
                      <td className={tdStyle('text-right')} style={{ borderRight: '1px solid #e2e8f0' }}>
                        {row.total_advances > 0
                          ? <span className="text-danger font-medium">({formatRM(row.total_advances)})</span>
                          : <span className="text-gray-300">-</span>}
                      </td>
                      <td className={tdStyle(`text-right font-bold ${row.net_salary < 0 ? 'text-danger' : 'text-accent'}`)} style={{ borderRight: '1px solid #e2e8f0' }}>
                        {formatRM(row.net_salary)}
                      </td>
                      <td className={tdStyle('text-left text-gray-500 text-xs')} style={{ borderRight: '1px solid #e2e8f0', maxWidth: 120 }}>
                        {row.bank_name || row.bank_account
                          ? <span>{row.bank_name && <span className="font-medium text-gray-700 block">{row.bank_name}</span>}{row.bank_account}</span>
                          : <span className="text-gray-300">-</span>}
                      </td>
                      {/* Salary slip upload */}
                      <td className={tdStyle('text-center no-print')}>
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
                              disabled={isUploading} title="Upload payment slip">
                              {isUploading ? '…' : '📎 Upload'}
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

              {/* ── Totals footer ── */}
              {totals && (
                <tfoot>
                  <tr style={{ background: '#f0f4f8', borderTop: '2px solid #cbd5e1', fontWeight: 700 }}>
                    <td className="px-3 py-2.5 text-sm text-primary" colSpan={2}>TOTAL</td>
                    <td className="px-3 py-2.5 text-sm text-right text-primary" style={{ borderRight: '2px solid #cbd5e1' }}>
                      {totals.total_days.toFixed(2)} 工
                    </td>
                    {/* Saving totals */}
                    <td className="px-3 py-2.5 text-sm text-right text-gray-500" style={{ borderRight: '1px solid #e2e8f0' }}>—</td>
                    <td className="px-3 py-2.5 text-sm text-right text-green-600" style={{ borderRight: '1px solid #e2e8f0' }}>
                      {totals.total_site_bonus > 0 ? `+${formatRM(totals.total_site_bonus)}` : '-'}
                    </td>
                    <td className="px-3 py-2.5" style={{ borderRight: '1px solid #e2e8f0' }} />
                    <td className="px-3 py-2.5" style={{ borderRight: '1px solid #e2e8f0' }} />
                    <td className="px-3 py-2.5 no-print" style={{ borderRight: '1px solid #e2e8f0' }} />
                    <td className="px-3 py-2.5 text-sm text-right text-green-700" style={{ borderRight: '2px solid #cbd5e1' }}>—</td>
                    {/* Salary totals */}
                    <td className="px-3 py-2.5 text-sm text-right text-accent" style={{ borderRight: '1px solid #e2e8f0' }}>
                      {formatRM(totals.gross_salary)}
                    </td>
                    <td className="px-3 py-2.5 text-sm text-right text-danger" style={{ borderRight: '1px solid #e2e8f0' }}>
                      {totals.total_advances > 0 ? `(${formatRM(totals.total_advances)})` : '-'}
                    </td>
                    <td className={`px-3 py-2.5 text-sm text-right ${totals.net_salary < 0 ? 'text-danger' : 'text-accent'}`} style={{ borderRight: '1px solid #e2e8f0' }}>
                      {formatRM(totals.net_salary)}
                    </td>
                    <td className="px-3 py-2.5" style={{ borderRight: '1px solid #e2e8f0' }} />
                    <td className="px-3 py-2.5 no-print" />
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
