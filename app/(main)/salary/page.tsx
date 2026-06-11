'use client';
import { useEffect, useRef, useState, useMemo } from 'react';
import { formatRM, formatDate, getCurrentMonth, RANK_COLORS } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface HistoryRecord {
  id: string;
  employee_id: string;
  month: string;
  status: string;
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
  rank: string | null;
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
  const [view,        setView]        = useState<'overview' | 'detail'>('overview');
  const [section,     setSection]     = useState<Section>('history');
  const [overviewTab, setOverviewTab] = useState<'cards' | 'staff'>('cards');

  // Filter
  const [filterMonth, setFilterMonth] = useState('all');
  const [sortBy,      setSortBy]      = useState<SortBy>('none');
  const [applied,     setApplied]     = useState(false);

  // Slip upload
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Inline edit
  const [editingId,  setEditingId]  = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ total_days: string; total_advances: string }>({ total_days: '', total_advances: '' });
  const [saving,     setSaving]     = useState<string | null>(null);

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

  // ── Inline edit save ────────────────────────────────────────────────────────
  async function handleSaveEdit(row: HistoryRecord) {
    setSaving(row.id);
    const days     = parseFloat(editValues.total_days)     || 0;
    const advances = parseFloat(editValues.total_advances) || 0;
    const rate     = Number(row.daily_rate);
    const gross    = Math.round(rate * days * 100) / 100;
    const net      = Math.round((gross - advances) * 100) / 100;
    const res = await fetch(`/api/salary/records/${row.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ total_days: days, total_advances: advances, gross_salary: gross, net_salary: net }),
    });
    if (res.ok) {
      setHistory(h => h.map(r => r.id === row.id
        ? { ...r, total_days: days, total_advances: advances, gross_salary: gross, net_salary: net }
        : r));
      setEditingId(null);
      showAlert('Record saved!');
    } else { showAlert('Save failed.', 'danger'); }
    setSaving(null);
  }

  // ── Mark as Done ─────────────────────────────────────────────────────────────
  async function handleMarkDone(id: string) {
    setSaving(id);
    const res = await fetch(`/api/salary/records/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'paid' }),
    });
    if (res.ok) {
      setHistory(h => h.map(r => r.id === id ? { ...r, status: 'paid' } : r));
      showAlert('Marked as Done ✓');
    } else { showAlert('Failed.', 'danger'); }
    setSaving(null);
  }

  // ── Derived: history totals ──────────────────────────────────────────────────
  // Exclude current month from history cards
  const pastHistory = useMemo(() => history.filter(r => r.month !== curMonth), [history, curMonth]);
  const totalPaid   = useMemo(() =>
    pastHistory.filter(r => r.status === 'paid').reduce((s, r) => s + Number(r.net_salary), 0),
    [pastHistory]);
  const totalUnpaid = useMemo(() =>
    pastHistory.filter(r => r.status !== 'paid').reduce((s, r) => s + Number(r.net_salary), 0),
    [pastHistory]);

  // ── Derived: current month totals ───────────────────────────────────────────
  const curActiveData = useMemo(() => (current?.data ?? []).filter(r => r.total_days > 0 || r.total_advances > 0), [current]);
  const curGross   = useMemo(() => curActiveData.reduce((s, r) => s + r.gross_salary,   0), [curActiveData]);
  const curAdvance = useMemo(() => curActiveData.reduce((s, r) => s + r.total_advances, 0), [curActiveData]);
  // Net = sum of positive net_salary only (over-advance staff pay RM 0, not negative)
  const curNet     = useMemo(() => curActiveData.reduce((s, r) => s + Math.max(0, r.net_salary), 0), [curActiveData]);

  // ── Distinct past months for filter dropdown ─────────────────────────────────
  const pastMonths = useMemo(() =>
    Array.from(new Set(pastHistory.map(r => r.month))).sort((a, b) => b.localeCompare(a)),
    [pastHistory]);

  // ── Last month data (for Staff Overview tab) ─────────────────────────────────
  const lastMonth = useMemo(() => {
    const [y, m] = curMonth.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, [curMonth]);

  const lastMonthMap = useMemo(() => {
    const map: Record<string, HistoryRecord> = {};
    history.filter(r => r.month === lastMonth).forEach(r => { map[r.employee_id] = r; });
    return map;
  }, [history, lastMonth]);

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
      // Current month — exclude staff with no attendance, then sort
      let rows = (current?.data ?? []).filter(r => r.total_days > 0 || r.total_advances > 0);
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
            {!isHistory && (
              <button className={`btn text-sm ${curFinalized ? 'btn-secondary' : 'btn-success'}`} onClick={finalize} disabled={finalizing}>
                {finalizing ? 'Updating…' : curFinalized ? '🔄 Update (add missing)' : '✓ Finalize'}
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
                    <th className="px-3 py-2.5 text-center text-xs text-white font-semibold no-print">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isHistory ? histRows.map((row, idx) => {
                    const key      = row.id;
                    const isUp     = uploading[key];
                    const isEditing = editingId === key;
                    const isSaving  = saving === key;
                    const isDone    = row.status === 'paid';

                    const editDays  = isEditing ? parseFloat(editValues.total_days)     || 0 : Number(row.total_days);
                    const editAdv   = isEditing ? parseFloat(editValues.total_advances) || 0 : Number(row.total_advances);
                    const editGross = isEditing ? Math.round(Number(row.daily_rate) * editDays * 100) / 100 : Number(row.gross_salary);
                    const editNet   = isEditing ? Math.round((editGross - editAdv) * 100) / 100 : Number(row.net_salary);

                    return (
                      <tr key={key} style={{ background: isDone ? '#f0fdf4' : idx % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                        <td className="px-3 py-2.5 text-xs text-gray-500 font-mono">{row.month}</td>
                        <td className="px-3 py-2.5 font-medium text-gray-800">{row.employees?.full_name ?? '-'}</td>
                        <td className="px-3 py-2.5 text-right text-gray-600">{formatRM(Number(row.daily_rate))}</td>
                        <td className="px-3 py-2.5 text-right font-semibold text-primary">
                          {isEditing
                            ? <input type="number" step="0.25" min="0" className="w-16 text-right border border-gray-300 rounded px-1 py-0.5 text-xs"
                                value={editValues.total_days}
                                onChange={e => setEditValues(v => ({ ...v, total_days: e.target.value }))} />
                            : editDays.toFixed(2)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-gray-400">-</td>
                        <td className="px-3 py-2.5 text-right text-accent font-semibold">{formatRM(editGross)}</td>
                        <td className="px-3 py-2.5 text-right">
                          {isEditing
                            ? <input type="number" step="0.01" min="0" className="w-20 text-right border border-gray-300 rounded px-1 py-0.5 text-xs"
                                value={editValues.total_advances}
                                onChange={e => setEditValues(v => ({ ...v, total_advances: e.target.value }))} />
                            : editAdv > 0
                              ? <span className="text-danger">({formatRM(editAdv)})</span>
                              : <span className="text-gray-300">-</span>}
                        </td>
                        <td className={`px-3 py-2.5 text-right font-bold ${editNet < 0 ? 'text-danger' : 'text-accent'}`}>
                          {formatRM(editNet)}
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
                        {/* Actions */}
                        <td className="px-3 py-2.5 text-center no-print">
                          {isEditing ? (
                            <div className="flex items-center justify-center gap-1">
                              <button
                                className="text-xs bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded"
                                onClick={() => handleSaveEdit(row)} disabled={isSaving}>
                                {isSaving ? '…' : '💾 Save'}
                              </button>
                              <button className="text-xs text-gray-400 hover:text-gray-600 px-1" onClick={() => setEditingId(null)}>✕</button>
                            </div>
                          ) : isDone ? (
                            <span className="text-xs font-bold text-green-700 bg-green-100 px-2 py-1 rounded-full">✅ Done</span>
                          ) : (
                            <div className="flex items-center justify-center gap-1">
                              <button
                                className="text-xs text-gray-400 hover:text-primary px-1"
                                title="Edit"
                                onClick={() => { setEditingId(key); setEditValues({ total_days: String(row.total_days), total_advances: String(row.total_advances) }); }}>
                                ✏️
                              </button>
                              <button
                                className="text-xs bg-green-500 hover:bg-green-600 text-white px-2 py-1 rounded"
                                onClick={() => handleMarkDone(key)} disabled={isSaving}>
                                {isSaving ? '…' : '✓ Done'}
                              </button>
                            </div>
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
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <style>{printStyles}</style>
      <h1 className="text-2xl font-bold text-primary mb-5">Salary</h1>

      {alertMsg && <div className={`alert alert-${alertType} mb-4`}>{alertMsg}</div>}

      {/* ── Tab bar ── */}
      <div className="flex gap-1 mb-5 border-b border-gray-200">
        {([
          ['cards', '📊 Overview'],
          ['staff', '👥 Staff Overview'],
        ] as const).map(([tab, label]) => (
          <button key={tab} type="button"
            className={`px-4 py-2.5 text-sm font-semibold rounded-t-lg border-b-2 transition-colors ${
              overviewTab === tab
                ? 'border-primary text-primary bg-primary/5'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
            onClick={() => setOverviewTab(tab)}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Cards tab ── */}
      {overviewTab === 'cards' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

          {/* History Card */}
          <div className="card p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="font-bold text-primary text-base">📜 History</div>
              <span className="text-xs text-gray-400">{pastMonths.length} month{pastMonths.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 rounded-lg" style={{ background: 'rgba(22,163,74,0.07)', border: '1px solid rgba(22,163,74,0.15)' }}>
                <div>
                  <div className="text-xs text-gray-400 mb-0.5">Total Paid</div>
                  <div className="text-xs text-green-600">Marked as paid</div>
                </div>
                <div className="font-bold text-green-700 text-lg">{formatRM(totalPaid)}</div>
              </div>
              <div className="flex justify-between items-center p-3 rounded-lg" style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)' }}>
                <div>
                  <div className="text-xs text-gray-400 mb-0.5">Total Unpaid</div>
                  <div className="text-xs text-red-400">Not yet paid</div>
                </div>
                <div className="font-bold text-danger text-lg">{formatRM(totalUnpaid)}</div>
              </div>
            </div>
            <button className="btn btn-primary w-full mt-auto" onClick={() => openDetail('history')}>
              Details →
            </button>
          </div>

          {/* Current Month Card */}
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
      )}

      {/* ── Staff Overview tab ── */}
      {overviewTab === 'staff' && (() => {
        const allStaff = current?.data ?? [];
        const totalThisNet    = allStaff.filter(r => r.total_days > 0).reduce((s, r) => s + r.net_salary, 0);
        const totalLastNet    = Object.values(lastMonthMap).reduce((s, r) => s + Number(r.net_salary), 0);
        const totalSiteBonus  = allStaff.reduce((s, r) => s + r.total_site_bonus, 0);

        return (
          <div className="card p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ minWidth: 820 }}>
                <thead>
                  <tr style={{ background: '#1e3a5f' }}>
                    <th className="px-4 py-3 text-left text-xs text-white font-semibold">Name</th>
                    <th className="px-3 py-3 text-left text-xs text-white font-semibold">Rank</th>
                    <th className="px-3 py-3 text-right text-xs text-white font-semibold">Rate</th>
                    <th className="px-3 py-3 text-left text-xs text-white font-semibold" style={{ minWidth: 190 }}>
                      This Month <span className="opacity-60 font-normal">({curMonth})</span>
                    </th>
                    <th className="px-3 py-3 text-left text-xs text-white font-semibold" style={{ minWidth: 160 }}>
                      Last Month <span className="opacity-60 font-normal">({lastMonth})</span>
                    </th>
                    <th className="px-3 py-3 text-right text-xs text-white font-semibold">Site Bonus</th>
                  </tr>
                </thead>
                <tbody>
                  {allStaff
                    .sort((a, b) => a.full_name.localeCompare(b.full_name))
                    .map((row, idx) => {
                    const lastRec = lastMonthMap[row.employee_id];
                    const hasThisMonth = row.total_days > 0 || row.total_advances > 0;

                    // This month status
                    let thisStatus: React.ReactNode;
                    if (curFinalized) {
                      const rec = curRecordMap[row.employee_id];
                      if (rec) {
                        thisStatus = rec.payment_slip_url
                          ? <span className="badge bg-green-100 text-green-700 text-xs">💰 Paid</span>
                          : <span className="badge bg-blue-100 text-blue-700 text-xs">✅ Finalized</span>;
                      } else if (hasThisMonth) {
                        // Has attendance but wasn't included in finalization (added after)
                        thisStatus = <span className="badge bg-orange-100 text-orange-600 text-xs">⚠️ Not included</span>;
                      } else {
                        thisStatus = <span className="badge bg-red-50 text-red-400 text-xs">🔴 No attendance</span>;
                      }
                    } else if (hasThisMonth) {
                      thisStatus = <span className="badge bg-yellow-100 text-yellow-700 text-xs">🟡 Not finalized</span>;
                    } else {
                      thisStatus = <span className="badge bg-red-50 text-red-400 text-xs">🔴 No attendance</span>;
                    }

                    // Last month status
                    let lastContent: React.ReactNode;
                    if (lastRec) {
                      lastContent = (
                        <div>
                          <div className="font-semibold text-gray-800">{formatRM(Number(lastRec.net_salary))}</div>
                          <div className="mt-0.5">
                            {lastRec.payment_slip_url
                              ? <span className="badge bg-green-100 text-green-700 text-xs">💰 Paid</span>
                              : <span className="badge bg-blue-100 text-blue-700 text-xs">✅ Finalized</span>}
                          </div>
                        </div>
                      );
                    } else {
                      lastContent = <span className="text-gray-300 text-xs">—</span>;
                    }

                    return (
                      <tr key={row.employee_id} style={{ background: idx % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                        <td className="px-4 py-3 font-medium text-gray-800">{row.full_name}</td>
                        <td className="px-3 py-3">
                          {row.rank
                            ? <span className={`badge text-xs ${RANK_COLORS[row.rank] || 'bg-gray-100 text-gray-600'}`}>{row.rank}</span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-3 text-right text-gray-600 font-mono text-xs">{formatRM(row.daily_rate)}</td>
                        <td className="px-3 py-3">
                          {hasThisMonth ? (
                            <div>
                              <div className="font-semibold text-gray-800">
                                {row.total_days.toFixed(2)}d · {formatRM(row.net_salary)}
                              </div>
                              <div className="mt-0.5">{thisStatus}</div>
                            </div>
                          ) : (
                            <div>{thisStatus}</div>
                          )}
                        </td>
                        <td className="px-3 py-3">{lastContent}</td>
                        <td className="px-3 py-3 text-right">
                          {row.total_site_bonus > 0
                            ? <span className="font-semibold text-green-700">{formatRM(row.total_site_bonus)}</span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#f0f4f8', borderTop: '2px solid #cbd5e1', fontWeight: 700 }}>
                    <td className="px-4 py-3 text-sm text-primary" colSpan={3}>TOTAL ({allStaff.filter(r => r.total_days > 0).length} active)</td>
                    <td className="px-3 py-3 text-sm text-accent">{formatRM(totalThisNet)}</td>
                    <td className="px-3 py-3 text-sm text-accent">{formatRM(totalLastNet)}</td>
                    <td className="px-3 py-3 text-right text-sm text-green-700">
                      {totalSiteBonus > 0 ? formatRM(totalSiteBonus) : '—'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        );
      })()}

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
