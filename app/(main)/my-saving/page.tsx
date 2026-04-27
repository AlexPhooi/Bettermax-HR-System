'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRole } from '@/lib/role-context';
import { formatRM } from '@/lib/utils';

/* ── Types ───────────────────────────────────────────────────────── */
interface SavingSummary {
  employee_id: string;
  current_balance: number;
  total_contributed: number;
  interest_earned: number;
  total_withdrawn: number;
  months_saving: number;
}
interface TxRow {
  id: string;
  type: 'credit' | 'debit';
  type_detail: string;
  amount: number;
  balance_after: number;
  reason: string | null;
  month: string | null;
  created_at: string;
  running_balance: number;
}
interface SavingsRequest {
  id: string;
  amount: number;
  reason: string;
  reason_detail: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  reviewed_at: string | null;
  rejection_note: string | null;
}

/* ── Constants ───────────────────────────────────────────────────── */
const REASON_OPTIONS = [
  { value: 'permit',    label: '📋 Permit Renewal' },
  { value: 'flight',    label: '✈️ Flight Home' },
  { value: 'emergency', label: '🚨 Emergency' },
  { value: 'others',    label: '📝 Others (describe below)' },
];

const REASON_LABEL: Record<string, string> = {
  permit: 'Permit Renewal', flight: 'Flight Home',
  emergency: 'Emergency', others: 'Others',
};

const STATUS_CFG = {
  pending:  { cls: 'bg-yellow-100 text-yellow-700', icon: '🟡', label: 'Pending' },
  approved: { cls: 'bg-green-100 text-green-700',  icon: '✅', label: 'Approved' },
  rejected: { cls: 'bg-red-100 text-red-600',      icon: '❌', label: 'Rejected' },
};

/* ── Helpers ─────────────────────────────────────────────────────── */
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtMonth(ym: string | null) {
  if (!ym) return '—';
  const [y, m] = ym.split('-');
  return new Date(Number(y), Number(m) - 1).toLocaleString('en-MY', { month: 'long', year: 'numeric' });
}
function txDescription(row: TxRow): string {
  if (row.reason) return row.reason;
  const map: Record<string, string> = {
    mission_bonus:    'Site Bonus',
    monthly_interest: `Monthly Interest (${fmtMonth(row.month)})`,
    permit:           'Permit Renewal Withdrawal',
    flight:           'Flight Home Withdrawal',
    emergency:        'Emergency Withdrawal',
    others:           'Withdrawal',
  };
  return map[row.type_detail] ?? row.type_detail ?? '—';
}

