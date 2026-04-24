'use client';
import { useEffect, useMemo, useState } from 'react';
import { formatRM } from '@/lib/utils';

interface Employee {
  id: string;
  full_name: string;
  daily_rate: number;
  status: string;
  site_bonus_balance: number;
}

interface SalaryRecord {
  employee_id: string;
  month: string;
  total_site_bonus: number;
}

interface Withdrawal {
  id: string;
  employee_id: string;
  month: string;
  amount: number;
  notes: string | null;
}

export default function SavingPage() {
  const [employees,  setEmployees]  = useState<Employee[]>([]);
  const [records,    setRecords]    = useState<SalaryRecord[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [expanded,   setExpanded]   = useState<string | null>(null);

  // Withdrawal modal
  const [showModal,  setShowModal]  = useState(false);
  const [wdEmpId,    setWdEmpId]    = useState('');
  const [wdAmount,   setWdAmount]   = useState('');
  const [wdNotes,    setWdNotes]    = useState('');
  const [wdMonth,    setWdMonth]    = useState('');
  const [saving,     setSaving]     = useState(false);
  const [alertMsg,   setAlertMsg]   = useState('');
  const [alertType,  setAlertType]  = useState<'success'|'danger'>('success');

  function showAlert(msg: string, type: 'success'|'danger' = 'success') {
    setAlertMsg(msg); setAlertType(type);
    setTimeout(() => setAlertMsg(''), 4000);
  }

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [empRes, recRes] = await Promise.all([
          fetch('/api/employees').then(r => r.json()),
          fetch('/api/salary/records').then(r => r.json()),
        ]);
        setEmployees(Array.isArray(empRes) ? empRes.filter((e: Employee) => e.status === 'active') : []);
        setRecords(Array.isArray(recRes) ? recRes : []);
        // TODO: fetch withdrawals from /api/saving/withdrawals when available
      } finally { setLoading(false); }
    }
    load();
  }, []);

  // Per-employee bonus history: month → total_site_bonus
  const bonusHistory = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    for (const r of records) {
      if (!map[r.employee_id]) map[r.employee_id] = {};
      map[r.employee_id][r.month] = Number(r.total_site_bonus || 0);
    }
    return map;
  }, [records]);

  // All distinct months with any site bonus activity (sorted desc)
  const allMonths = useMemo(() => {
    const months = new Set<string>();
    for (const r of records) { if (Number(r.total_site_bonus) > 0) months.add(r.month); }
    return [...months].sort((a, b) => b.localeCompare(a));
  }, [records]);

  // Grand total
  const grandTotal = useMemo(() =>
    employees.reduce((s, e) => s + Number(e.site_bonus_balance || 0), 0), [employees]);

  // Total ever earned (from all salary records)
  const totalEarned = useMemo(() =>
    records.reduce((s, r) => s + Number(r.total_site_bonus || 0), 0), [records]);

  function openWithdrawal(empId: string) {
    setWdEmpId(empId);
    setWdAmount('');
    setWdNotes('');
    setWdMonth('');
    setShowModal(true);
  }

  async function submitWithdrawal() {
    if (!wdAmount || Number(wdAmount) <= 0) { showAlert('Enter a valid amount.', 'danger'); return; }
    const emp = employees.find(e => e.id === wdEmpId);
    if (!emp) return;
    if (Number(wdAmount) > Number(emp.site_bonus_balance)) {
      showAlert('Amount exceeds current balance.', 'danger'); return;
    }
    setSaving(true);
    try {
      // Update employee site_bonus_balance directly via employees PATCH
      const newBal = Math.round((Number(emp.site_bonus_balance) - Number(wdAmount)) * 100) / 100;
      const res = await fetch(`/api/employees/${wdEmpId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ site_bonus_balance: newBal }),
      });
      if (!res.ok) { showAlert('Failed to update balance.', 'danger'); return; }
      // Update local state
      setEmployees(es => es.map(e => e.id === wdEmpId ? { ...e, site_bonus_balance: newBal } : e));
      showAlert(`Withdrew ${formatRM(Number(wdAmount))} from ${emp.full_name}'s saving.`);
      setShowModal(false);
    } finally { setSaving(false); }
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-primary mb-6">🧹 Saving Account</h1>

      {alertMsg && <div className={`alert alert-${alertType} mb-4`}>{alertMsg}</div>}

      {loading ? (
        <div className="card animate-pulse h-40" />
      ) : (
        <>
          {/* ── Summary cards ── */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="card p-4 text-center">
              <div className="text-xs text-gray-400 mb-1">Total Accumulated</div>
              <div className="text-2xl font-bold text-green-700">{formatRM(grandTotal)}</div>
              <div className="text-xs text-gray-400 mt-1">Across all staff</div>
            </div>
            <div className="card p-4 text-center">
              <div className="text-xs text-gray-400 mb-1">Total Ever Earned</div>
              <div className="text-2xl font-bold text-primary">{formatRM(totalEarned)}</div>
              <div className="text-xs text-gray-400 mt-1">All site bonuses</div>
            </div>
            <div className="card p-4 text-center">
              <div className="text-xs text-gray-400 mb-1">Staff with Saving</div>
              <div className="text-2xl font-bold text-accent">
                {employees.filter(e => Number(e.site_bonus_balance) > 0).length}
              </div>
              <div className="text-xs text-gray-400 mt-1">of {employees.length} active</div>
            </div>
          </div>

          {/* ── Main table ── */}
          <div className="card p-0 overflow-hidden">
            <div className="px-5 py-3 border-b border-bg flex items-center justify-between">
              <span className="text-sm font-semibold text-primary">Staff Saving Balance</span>
              <span className="text-xs text-gray-400">Click row to see monthly history</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: '#1e3a5f' }}>
                    <th className="px-4 py-2.5 text-left text-xs text-white font-semibold">Name</th>
                    <th className="px-4 py-2.5 text-right text-xs text-white font-semibold">Rate/day</th>
                    <th className="px-4 py-2.5 text-right text-xs text-white font-semibold">Current Balance</th>
                    <th className="px-4 py-2.5 text-center text-xs text-white font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((emp, idx) => {
                    const balance = Number(emp.site_bonus_balance || 0);
                    const history = bonusHistory[emp.id] ?? {};
                    const isOpen  = expanded === emp.id;
                    const monthsEarned = Object.entries(history).filter(([, v]) => v > 0).sort(([a], [b]) => b.localeCompare(a));

                    return (
                      <>
                        <tr key={emp.id}
                          onClick={() => setExpanded(isOpen ? null : emp.id)}
                          className="cursor-pointer hover:bg-gray-50 transition-colors"
                          style={{ background: idx % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: isOpen ? 'none' : '1px solid #f1f5f9' }}>
                          <td className="px-4 py-3 font-medium text-gray-800">
                            <span>{emp.full_name}</span>
                            <span className="ml-2 text-gray-400 text-xs">{isOpen ? '▲' : '▼'}</span>
                          </td>
                          <td className="px-4 py-3 text-right text-gray-500">{formatRM(Number(emp.daily_rate))}</td>
                          <td className="px-4 py-3 text-right">
                            <span className={`font-bold text-base ${balance > 0 ? 'text-green-700' : 'text-gray-400'}`}>
                              {formatRM(balance)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                            {balance > 0 ? (
                              <button
                                className="text-xs btn btn-secondary py-1 px-3"
                                onClick={() => openWithdrawal(emp.id)}>
                                💸 Withdraw
                              </button>
                            ) : (
                              <span className="text-xs text-gray-300">-</span>
                            )}
                          </td>
                        </tr>

                        {/* Monthly history expand */}
                        {isOpen && (
                          <tr key={`${emp.id}-history`}
                            style={{ background: '#f0fdf4', borderBottom: '2px solid #86efac' }}>
                            <td colSpan={4} className="px-6 py-3">
                              {monthsEarned.length === 0 ? (
                                <span className="text-xs text-gray-400">No site bonus earned yet.</span>
                              ) : (
                                <div>
                                  <div className="text-xs font-semibold text-green-700 mb-2 uppercase tracking-wide">Monthly Bonus History</div>
                                  <div className="flex flex-wrap gap-2">
                                    {monthsEarned.map(([month, amt]) => (
                                      <div key={month} className="flex items-center gap-1.5 bg-white rounded-lg px-3 py-1.5 border border-green-200 text-xs">
                                        <span className="text-gray-500 font-mono">{month}</span>
                                        <span className="text-green-700 font-bold">+{formatRM(amt)}</span>
                                      </div>
                                    ))}
                                  </div>
                                  <div className="mt-2 text-xs text-gray-400">
                                    Total earned: <strong className="text-green-700">{formatRM(monthsEarned.reduce((s, [, v]) => s + v, 0))}</strong>
                                  </div>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#f0f4f8', borderTop: '2px solid #cbd5e1', fontWeight: 700 }}>
                    <td className="px-4 py-2.5 text-sm text-primary" colSpan={2}>TOTAL</td>
                    <td className="px-4 py-2.5 text-right text-sm text-green-700">{formatRM(grandTotal)}</td>
                    <td className="px-4 py-2.5" />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* All months quick view */}
          {allMonths.length > 0 && (
            <div className="card p-4 mt-4">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Site Bonus Activity by Month</div>
              <div className="flex flex-wrap gap-2">
                {allMonths.map(month => {
                  const total = records
                    .filter(r => r.month === month)
                    .reduce((s, r) => s + Number(r.total_site_bonus || 0), 0);
                  return (
                    <div key={month} className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-xs">
                      <span className="font-mono text-gray-600">{month}</span>
                      <span className="font-bold text-green-700">+{formatRM(total)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Withdrawal modal ── */}
      {showModal && (() => {
        const emp = employees.find(e => e.id === wdEmpId);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-bold text-primary">💸 Withdraw Saving</h3>
                <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
              </div>
              <div className="p-5 space-y-4">
                <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-sm">
                  <div className="text-gray-600">{emp?.full_name}</div>
                  <div className="font-bold text-green-700 text-base mt-0.5">
                    Balance: {formatRM(Number(emp?.site_bonus_balance || 0))}
                  </div>
                </div>
                <div>
                  <label className="form-label">Withdrawal Month</label>
                  <input type="month" className="form-control" value={wdMonth} onChange={e => setWdMonth(e.target.value)} />
                </div>
                <div>
                  <label className="form-label">Amount (RM)</label>
                  <input type="number" min="0.01" step="0.01" className="form-control"
                    placeholder="0.00" value={wdAmount} onChange={e => setWdAmount(e.target.value)} />
                </div>
                <div>
                  <label className="form-label">Notes (optional)</label>
                  <input type="text" className="form-control" placeholder="Reason for withdrawal…"
                    value={wdNotes} onChange={e => setWdNotes(e.target.value)} />
                </div>
              </div>
              <div className="px-5 py-4 border-t border-gray-100 flex gap-2 justify-end">
                <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button className="btn btn-danger" onClick={submitWithdrawal} disabled={saving}>
                  {saving ? 'Processing…' : '💸 Confirm Withdraw'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
