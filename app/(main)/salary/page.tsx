'use client';
import { useEffect, useRef, useState, useMemo } from 'react';
import { formatRM, formatDate, getCurrentMonth } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface HistoryRecord {
  id: string;
  employee_id: string;
  month: string;
  total_days: number;
  daily_rate: number;
  base_salary: number;
  total_site_bonus: number;
  gross_salary: number;
  total_advances: number;
  net_salary: number;
  payment_slip_url: string | null;
  employees: { full_name: string; bank_name: string | null; bank_account: string | null } | null;
}

interface CalcRow {
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
  bank_name: string | null;
  bank_account: string | null;
}

interface CalcResult { month: string; payment_due: string; data: CalcRow[] }

type Section  = 'history' | 'current';
type SortBy   = 'none' | 'name' | 'rank';
type SlipRec  = { id: string; payment_slip_url: string | null };

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SalaryPage() {
  const curMonth = getCurrentMonth();

  // Data
  const [history,     setHistory]     = useState<HistoryRecord[]>([]);
  const [current,     setCurrent]     = useState<CalcResult | null>(null);
  const [curRecordMap, setCurRecordMap] = useState<Record<string, SlipRec>>({});
  const [loading,     setLoading]     = useState(true);
  const [curFinalized, setCurFinalized] = useState(false);
  const [finalizing,  setFinalizing]  = useState(false);

  // View
  const [view,    setView]    = useState<'overview' | 'detail'>('overview');
  const [section, setSection] = useState<Section>('history');

  // Filter
  const [filterMonth, setFilterMonth] = useState('all');
  const [sortBy,      setSortBy]      = useState<SortBy>('none');
  const [applied,     setApplied]     = useState(false);

  // Slip upload
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Alert
  const [alertMsg,  setAlertMsg]  = useState('');
  const [alertType, setAlertType] = useState<'success' | 'danger' | 'warning'>('success');

  // Bin
  const [binOpen,    setBinOpen]    = useState(false);
  const [binData,    setBinData]    = useState<{id: string; month: string; net_salary: number; deleted_at: string; employees: {full_name: string} | null}[] | null>(null);
  const [binLoading, setBinLoading] = useState(false);

  function showAlert(msg: string, type: 'success' | 'danger' | 'warning' = 'success') {
    setAlertMsg(msg); setAlertType(type);
    setTimeout(() => setAlertMsg(''), 5000);
  }

  // ── Load on mount ────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [histRes, calcRes, recRes] = await Promise.all([
          fetch('/api/salary/records').then(r => r.json()),
          fetch(`/api/salary/calculate?month=${curMonth}`).then(r => r.json()),
          fetch(`/api/salary/records?month=${curMonth}`).then(r => r.json()),
        ]);
        if (Array.isArray(histRes)) setHistory(histRes);
        if (calcRes?.data) setCurrent(calcRes);
        if (Array.isArray(recRes) && recRes.length > 0) {
          setCurFinalized(true);
          const map: Record<string, SlipRec> = {};
          for (const r of recRes) map[r.employee_id] = { id: r.id, payment_slip_url: r.payment_slip_url };
          setCurRecordMap(map);
        }
      } finally { setLoading(false); }
    }
    load();
  }, [curMonth]);

  // ── Finalize current month ───────────────────────────────────────────────────
  async function finalize() {
    if (!current) return;
    if (!confirm(`Finalize salary for ${current.month}?`)) return;
    setFinalizing(true);
    try {
      const res = await fetch('/api/salary/finalize', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: current.month, records: current.data }),
      });
      const data = await res.json();
      if (!res.ok) { showAlert(data.error, 'danger'); return; }
      showAlert(`Salary for ${current.month} finalized!`);
      setCurFinalized(true);
      // Refresh records map + history
      const [recRes, histRes] = await Promise.all([
        fetch(`/api/salary/records?month=${current.month}`).then(r => r.json()),
        fetch('/api/salary/records').then(r => r.json()),
      ]);
      if (Array.isArray(recRes)) {
        const map: Record<string, SlipRec> = {};
        for (const r of recRes) map[r.employee_id] = { id: r.id, payment_slip_url: r.payment_slip_url };
        setCurRecordMap(map);
      }
      if (Array.isArray(histRes)) setHistory(histRes);
    } finally { setFinalizing(false); }
  }

  // ── Bin ──────────────────────────────────────────────────────────────────────
  async function loadBin() {
    setBinLoading(true);
    const res = await fetch('/api/bin');
    const data = await res.json();
    setBinData(res.ok ? (data.salary || []) : null);
    setBinLoading(false);
  }

  async function handleRestoreSalary(id: string) {
    const res = await fetch('/api/bin/restore', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'salary', id }),
    });
    const d = await res.json();
    if (res.ok) { showAlert('Salary record restored.'); loadBin(); }
    else showAlert(d.error || 'Restore failed.', 'danger');
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (binOpen && !binData) loadBin();
  }, [binOpen]);

  // ── Slip upload ──────────────────────────────────────────────────────────────
  async function handleSlipUpload(key: string, recId: string, file: File, isCurrent: boolean) {
    setUploading(u => ({ ...u, [key]: true }));
    try {
      const form = new FormData();
      form.append('file', file); form.append('type', 'salary_slip');
      const upRes  = await fetch('/api/upload', { method: 'POST', body: form });
      const upData = await upRes.json();
      if (!upRes.ok) { showAlert(upData.error || 'Upload failed.', 'danger'); return; }

      const patchRes = await fetch(`/api/salary/records/${recId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_slip_url: upData.url }),
      });
      if (!patchRes.ok) { showAlert('Failed to save slip.', 'danger'); return; }

      showAlert('Payment slip uploaded!');
      if (isCurrent) {
        setCurRecordMap(m => ({ ...m, [key]: { ...m[key], payment_slip_url: upData.url } }));
      } else {
        setHistory(h => h.map(r => r.id === recId ? { ...r, payment_slip_url: upData.url } : r));
      }
    } finally { setUploading(u => ({ ...u, [key]: false })); }
  }

  // ── Derived: history totals ──────────────────────────────────────────────────
  // Exclude current month from history cards
  const pastHistory = useMemo(() => history.filter(r => r.month !== curMonth), [history, curMonth]);
  const totalPaid   = useMemo(() =>
    pastHistory.filter(r => r.payment_slip_url).reduce((s, r) => s + Number(r.net_salary), 0),
    [pastHistory]);
  const totalUnpaid = useMemo(() =>
    pastHistory.filter(r => !r.payment_slip_url).reduce((s, r) => s + Number(r.net_salary), 0),
    [pastHistory]);

  // ── Derived: current month totals ───────────────────────────────────────────
  const curGross   = useMemo(() => current?.data.reduce((s, r) => s + r.gross_salary,   0) ?? 0, [current]);
  const curAdvance = useMemo(() => current?.data.reduce((s, r) => s + r.total_advances, 0) ?? 0, [current]);
  const curNet     = useMemo(() => current?.data.reduce((s, r) => s + r.net_salary,     0) ?? 0, [current]);

  // ── Distinct past months for filter dropdown ─────────────────────────────────
  const pastMonths = useMemo(() =>
    Array.from(new Set(pastHistory.map(r => r.month))).sort((a, b) => b.localeCompare(a)),
    [pastHistory]);

  // ── Filtered + sorted rows for detail view ───────────────────────────────────
  const detailRows = useMemo(() => {
    if (section === 'history') {
      let rows = applied && filterMonth !== 'all'
        ? pastHistory.filter(r => r.month === filterMonth)
        : pastHistory;
      if (sortBy === 'name') rows = [...rows].sort((a, b) => (a.employees?.full_name ?? '').localeCompare(b.employees?.full_name ?? ''));
      if (sortBy === 'rank') rows = [...rows].sort((a, b) => Number(b.daily_rate) - Number(a.daily_rate));
      return rows;
    } else {
      // Current month — sort the calc rows
      let rows = current?.data ?? [];
      if (sortBy === 'name') rows = [...rows].sort((a, b) => a.full_name.localeCompare(b.full_name));
      if (sortBy === 'rank') rows = [...rows].sort((a, b) => b.daily_rate - a.daily_rate);
      return rows;
    }
  }, [section, applied, filterMonth, sortBy, pastHistory, current]);

  // ── Summary totals for letterhead ───────────────────────────────────────────
  const summaryTotals = useMemo(() => {
    if (section === 'history') {
      const rows = detailRows as HistoryRecord[];
      return {
        gross:   rows.reduce((s, r) => s + Number(r.gross_salary),   0),
        advance: rows.reduce((s, r) => s + Number(r.total_advances), 0),
        net:     rows.reduce((s, r) => s + Number(r.net_salary),     0),
      };
    } else {
      const rows = detailRows as CalcRow[];
      return {
        gross:   rows.reduce((s, r) => s + r.gross_salary,   0),
        advance: rows.reduce((s, r) => s + r.total_advances, 0),
        net:     rows.reduce((s, r) => s + r.net_salary,     0),
      };
    }
  }, [detailRows, section]);

  // ─────────────────────────────────────────────────────────────────────────────

  function openDetail(s: Section) {
    setSection(s);
    setFilterMonth('all');
    setSortBy('none');
    setApplied(false);
    setView('detail');
  }

  // ─── Print styles ─────────────────────────────────────────────────────────────
  const printStyles = `
    @media print {
      @page { margin: 1.2cm 1.5cm; size: A4 landscape; }
      nav, .no-print { display: none !important; }
      .print-show { display: block !important; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
    .print-show { display: none; }
  `;

  // ─── OVERVIEW ─────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-primary mb-6">Salary</h1>
      <div className="grid grid-cols-2 gap-4">
        {[1,2].map(i => <div key={i} className="card animate-pulse h-44" />)}
      </div>
    </div>
  );

  // ─── DETAIL VIEW ──────────────────────────────────────────────────────────────
  if (view === 'detail') {
    const isHistory = section === 'history';
    const histRows  = detailRows as HistoryRecord[];
    const calcRows  = detailRows as CalcRow[];
    const label     = isHistory ? 'History' : `Current Month (${curMonth})`;

    return (
      <div className="p-4 md:p-6 max-w-full mx-auto">
        <style>{printStyles}</style>

        {/* Print letterhead */}
        <div className="print-show pb-4 mb-4" style={{ borderBottom: '2px solid #1e3a5f' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#1e3a5f' }}>🏢 Bettermax Enterprise HR</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>Salary Report — {label}</div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 12, color: '#6b7280' }}>
              <div>Generated: {new Date().toLocaleDateString('en-MY', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
              {!isHistory && current && <div>Payment Due: {formatDate(current.payment_due)}</div>}
            </div>
          </div>
        </div>

        {/* Back + title */}
        <div className="flex items-center gap-3 mb-5 no-print flex-wrap">
          <button className="btn btn-secondary text-sm py-1.5 px-3" onClick={() => setView('overview')}>← Back</button>
          <h1 className="text-xl font-bold text-primary">Salary — {label}</h1>
          <div className="ml-auto flex gap-2">
            {!isHistory && !curFinalized && (
              <button className="btn btn-success text-sm" onClick={finalize} disabled={finalizing}>
                {finalizing ? 'Finalizing…' : '✓ Finalize'}
              </button>
            )}
            {!isHistory && curFinalized && (
              <span className="badge bg-green-100 text-green-700 px-3 py-1.5 text-sm">✓ Finalized</span>
            )}
            <button className="btn btn-secondary text-sm" onClick={() => window.print()}>🖨 Print</button>
          </div>
        </div>

        {alertMsg && <div className={`alert alert-${alertType} mb-4 no-print`}>{alertMsg}</div>}

        {/* Filter bar */}
        <div className="card p-4 mb-4 no-print">
          <div className="flex items-end gap-3 flex-wrap">
            {isHistory && (
              <div>
                <label className="form-label">Month</label>
                <select className="form-control" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}>
                  <option value="all">All</option>
                  {pastMonths.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="form-label">Sort By</label>
              <select className="form-control" value={sortBy} onChange={e => setSortBy(e.target.value as SortBy)}>
                <option value="none">None</option>
                <option value="name">Name</option>
                <option value="rank">Rank (Rate)</option>
              </select>
            </div>
            <button className="btn btn-primary" onClick={() => setApplied(true)}>Apply</button>
            {applied && (
              <button className="btn btn-secondary" onClick={() => { setFilterMonth('all'); setSortBy('none'); setApplied(false); }}>
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Summary letterhead */}
        <div className="card p-4 mb-4" style={{ background: 'rgba(30,58,95,0.04)', border: '1px solid rgba(30,58,95,0.12)' }}>
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            {isHistory ? (filterMonth === 'all' ? 'All History Summary' : `Summary — ${filterMonth}`) : `${curMonth} Summary`}
          </div>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-xs text-gray-400 mb-1">Total Gross</div>
              <div className="text-lg font-bold text-accent">{formatRM(summaryTotals.gross)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">Total Advance</div>
              <div className="text-lg font-bold text-danger">
                {summaryTotals.advance > 0 ? `(${formatRM(summaryTotals.advance)})` : '-'}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">Total Net</div>
              <div className="text-lg font-bold text-primary">{formatRM(summaryTotals.net)}</div>
            </div>
          </div>
        </div>

        {/* Detail table */}
        {/* ── Bin (detail view) ── */}
        <div className="mt-8 no-print">
          <button
            onClick={() => setBinOpen(b => !b)}
            className="w-full flex items-center justify-between px-5 py-3 rounded-xl border-2 border-dashed border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-600 transition-colors"
          >
            <span className="flex items-center gap-2 font-semibold text-sm">
              🗑️ Bin
              {binData && binData.length > 0 && (
                <span className="bg-red-100 text-red-600 text-xs font-bold px-2 py-0.5 rounded-full">{binData.length}</span>
              )}
            </span>
            <span className="text-xs">{binOpen ? '▲ Collapse' : '▼ Expand'}</span>
          </button>
          {binOpen && (
            <div className="mt-3 card p-0 overflow-hidden">
              <div className="px-5 py-3 border-b border-bg bg-gray-50">
                <p className="text-xs text-gray-500">Deleted salary records are stored here. Restore to recover.</p>
              </div>
              <div className="p-4">
                {binLoading ? (
                  <div className="py-8 text-center text-gray-400 text-sm">Loading bin…</div>
                ) : !binData || binData.length === 0 ? (
                  <div className="py-8 text-center text-gray-400 text-sm">No deleted salary records.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr>
                          <th className="table-th">Month</th>
                          <th className="table-th">Employee</th>
                          <th className="table-th">Net Salary</th>
                          <th className="table-th">Deleted At</th>
                          <th className="table-th">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {binData.map(row => (
                          <tr key={row.id} className="table-tr">
                            <td className="table-td font-medium">{row.month}</td>
                            <td className="table-td">{row.employees?.full_name || <span className="text-gray-400">—</span>}</td>
                            <td className="table-td">{formatRM(row.net_salary)}</td>
                            <td className="table-td text-gray-500">
                              {new Date(row.deleted_at).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </td>
                            <td className="table-td">
                              <button onClick={() => handleRestoreSalary(row.id)} className="btn btn-sm bg-green-500 hover:bg-green-600 text-white">↩ Restore</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {detailRows.length === 0 ? (
          <div className="card py-12 text-center text-gray-400">No records found.</div>
        ) : (
          <div className="card p-0 overflow-hidden print:shadow-none print:border-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ minWidth: 900 }}>
                <thead>
                  <tr style={{ background: '#1e3a5f' }}>
                    {isHistory && <th className="px-3 py-2.5 text-left text-xs text-white font-semibold">Month</th>}
                    <th className="px-3 py-2.5 text-left text-xs text-white font-semibold">Name</th>
                    <th className="px-3 py-2.5 text-right text-xs text-white font-semibold">Rate</th>
                    <th className="px-3 py-2.5 text-right text-xs text-white font-semibold">Days 工</th>
                    <th className="px-3 py-2.5 text-right text-xs text-white font-semibold">OT</th>
                    <th className="px-3 py-2.5 text-right text-xs text-white font-semibold">Gross</th>
                    <th className="px-3 py-2.5 text-right text-xs text-white font-semibold">Advance</th>
                    <th className="px-3 py-2.5 text-right text-xs text-white font-semibold">Net</th>
                    <th className="px-3 py-2.5 text-left text-xs text-white font-semibold">Transfer To</th>
                    <th className="px-3 py-2.5 text-center text-xs text-white font-semibold no-print">Slip</th>
                  </tr>
                </thead>
                <tbody>
                  {isHistory ? histRows.map((row, idx) => {
                    const key = row.id;
                    const isUp = uploading[key];
                    return (
                      <tr key={key} style={{ background: idx % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                        <td className="px-3 py-2.5 text-xs text-gray-500 font-mono">{row.month}</td>
                        <td className="px-3 py-2.5 font-medium text-gray-800">{row.employees?.full_name ?? '-'}</td>
                        <td className="px-3 py-2.5 text-right text-gray-600">{formatRM(Number(row.daily_rate))}</td>
                        <td className="px-3 py-2.5 text-right font-semibold text-primary">{Number(row.total_days).toFixed(2)}</td>
                        <td className="px-3 py-2.5 text-right text-gray-400">-</td>
                        <td className="px-3 py-2.5 text-right text-accent font-semibold">{formatRM(Number(row.gross_salary))}</td>
                        <td className="px-3 py-2.5 text-right">
                          {Number(row.total_advances) > 0
                            ? <span className="text-danger">({formatRM(Number(row.total_advances))})</span>
                            : <span className="text-gray-300">-</span>}
                        </td>
                        <td className={`px-3 py-2.5 text-right font-bold ${Number(row.net_salary) < 0 ? 'text-danger' : 'text-accent'}`}>
                          {formatRM(Number(row.net_salary))}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-gray-500">
                          {row.employees?.bank_name && <div className="font-medium text-gray-700">{row.employees.bank_name}</div>}
                          {row.employees?.bank_account ?? '-'}
                        </td>
                        <td className="px-3 py-2.5 text-center no-print">
                          <input type="file" accept="image/*,.pdf" className="hidden"
                            ref={el => { fileRefs.current[key] = el; }}
                            onChange={e => { const f = e.target.files?.[0]; if (f) handleSlipUpload(key, row.id, f, false); e.target.value = ''; }} />
                          {row.payment_slip_url ? (
                            <div className="flex items-center justify-center gap-1">
                              <a href={row.payment_slip_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 underline">📄</a>
                              <button className="text-xs text-gray-400 hover:text-gray-600" onClick={() => fileRefs.current[key]?.click()} disabled={isUp}>
                                {isUp ? '…' : '↺'}
                              </button>
                            </div>
                          ) : (
                            <button className="text-xs text-gray-400 hover:text-primary" onClick={() => fileRefs.current[key]?.click()} disabled={isUp}>
                              {isUp ? '…' : '📎 Upload'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  }) : calcRows.map((row, idx) => {
                    const key = row.employee_id;
                    const rec = curRecordMap[key];
                    const isUp = uploading[key];
                    return (
                      <tr key={key} style={{ background: idx % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                        <td className="px-3 py-2.5 font-medium text-gray-800">{row.full_name}</td>
                        <td className="px-3 py-2.5 text-right text-gray-600">{formatRM(row.daily_rate)}</td>
                        <td className="px-3 py-2.5 text-right font-semibold text-primary">{row.total_days.toFixed(2)}</td>
                        <td className="px-3 py-2.5 text-right text-orange-500">
                          {row.total_ot_hours > 0 ? `+${row.total_ot_hours.toFixed(1)}h` : <span className="text-gray-300">-</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right text-accent font-semibold">{formatRM(row.gross_salary)}</td>
                        <td className="px-3 py-2.5 text-right">
                          {row.total_advances > 0
                            ? <span className="text-danger">({formatRM(row.total_advances)})</span>
                            : <span className="text-gray-300">-</span>}
                        </td>
                        <td className={`px-3 py-2.5 text-right font-bold ${row.net_salary < 0 ? 'text-danger' : 'text-accent'}`}>
                          {formatRM(row.net_salary)}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-gray-500">
                          {row.bank_name && <div className="font-medium text-gray-700">{row.bank_name}</div>}
                          {row.bank_account ?? <span className="text-gray-300">-</span>}
                        </td>
                        <td className="px-3 py-2.5 text-center no-print">
                          <input type="file" accept="image/*,.pdf" className="hidden"
                            ref={el => { fileRefs.current[key] = el; }}
                            onChange={e => { const f = e.target.files?.[0]; if (f && rec) handleSlipUpload(key, rec.id, f, true); e.target.value = ''; }} />
                          {curFinalized && rec ? (
                            rec.payment_slip_url ? (
                              <div className="flex items-center justify-center gap-1">
                                <a href={rec.payment_slip_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 underline">📄</a>
                                <button className="text-xs text-gray-400 hover:text-gray-600" onClick={() => fileRefs.current[key]?.click()} disabled={isUp}>
                                  {isUp ? '…' : '↺'}
                                </button>
                              </div>
                            ) : (
                              <button className="text-xs text-gray-400 hover:text-primary" onClick={() => fileRefs.current[key]?.click()} disabled={isUp}>
                                {isUp ? '…' : '📎 Upload'}
                              </button>
                            )
                          ) : (
                            <span className="text-gray-300 text-xs">{curFinalized ? '—' : 'Finalize first'}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {/* Totals footer */}
                <tfoot>
                  <tr style={{ background: '#f0f4f8', borderTop: '2px solid #cbd5e1', fontWeight: 700 }}>
                    {isHistory && <td className="px-3 py-2.5 text-xs text-gray-500">TOTAL</td>}
                    <td className="px-3 py-2.5 text-sm text-primary" colSpan={isHistory ? 1 : 2}>TOTAL</td>
                    <td className="px-3 py-2.5" />
                    <td className="px-3 py-2.5 text-right text-sm text-primary">
                      {isHistory
                        ? histRows.reduce((s, r) => s + Number(r.total_days), 0).toFixed(2)
                        : calcRows.reduce((s, r) => s + r.total_days, 0).toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5" />
                    <td className="px-3 py-2.5 text-right text-sm text-accent">{formatRM(summaryTotals.gross)}</td>
                    <td className="px-3 py-2.5 text-right text-sm text-danger">
                      {summaryTotals.advance > 0 ? `(${formatRM(summaryTotals.advance)})` : '-'}
                    </td>
                    <td className="px-3 py-2.5 text-right text-sm text-accent">{formatRM(summaryTotals.net)}</td>
                    <td className="px-3 py-2.5" />
                    <td className="px-3 py-2.5 no-print" />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── OVERVIEW ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <style>{printStyles}</style>
      <h1 className="text-2xl font-bold text-primary mb-6">Salary</h1>

      {alertMsg && <div className={`alert alert-${alertType} mb-4`}>{alertMsg}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* ── History Card ── */}
        <div className="card p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="font-bold text-primary text-base">📜 History</div>
            <span className="text-xs text-gray-400">{pastMonths.length} month{pastMonths.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center p-3 rounded-lg" style={{ background: 'rgba(22,163,74,0.07)', border: '1px solid rgba(22,163,74,0.15)' }}>
              <div>
                <div className="text-xs text-gray-400 mb-0.5">Total Paid</div>
                <div className="text-xs text-green-600">Slip uploaded</div>
              </div>
              <div className="font-bold text-green-700 text-lg">{formatRM(totalPaid)}</div>
            </div>
            <div className="flex justify-between items-center p-3 rounded-lg" style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)' }}>
              <div>
                <div className="text-xs text-gray-400 mb-0.5">Total Unpaid</div>
                <div className="text-xs text-red-400">No slip yet</div>
              </div>
              <div className="font-bold text-danger text-lg">{formatRM(totalUnpaid)}</div>
            </div>
          </div>
          <button className="btn btn-primary w-full mt-auto" onClick={() => openDetail('history')}>
            Details →
          </button>
        </div>

        {/* ── Current Month Card ── */}
        <div className="card p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="font-bold text-primary text-base">📅 Current Month</div>
            <span className="text-xs text-gray-400">{curMonth}</span>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center p-3 rounded-lg" style={{ background: 'rgba(30,58,95,0.05)', border: '1px solid rgba(30,58,95,0.12)' }}>
              <div>
                <div className="text-xs text-gray-400 mb-0.5">Total Ongoing</div>
                <div className="text-xs text-gray-500">Gross salary</div>
              </div>
              <div className="font-bold text-primary text-lg">{formatRM(curGross)}</div>
            </div>
            <div className="flex justify-between items-center p-3 rounded-lg" style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)' }}>
              <div>
                <div className="text-xs text-gray-400 mb-0.5">Total Advance</div>
                <div className="text-xs text-red-400">Deductions</div>
              </div>
              <div className="font-bold text-danger text-lg">
                {curAdvance > 0 ? `(${formatRM(curAdvance)})` : formatRM(0)}
              </div>
            </div>
            <div className="flex justify-between items-center p-3 rounded-lg" style={{ background: 'rgba(22,163,74,0.07)', border: '1px solid rgba(22,163,74,0.15)' }}>
              <div>
                <div className="text-xs text-gray-400 mb-0.5">Balance</div>
                <div className="text-xs text-green-600">Net payable</div>
              </div>
              <div className="font-bold text-green-700 text-lg">{formatRM(curNet)}</div>
            </div>
          </div>
          <button className="btn btn-primary w-full mt-auto" onClick={() => openDetail('current')}>
            Details →
          </button>
        </div>

      </div>

      {/* ── Bin ── */}
      <div className="mt-8">
        <button
          onClick={() => setBinOpen(b => !b)}
          className="w-full flex items-center justify-between px-5 py-3 rounded-xl border-2 border-dashed border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-600 transition-colors"
        >
          <span className="flex items-center gap-2 font-semibold text-sm">
            🗑️ Bin
            {binData && binData.length > 0 && (
              <span className="bg-red-100 text-red-600 text-xs font-bold px-2 py-0.5 rounded-full">{binData.length}</span>
            )}
          </span>
          <span className="text-xs">{binOpen ? '▲ Collapse' : '▼ Expand'}</span>
        </button>
        {binOpen && (
          <div className="mt-3 card p-0 overflow-hidden">
            <div className="px-5 py-3 border-b border-bg bg-gray-50">
              <p className="text-xs text-gray-500">Deleted salary records are stored here. Restore to recover.</p>
            </div>
            <div className="p-4">
              {binLoading ? (
                <div className="py-8 text-center text-gray-400 text-sm">Loading bin…</div>
              ) : !binData || binData.length === 0 ? (
                <div className="py-8 text-center text-gray-400 text-sm">No deleted salary records.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th className="table-th">Month</th>
                        <th className="table-th">Employee</th>
                        <th className="table-th">Net Salary</th>
                        <th className="table-th">Deleted At</th>
                        <th className="table-th">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {binData.map(row => (
                        <tr key={row.id} className="table-tr">
                          <td className="table-td font-medium">{row.month}</td>
                          <td className="table-td">{row.employees?.full_name || <span className="text-gray-400">—</span>}</td>
                          <td className="table-td">{formatRM(row.net_salary)}</td>
                          <td className="table-td text-gray-500">
                            {new Date(row.deleted_at).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </td>
                          <td className="table-td">
                            <button onClick={() => handleRestoreSalary(row.id)} className="btn btn-sm bg-green-500 hover:bg-green-600 text-white">↩ Restore</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