/* ── Page ────────────────────────────────────────────────────────── */
export default function MySavingPage() {
  const { employee_id } = useRole();

  const [summary,   setSummary]   = useState<SavingSummary | null>(null);
  const [txRows,    setTxRows]    = useState<TxRow[]>([]);
  const [requests,  setRequests]  = useState<SavingsRequest[]>([]);
  const [rate,      setRate]      = useState(0.02);
  const [loading,   setLoading]   = useState(true);

  // Form state
  const [amount,       setAmount]       = useState('');
  const [reason,       setReason]       = useState('permit');
  const [reasonDetail, setReasonDetail] = useState('');
  const [submitting,   setSubmitting]   = useState(false);
  const [msg,          setMsg]          = useState('');
  const [msgType,      setMsgType]      = useState<'success' | 'error'>('success');

  const loadAll = useCallback(async () => {
    if (!employee_id) return;
    setLoading(true);
    try {
      const [savRes, txRes, reqRes, setRes] = await Promise.all([
        fetch('/api/savings').then(r => r.json()),
        fetch(`/api/savings/${employee_id}/statement`).then(r => r.json()),
        fetch('/api/savings/request').then(r => r.json()),
        fetch('/api/savings/settings').then(r => r.json()),
      ]);
      if (Array.isArray(savRes) && savRes.length > 0) setSummary(savRes[0]);
      if (Array.isArray(txRes)) setTxRows([...txRes].reverse()); // newest first
      if (Array.isArray(reqRes)) setRequests(reqRes);
      if (setRes?.interest_rate) setRate(setRes.interest_rate);
    } finally {
      setLoading(false);
    }
  }, [employee_id]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const balance      = summary?.current_balance ?? 0;
  const dailyAccrual = balance * (rate / 30);
  const hasPending   = requests.some(r => r.status === 'pending');

  function showMsg(text: string, type: 'success' | 'error' = 'success') {
    setMsg(text); setMsgType(type);
    setTimeout(() => setMsg(''), 6000);
  }

  async function submitRequest() {
    if (!amount || Number(amount) <= 0) { showMsg('Enter a valid amount.', 'error'); return; }
    if (Number(amount) > balance) { showMsg(`Amount cannot exceed your balance of ${formatRM(balance)}.`, 'error'); return; }
    if (reason === 'others' && !reasonDetail.trim()) { showMsg('Please describe your reason.', 'error'); return; }

    setSubmitting(true);
    try {
      const res = await fetch('/api/savings/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: Number(amount), reason, reason_detail: reasonDetail }),
      });
      const data = await res.json();
      if (!res.ok) { showMsg(data.error || 'Failed to submit.', 'error'); return; }
      showMsg('Request submitted! Your manager will review it shortly.', 'success');
      setAmount(''); setReasonDetail(''); setReason('permit');
      loadAll();
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return (
    <div className="p-4 max-w-lg mx-auto space-y-4 animate-pulse">
      <div className="card h-32" />
      <div className="card h-48" />
      <div className="card h-64" />
    </div>
  );

  return (
    <div className="p-4 md:p-6 max-w-lg mx-auto space-y-4">
      <h1 className="text-2xl font-bold text-primary">🏦 My Saving Account</h1>

      {/* ── Balance Overview ──────────────────────────────────── */}
      <div className="card p-5">
        <div className="flex items-end justify-between mb-4">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Current Balance</p>
            <p className="text-4xl font-extrabold text-primary leading-none">{formatRM(balance)}</p>
            {balance > 0 && (
              <p className="text-xs text-emerald-600 font-semibold mt-1">
                +{formatRM(Math.round(dailyAccrual * 100) / 100)}/day ({(rate * 100).toFixed(1)}%/mo interest)
              </p>
            )}
          </div>
          <div className="text-right text-xs text-gray-400 space-y-0.5">
            <p>Months saving: <strong className="text-gray-600">{summary?.months_saving ?? 0}</strong></p>
            <p>Total interest: <strong className="text-green-600">+{formatRM(summary?.interest_earned ?? 0)}</strong></p>
            <p>Total withdrawn: <strong className="text-red-500">{formatRM(summary?.total_withdrawn ?? 0)}</strong></p>
          </div>
        </div>

        {/* Mini breakdown */}
        <div className="grid grid-cols-2 gap-2 pt-3 border-t border-gray-100">
          <div className="bg-green-50 rounded-lg px-3 py-2">
            <p className="text-xs text-gray-400 mb-0.5">Site Bonuses Earned</p>
            <p className="font-bold text-green-700">{formatRM(summary?.total_contributed ?? 0)}</p>
          </div>
          <div className="bg-blue-50 rounded-lg px-3 py-2">
            <p className="text-xs text-gray-400 mb-0.5">Interest Earned</p>
            <p className="font-bold text-blue-700">+{formatRM(summary?.interest_earned ?? 0)}</p>
          </div>
        </div>
      </div>

      {/* ── Message ───────────────────────────────────────────── */}
      {msg && (
        <div className={`px-4 py-3 rounded-lg text-sm font-medium border ${
          msgType === 'success'
            ? 'bg-green-50 border-green-300 text-green-800'
            : 'bg-red-50 border-red-300 text-red-700'
        }`}>
          {msg}
        </div>
      )}

      {/* ── Pending Request Banner ────────────────────────────── */}
      {hasPending && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3">
          <p className="text-sm font-semibold text-yellow-800">🟡 Withdrawal Request Pending</p>
          <p className="text-xs text-yellow-600 mt-0.5">Your request is under review. You cannot submit another until this is resolved.</p>
        </div>
      )}

      {/* ── Submit Withdrawal Request ─────────────────────────── */}
      {!hasPending && (
        <div className="card p-4">
          <p className="text-sm font-bold text-gray-700 mb-3">💸 Request Withdrawal</p>

          <div className="space-y-3">
            <div>
              <label className="form-label">Amount (RM)</label>
              <input
                type="number" min="1" step="0.01"
                className="form-control"
                placeholder={`Max: ${formatRM(balance)}`}
                value={amount}
                onChange={e => setAmount(e.target.value)}
              />
              {balance > 0 && (
                <p className="text-xs text-gray-400 mt-1">
                  Available: <strong className="text-primary">{formatRM(balance)}</strong>
                  <button
                    type="button"
                    className="ml-2 text-xs text-blue-500 underline"
                    onClick={() => setAmount(balance.toFixed(2))}>
                    Use max
                  </button>
                </p>
              )}
            </div>

            <div>
              <label className="form-label">Reason</label>
              <select className="form-control" value={reason} onChange={e => setReason(e.target.value)}>
                {REASON_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {reason === 'others' && (
              <div>
                <label className="form-label">Details <span className="text-red-500">*</span></label>
                <textarea
                  className="form-control" rows={2}
                  placeholder="Describe your reason…"
                  value={reasonDetail}
                  onChange={e => setReasonDetail(e.target.value)}
                />
              </div>
            )}

            <button
              className="btn btn-primary w-full"
              onClick={submitRequest}
              disabled={submitting || balance <= 0}>
              {submitting ? 'Submitting…' : balance <= 0 ? 'No balance available' : '📤 Submit Request'}
            </button>
          </div>

          {balance <= 0 && (
            <p className="text-xs text-gray-400 text-center mt-2">
              You have no saving balance yet. Site bonuses are saved automatically when attendance is approved.
            </p>
          )}
        </div>
      )}

      {/* ── Request History ───────────────────────────────────── */}
      {requests.length > 0 && (
        <div className="card p-4">
          <p className="text-sm font-bold text-gray-700 mb-3">📋 My Requests</p>
          <div className="space-y-2">
            {requests.map(req => {
              const s = STATUS_CFG[req.status];
              return (
                <div key={req.id} className={`rounded-xl border px-4 py-3 ${
                  req.status === 'pending'  ? 'border-yellow-200 bg-yellow-50' :
                  req.status === 'approved' ? 'border-green-200 bg-green-50'  :
                  'border-red-200 bg-red-50'
                }`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-800">{formatRM(req.amount)}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {REASON_LABEL[req.reason] || req.reason}
                        {req.reason_detail && <span> — {req.reason_detail}</span>}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">{fmtDate(req.created_at)}</p>
                      {req.status === 'rejected' && req.rejection_note && (
                        <p className="text-xs text-red-600 mt-1">
                          Reason: {req.rejection_note}
                        </p>
                      )}
                      {req.status !== 'pending' && req.reviewed_at && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          Reviewed: {fmtDate(req.reviewed_at)}
                        </p>
                      )}
                    </div>
                    <span className={`badge text-xs shrink-0 ${s.cls}`}>
                      {s.icon} {s.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Transaction History ───────────────────────────────── */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <p className="text-sm font-bold text-gray-700">📊 Transaction History</p>
        </div>
        {txRows.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-400 text-sm">
            No transactions yet. Site bonuses will appear here once attendance is approved.
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {txRows.map(row => (
              <div key={row.id} className="px-4 py-3 flex items-start gap-3">
                <span className="text-lg mt-0.5 shrink-0">
                  {row.type_detail === 'mission_bonus'    ? '🧹' :
                   row.type_detail === 'monthly_interest' ? '📈' :
                   row.type === 'debit'                   ? '💸' : '💰'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 leading-snug">{txDescription(row)}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{fmtDate(row.created_at)}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm font-bold ${row.type === 'credit' ? 'text-green-600' : 'text-red-500'}`}>
                    {row.type === 'credit' ? '+' : '-'}{formatRM(row.amount)}
                  </p>
                  <p className="text-xs text-gray-400">Bal: {formatRM(row.running_balance)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400 text-center pb-2">
        Site bonuses are automatically saved when attendance is approved. Interest is applied on the 1st of each month.
      </p>
    </div>
  );
}
