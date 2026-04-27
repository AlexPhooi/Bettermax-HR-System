'use client';
import { useEffect, useMemo, useState, useCallback } from 'react';
import { formatRM } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────────

interface SavingsSummary {
  employee_id: string;
  full_name: string;
  rank: string | null;
  daily_rate: number;
  months_saving: number;
  total_contributed: number;
  interest_earned: number;
  total_withdrawn: number;
  current_balance: number;
  projected_12mo: number;
  last_activity: string | null;
}

interface SavingsSettings {
  interest_rate: number;
  effective_from: string | null;
  last_interest_date: string | null;
  last_interest_month: string | null;
  total_pool: number;
}

interface TxRow {
  id: string;
  employee_id: string;
  type: 'credit' | 'debit';
  type_detail: string;
  amount: number;
  balance_after: number;
  reason: string | null;
  month: string | null;
  created_at: string;
  running_balance: number;
}

interface Employee {
  id: string;
  full_name: string;
  current_balance: number;
}

type Tab = 'overview' | 'requests' | 'release' | 'log';

interface WithdrawalRequest {
  id: string;
  employee_id: string;
  amount: number;
  reason: string;
  reason_detail: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  reviewed_at: string | null;
  rejection_note: string | null;
  employees: { full_name: string; rank: string | null } | null;
}

const WITHDRAWAL_REASONS = [
  { value: 'emergency_withdrawal', label: 'Emergency' },
  { value: 'medical',              label: 'Medical' },
  { value: 'flight_home',          label: 'Flight Home' },
  { value: 'permit_renewal',       label: 'Permit Renewal' },
  { value: 'other',                label: 'Other' },
];

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-MY', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function fmtMonth(ym: string | null) {
  if (!ym) return '—';
  const [y, m] = ym.split('-');
  return new Date(Number(y), Number(m) - 1).toLocaleDateString('en-MY', { month: 'long', year: 'numeric' });
}

function txDescription(row: TxRow): string {
  if (row.reason) return row.reason;
  const map: Record<string, string> = {
    mission_bonus:        'Site bonus',
    monthly_interest:     `Monthly interest (${fmtMonth(row.month)})`,
    emergency_withdrawal: 'Emergency withdrawal',
    medical:              'Medical withdrawal',
    flight_home:          'Flight Home withdrawal',
    permit_renewal:       'Permit Renewal withdrawal',
    other:                'Withdrawal',
  };
  return map[row.type_detail] ?? row.type_detail ?? '—';
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function SavingPage() {
  const [tab, setTab] = useState<Tab>('overview');

  // Overview data
  const [summary,  setSummary]  = useState<SavingsSummary[]>([]);
  const [settings, setSettings] = useState<SavingsSettings | null>(null);
  const [loading,  setLoading]  = useState(true);

  // Interest apply
  const [applying,    setApplying]    = useState(false);
  const [interestApplied, setInterestApplied] = useState(false);
  const [currentMonth] = useState(() => new Date().toISOString().slice(0, 7));

  // Rate change
  const [showRateModal, setShowRateModal] = useState(false);
  const [newRate,       setNewRate]       = useState('');
  const [rateSaving,    setRateSaving]    = useState(false);

  // Release funds
  const [relEmpId,    setRelEmpId]    = useState('');
  const [relAmount,   setRelAmount]   = useState('');
  const [relReason,   setRelReason]   = useState('emergency_withdrawal');
  const [relNotes,    setRelNotes]    = useState('');
  const [releasing,   setReleasing]   = useState(false);
  const [relConfirm,  setRelConfirm]  = useState(false);

  // Transaction log
  const [txEmpId,   setTxEmpId]   = useState('');
  const [txMonth,   setTxMonth]   = useState('');
  const [txRows,    setTxRows]    = useState<TxRow[]>([]);
  const [txLoading, setTxLoading] = useState(false);

  // Withdrawal requests
  const [requests,    setRequests]    = useState<WithdrawalRequest[]>([]);
  const [reqLoading,  setReqLoading]  = useState(false);
  const [rejectId,    setRejectId]    = useState<string | null>(null);
  const [rejectNote,  setRejectNote]  = useState('');
  const [processing,  setProcessing]  = useState<string | null>(null);

  // Alert
  const [alertMsg,  setAlertMsg]  = useState('');
  const [alertType, setAlertType] = useState<'success' | 'danger'>('success');

  function showAlert(msg: string, type: 'success' | 'danger' = 'success') {
    setAlertMsg(msg); setAlertType(type);
    setTimeout(() => setAlertMsg(''), 5000);
  }

  // Load overview
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [sumRes, setRes, intRes] = await Promise.all([
        fetch('/api/savings').then(r => r.json()),
        fetch('/api/savings/settings').then(r => r.json()),
        fetch('/api/savings/apply-interest').then(r => r.json()),
      ]);
      setSummary(Array.isArray(sumRes) ? sumRes : []);
      setSettings(setRes.interest_rate !== undefined ? setRes : null);
      setInterestApplied(intRes.applied_this_month ?? false);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Load withdrawal requests when requests tab selected
  const loadRequests = useCallback(async () => {
    setReqLoading(true);
    const res = await fetch('/api/savings/request');
    const data = await res.json();
    setRequests(Array.isArray(data) ? data : []);
    setReqLoading(false);
  }, []);

  useEffect(() => { if (tab === 'requests') loadRequests(); }, [tab, loadRequests]);

  const pendingReqCount = requests.filter(r => r.status === 'pending').length;

  async function handleRequest(id: string, action: 'approve' | 'reject') {
    setProcessing(id);
    try {
      const res = await fetch(`/api/savings/request/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, rejection_note: rejectNote }),
      });
      const data = await res.json();
      if (!res.ok) { showAlert(data.error || 'Failed.', 'danger'); return; }
      showAlert(action === 'approve' ? '✅ Request approved and funds released.' : '❌ Request rejected.');
      setRejectId(null); setRejectNote('');
      loadRequests();
      loadData(); // refresh balances
    } finally { setProcessing(null); }
  }

  const REASON_LABEL: Record<string, string> = {
    permit: 'Permit Renewal', flight: 'Flight Home',
    emergency: 'Emergency', others: 'Others',
  };

  // Load transactions when log tab + filter changes
  const loadTx = useCallback(async () => {
    if (!txEmpId) { setTxRows([]); return; }
    setTxLoading(true);
    const res = await fetch(`/api/savings/${txEmpId}/statement`);
    const data = await res.json();
    let rows: TxRow[] = Array.isArray(data) ? data : [];
    if (txMonth) rows = rows.filter(r => r.month === txMonth);
    setTxRows(rows.reverse()); // newest first
    setTxLoading(false);
  }, [txEmpId, txMonth]);

  useEffect(() => { if (tab === 'log') loadTx(); }, [tab, loadTx]);

  // Employees with balance > 0 for release dropdown
  const empList: Employee[] = useMemo(() =>
    summary.filter(s => s.current_balance > 0)
      .map(s => ({ id: s.employee_id, full_name: s.full_name, current_balance: s.current_balance })),
    [summary]);
  const selectedEmp = empList.find(e => e.id === relEmpId);

  // Totals
  const totalPool       = settings?.total_pool ?? 0;
  const totalInterest   = summary.reduce((s, r) => s + r.interest_earned, 0);
  const totalWithdrawn  = summary.reduce((s, r) => s + r.total_withdrawn, 0);

  // Apply monthly interest
  async function applyInterest() {
    if (!confirm(`Credit monthly interest (${((settings?.interest_rate ?? 0.02) * 100).toFixed(1)}%) to all ${summary.filter(s => s.current_balance > 0).length} employees with a balance. Confirm?`))
      return;
    setApplying(true);
    try {
      const res  = await fetch('/api/savings/apply-interest', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { showAlert(data.error || 'Failed.', 'danger'); return; }
      showAlert(`Interest applied! ${data.processed} employees credited — ${formatRM(data.total_interest_credited)} total.`);
      setInterestApplied(true);
      loadData();
    } finally { setApplying(false); }
  }

  // Change rate
  async function changeRate() {
    const r = parseFloat(newRate) / 100;
    if (isNaN(r) || r < 0 || r > 0.5) { showAlert('Enter a valid rate (0–50%).', 'danger'); return; }
    setRateSaving(true);
    try {
      const res = await fetch('/api/savings/settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interest_rate: r }),
      });
      if (!res.ok) { showAlert('Failed to update rate.', 'danger'); return; }
      showAlert(`Rate updated to ${(r * 100).toFixed(1)}% — effective from next month.`);
      setShowRateModal(false);
      setNewRate('');
      loadData();
    } finally { setRateSaving(false); }
  }

  // Release funds
  async function releaseFunds() {
    if (!relEmpId || !relAmount || !relNotes.trim()) {
      showAlert('Fill all fields including notes.', 'danger'); return;
    }
    if (Number(relAmount) <= 0) { showAlert('Amount must be positive.', 'danger'); return; }
    if (selectedEmp && Number(relAmount) > selectedEmp.current_balance) {
      showAlert('Amount exceeds current balance.', 'danger'); return;
    }
    if (!relConfirm) { setRelConfirm(true); return; }
    setReleasing(true);
    try {
      const res = await fetch('/api/savings/withdraw', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: relEmpId, amount: Number(relAmount), type_detail: relReason, notes: relNotes }),
      });
      const data = await res.json();
      if (!res.ok) { showAlert(data.error || 'Failed.', 'danger'); return; }
      showAlert(`Released ${formatRM(Number(relAmount))} from ${selectedEmp?.full_name}'s savings. Remaining: ${formatRM(data.balance_after)}`);
      setRelEmpId(''); setRelAmount(''); setRelNotes(''); setRelConfirm(false);
      loadData();
    } finally { setReleasing(false); }
  }

  const rate = settings ? (settings.interest_rate * 100).toFixed(1) : '2.0';
  // Daily accrual per employee = balance × (monthly_rate / 30)
  const monthlyRate = settings?.interest_rate ?? 0.02;
  const dailyRate   = monthlyRate / 30;

  // ── JSX ───────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-primary">🏦 Savings Account</h1>
        {settings && (
          <div className="text-xs text-gray-500 text-right">
            <div>Rate: <strong className="text-green-700">{rate}%/mo</strong></div>
            {settings.last_interest_month && (
              <div>Last interest: {fmtMonth(settings.last_interest_month)}</div>
            )}
          </div>
        )}
      </div>

      {/* Interest not yet applied banner */}
      {!loading && !interestApplied && (
        <div className="mb-4 p-3 rounded-lg bg-yellow-50 border border-yellow-300 flex items-center justify-between gap-3">
          <span className="text-sm text-yellow-800">
            ⚠️ Monthly interest has <strong>not yet been applied</strong> for <strong>{fmtMonth(currentMonth)}</strong>.
          </span>
          <button
            className="btn btn-sm bg-yellow-500 hover:bg-yellow-600 text-white shrink-0"
            onClick={applyInterest} disabled={applying}>
            {applying ? 'Applying…' : 'Apply Now →'}
          </button>
        </div>
      )}

      {alertMsg && <div className={`alert alert-${alertType} mb-4`}>{alertMsg}</div>}

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        <div className="card p-4 text-center">
          <div className="text-xs text-gray-400 mb-1">Total Savings Pool</div>
          <div className="text-2xl font-bold text-primary">{formatRM(totalPool)}</div>
          <div className="text-xs text-gray-400 mt-1">{summary.filter(s => s.current_balance > 0).length} employees</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-xs text-gray-400 mb-1">Total Interest Earned</div>
          <div className="text-2xl font-bold text-green-700">+{formatRM(totalInterest)}</div>
          <div className="text-xs text-gray-400 mt-1">All time</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-xs text-gray-400 mb-1">Total Released</div>
          <div className="text-2xl font-bold text-danger">{formatRM(totalWithdrawn)}</div>
          <div className="text-xs text-gray-400 mt-1">Emergency releases</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-bg mb-5 overflow-x-auto">
        {([
          ['overview',  '📊 Overview'],
          ['requests',  '📥 Requests'],
          ['release',   '💸 Release Funds'],
          ['log',       '📋 Transaction Log'],
        ] as const).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`relative px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
              tab === t ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {label}
            {t === 'requests' && pendingReqCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold leading-4 text-center text-white bg-yellow-500">
                {pendingReqCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── TAB 1: OVERVIEW ── */}
      {tab === 'overview' && (
        <div>
          {/* Controls */}
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <button
              className="btn btn-success text-sm"
              onClick={applyInterest}
              disabled={applying || interestApplied}>
              {applying ? 'Processing…' : interestApplied ? `✓ Interest Applied (${fmtMonth(currentMonth)})` : `⚡ Apply ${rate}% Monthly Interest`}
            </button>
            <button className="btn btn-secondary text-sm" onClick={() => setShowRateModal(true)}>
              ⚙️ Change Rate
            </button>
          </div>

          {loading ? (
            <div className="card animate-pulse h-40" />
          ) : (
            <div className="card p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: '#1e3a5f' }}>
                      <th className="px-3 py-2.5 text-left text-xs text-white font-semibold">Name</th>
                      <th className="px-3 py-2.5 text-left text-xs text-white font-semibold">Tier</th>
                      <th className="px-3 py-2.5 text-right text-xs text-white font-semibold">Months</th>
                      <th className="px-3 py-2.5 text-right text-xs text-white font-semibold">Contributed</th>
                      <th className="px-3 py-2.5 text-right text-xs text-white font-semibold">Interest</th>
                      <th className="px-3 py-2.5 text-right text-xs text-white font-semibold">Balance</th>
                      <th className="px-3 py-2.5 text-right text-xs text-white font-semibold">Daily Accrual</th>
                      <th className="px-3 py-2.5 text-right text-xs text-white font-semibold">Projected 12mo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.map((row, idx) => (
                      <tr key={row.employee_id}
                        style={{ background: idx % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                        <td className="px-3 py-2.5 font-medium text-gray-800">{row.full_name}</td>
                        <td className="px-3 py-2.5 text-xs">
                          {row.rank
                            ? <span className="badge bg-blue-50 text-blue-700">{row.rank}</span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right text-gray-500">{row.months_saving}</td>
                        <td className="px-3 py-2.5 text-right text-gray-600">{formatRM(row.total_contributed)}</td>
                        <td className="px-3 py-2.5 text-right text-green-600 font-medium">
                          {row.interest_earned > 0 ? `+${formatRM(row.interest_earned)}` : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className={`font-bold ${row.current_balance > 0 ? 'text-primary' : 'text-gray-400'}`}>
                            {formatRM(row.current_balance)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {row.current_balance > 0 ? (
                            <span className="text-xs font-semibold text-emerald-600">
                              +{formatRM(Math.round(row.current_balance * dailyRate * 100) / 100)}/day
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right text-green-700 font-medium">
                          {row.current_balance > 0 ? formatRM(row.projected_12mo) : '—'}
                        </td>
                      </tr>
                    ))}
                    {summary.length === 0 && (
                      <tr><td colSpan={7} className="px-3 py-10 text-center text-gray-400">No savings data yet.</td></tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#f0f4f8', borderTop: '2px solid #cbd5e1', fontWeight: 700 }}>
                      <td className="px-3 py-2.5 text-sm text-primary" colSpan={3}>TOTAL</td>
                      <td className="px-3 py-2.5 text-right text-sm text-primary">
                        {formatRM(summary.reduce((s, r) => s + r.total_contributed, 0))}
                      </td>
                      <td className="px-3 py-2.5 text-right text-sm text-green-700">
                        +{formatRM(totalInterest)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-sm text-primary">
                        {formatRM(totalPool)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-xs text-emerald-600 font-semibold">
                        +{formatRM(Math.round(totalPool * dailyRate * 100) / 100)}/day
                      </td>
                      <td className="px-3 py-2.5 text-right text-sm text-green-700">
                        {formatRM(summary.reduce((s, r) => s + r.projected_12mo, 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Settings panel */}
          {settings && (
            <div className="card p-4 mt-4 flex flex-wrap gap-6 text-sm">
              <div>
                <div className="text-xs text-gray-400 mb-1">Interest Rate</div>
                <div className="font-bold text-green-700 text-lg">{rate}% / month</div>
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-1">Daily Pool Growth</div>
                <div className="font-bold text-emerald-600 text-lg">+{formatRM(Math.round(totalPool * dailyRate * 100) / 100)}/day</div>
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-1">Last Interest Applied</div>
                <div className="font-semibold text-gray-700">
                  {settings.last_interest_month ? fmtMonth(settings.last_interest_month) : 'Not yet applied'}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-1">Total Pool</div>
                <div className="font-bold text-primary text-lg">{formatRM(settings.total_pool)}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 2: WITHDRAWAL REQUESTS ── */}
      {tab === 'requests' && (
        <div>
          {reqLoading ? (
            <div className="card animate-pulse h-40" />
          ) : requests.length === 0 ? (
            <div className="card py-12 text-center text-gray-400">No withdrawal requests yet.</div>
          ) : (
            <div className="space-y-3">
              {requests.map(req => {
                const isPending = req.status === 'pending';
                return (
                  <div key={req.id} className={`card p-4 border-l-4 ${
                    isPending ? 'border-yellow-400' :
                    req.status === 'approved' ? 'border-green-400' : 'border-red-400'
                  }`}>
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <p className="font-bold text-gray-800">
                            {req.employees?.full_name ?? '—'}
                          </p>
                          {req.employees?.rank && (
                            <span className="badge bg-blue-50 text-blue-600 text-xs">{req.employees.rank}</span>
                          )}
                          <span className={`badge text-xs ${
                            isPending ? 'bg-yellow-100 text-yellow-700' :
                            req.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                          }`}>
                            {isPending ? '🟡 Pending' : req.status === 'approved' ? '✅ Approved' : '❌ Rejected'}
                          </span>
                        </div>
                        <p className="text-2xl font-extrabold text-primary">{formatRM(req.amount)}</p>
                        <p className="text-sm text-gray-600 mt-1">
                          {REASON_LABEL[req.reason] || req.reason}
                          {req.reason_detail && <span className="text-gray-400"> — {req.reason_detail}</span>}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          Requested: {new Date(req.created_at).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </p>
                        {!isPending && req.reviewed_at && (
                          <p className="text-xs text-gray-400">
                            Reviewed: {new Date(req.reviewed_at).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </p>
                        )}
                        {req.status === 'rejected' && req.rejection_note && (
                          <p className="text-xs text-red-600 mt-1">Note: {req.rejection_note}</p>
                        )}
                      </div>

                      {/* Action buttons — pending only */}
                      {isPending && rejectId !== req.id && (
                        <div className="flex gap-2 shrink-0">
                          <button
                            className="btn btn-success text-sm px-4"
                            disabled={processing === req.id}
                            onClick={() => handleRequest(req.id, 'approve')}>
                            {processing === req.id ? '…' : '✅ Approve'}
                          </button>
                          <button
                            className="btn btn-danger text-sm px-4"
                            onClick={() => { setRejectId(req.id); setRejectNote(''); }}>
                            ❌ Reject
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Inline reject form */}
                    {isPending && rejectId === req.id && (
                      <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                        <label className="form-label text-xs">Rejection note (optional)</label>
                        <input
                          className="form-control text-sm"
                          placeholder="e.g. Please resubmit with more details…"
                          value={rejectNote}
                          onChange={e => setRejectNote(e.target.value)}
                        />
                        <div className="flex gap-2">
                          <button
                            className="btn btn-danger text-sm"
                            disabled={processing === req.id}
                            onClick={() => handleRequest(req.id, 'reject')}>
                            {processing === req.id ? 'Rejecting…' : 'Confirm Reject'}
                          </button>
                          <button className="btn btn-secondary text-sm" onClick={() => setRejectId(null)}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── TAB 3: RELEASE FUNDS ── */}
      {tab === 'release' && (
        <div className="max-w-lg">
          <div className="card p-6 space-y-4">
            <div className="p-3 rounded-lg bg-yellow-50 border border-yellow-200 text-xs text-yellow-800">
              ⚠️ Emergency release only. Worker cannot request this themselves — admin decides case by case. A reason and notes are required.
            </div>

            <div>
              <label className="form-label">Employee</label>
              <select className="form-control" value={relEmpId} onChange={e => { setRelEmpId(e.target.value); setRelConfirm(false); }}>
                <option value="">— Select employee —</option>
                {empList.map(e => (
                  <option key={e.id} value={e.id}>
                    {e.full_name} — Balance: {formatRM(e.current_balance)}
                  </option>
                ))}
              </select>
              {empList.length === 0 && !loading && (
                <p className="text-xs text-gray-400 mt-1">No employees with savings balance.</p>
              )}
            </div>

            {selectedEmp && (
              <div className="p-3 rounded-lg bg-green-50 border border-green-200">
                <div className="text-xs text-gray-500">Current Balance</div>
                <div className="text-xl font-bold text-green-700">{formatRM(selectedEmp.current_balance)}</div>
              </div>
            )}

            <div>
              <label className="form-label">Amount (RM)</label>
              <input type="number" min="0.01" step="0.01" className="form-control"
                placeholder="0.00" value={relAmount}
                onChange={e => { setRelAmount(e.target.value); setRelConfirm(false); }} />
              {selectedEmp && Number(relAmount) > selectedEmp.current_balance && (
                <p className="text-xs text-danger mt-1">Exceeds balance of {formatRM(selectedEmp.current_balance)}</p>
              )}
            </div>

            <div>
              <label className="form-label">Reason</label>
              <select className="form-control" value={relReason}
                onChange={e => { setRelReason(e.target.value); setRelConfirm(false); }}>
                {WITHDRAWAL_REASONS.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="form-label">Notes <span className="text-danger">*</span></label>
              <textarea className="form-control" rows={3}
                placeholder="Describe the situation requiring this release…"
                value={relNotes}
                onChange={e => { setRelNotes(e.target.value); setRelConfirm(false); }} />
            </div>

            {relConfirm && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-300 text-sm text-red-800 font-medium">
                ⚠️ Confirm releasing <strong>{formatRM(Number(relAmount))}</strong> from <strong>{selectedEmp?.full_name}</strong>?
                Remaining balance will be <strong>{formatRM((selectedEmp?.current_balance ?? 0) - Number(relAmount))}</strong>.
                <br />Click again to confirm.
              </div>
            )}

            <button
              className={`btn w-full ${relConfirm ? 'btn-danger' : 'btn-primary'}`}
              onClick={releaseFunds}
              disabled={releasing || !relEmpId || !relAmount || !relNotes.trim()}>
              {releasing ? 'Processing…' : relConfirm ? '⚠️ Confirm Release' : '💸 Release Funds'}
            </button>
          </div>
        </div>
      )}

      {/* ── TAB 3: TRANSACTION LOG ── */}
      {tab === 'log' && (
        <div>
          {/* Filters */}
          <div className="card p-4 mb-4">
            <div className="flex items-end gap-3 flex-wrap">
              <div>
                <label className="form-label">Employee</label>
                <select className="form-control" value={txEmpId} onChange={e => setTxEmpId(e.target.value)}>
                  <option value="">— Select employee —</option>
                  {summary.map(s => (
                    <option key={s.employee_id} value={s.employee_id}>{s.full_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">Month</label>
                <input type="month" className="form-control" value={txMonth}
                  onChange={e => setTxMonth(e.target.value)} />
              </div>
              {txMonth && (
                <button className="btn btn-secondary text-sm" onClick={() => setTxMonth('')}>Clear</button>
              )}
            </div>
          </div>

          {!txEmpId ? (
            <div className="card py-12 text-center text-gray-400">Select an employee to view their statement.</div>
          ) : txLoading ? (
            <div className="card animate-pulse h-40" />
          ) : txRows.length === 0 ? (
            <div className="card py-12 text-center text-gray-400">No transactions found.</div>
          ) : (
            <div className="card p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: '#1e3a5f' }}>
                      <th className="px-3 py-2.5 text-left text-xs text-white font-semibold">Date</th>
                      <th className="px-3 py-2.5 text-left text-xs text-white font-semibold">Description</th>
                      <th className="px-3 py-2.5 text-right text-xs text-white font-semibold">Credit</th>
                      <th className="px-3 py-2.5 text-right text-xs text-white font-semibold">Debit</th>
                      <th className="px-3 py-2.5 text-right text-xs text-white font-semibold">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {txRows.map((row, idx) => (
                      <tr key={row.id} style={{ background: idx % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                        <td className="px-3 py-2.5 text-xs text-gray-500 font-mono whitespace-nowrap">
                          {fmtDate(row.created_at)}
                        </td>
                        <td className="px-3 py-2.5 text-gray-700">{txDescription(row)}</td>
                        <td className="px-3 py-2.5 text-right text-green-600 font-medium">
                          {row.type === 'credit' ? `+${formatRM(row.amount)}` : ''}
                        </td>
                        <td className="px-3 py-2.5 text-right text-danger font-medium">
                          {row.type === 'debit' ? `-${formatRM(row.amount)}` : ''}
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold text-primary">
                          {formatRM(row.running_balance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Rate Change Modal ── */}
      {showRateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-primary">⚙️ Change Interest Rate</h3>
              <button onClick={() => setShowRateModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="p-5 space-y-4">
              <div className="text-sm text-gray-600 bg-blue-50 border border-blue-200 rounded-lg p-3">
                Current rate: <strong>{rate}%/month</strong><br />
                New rate takes effect from <strong>next month's 1st</strong>.
              </div>
              <div>
                <label className="form-label">New Rate (%)</label>
                <input type="number" step="0.1" min="0" max="50" className="form-control"
                  placeholder="e.g. 2.5" value={newRate}
                  onChange={e => setNewRate(e.target.value)} />
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-2 justify-end">
              <button className="btn btn-secondary" onClick={() => setShowRateModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={changeRate} disabled={rateSaving}>
                {rateSaving ? 'Saving…' : 'Update Rate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
