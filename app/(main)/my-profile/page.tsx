'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import { getPermitStatus, RANK_COLORS } from '@/lib/utils';
import { useRole } from '@/lib/role-context';

function isPdf(url: string) { return url.toLowerCase().includes('.pdf'); }

function DocPreview({ url, label }: { url: string; label: string }) {
  if (!url) return null;
  return isPdf(url)
    ? <a href={url} target="_blank" rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:underline bg-blue-50 px-2 py-1.5 rounded-lg border border-blue-200 mt-1.5">
        📄 View {label} PDF
      </a>
    : <a href={url} target="_blank" rel="noopener noreferrer" className="block mt-1.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={label} className="h-20 w-auto rounded-lg border border-gray-200 object-cover hover:opacity-80 cursor-pointer" />
      </a>;
}

interface Employee {
  id: string; full_name: string;
  passport_no: string | null; permit_no: string | null; permit_expire: string | null;
  phone: string | null; daily_rate: number; rank: string | null;
  bank_name: string | null; bank_account: string | null;
  passport_doc_url: string | null; permit_doc_url: string | null;
  avatar_url: string | null; status: string;
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

function fmtRM(n: number) { return 'RM ' + n.toFixed(2); }
function fmtMonth(m: string | null) {
  if (!m) return '—';
  const [y, mo] = m.split('-');
  return new Date(Number(y), Number(mo) - 1).toLocaleString('en-GB', { month: 'long', year: 'numeric' });
}
function txLabel(row: TxRow) {
  if (row.reason) return row.reason;
  const map: Record<string, string> = {
    mission_bonus:        'Site bonus',
    monthly_interest:     `Monthly interest (${fmtMonth(row.month)})`,
    emergency_withdrawal: 'Emergency withdrawal',
    medical:              'Medical withdrawal',
    flight_home:          'Flight home',
    permit_renewal:       'Permit renewal',
    other:                'Withdrawal',
  };
  return map[row.type_detail] ?? row.type_detail ?? '—';
}

export default function MyProfilePage() {
  const { employee_id } = useRole();
  const [emp,     setEmp]     = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [alertMsg, setAlertMsg]   = useState('');
  const [alertType, setAlertType] = useState<'success' | 'danger'>('success');

  // Savings state
  const [savTxs,       setSavTxs]       = useState<TxRow[]>([]);
  const [savLoading,   setSavLoading]   = useState(false);
  const [projExpanded, setProjExpanded] = useState(false);

  // Edit form state
  const [editing, setEditing] = useState(false);
  const [editPhone,       setEditPhone]       = useState('');
  const [editPassportNo,  setEditPassportNo]  = useState('');
  const [editPermitNo,    setEditPermitNo]    = useState('');
  const [editPermitExp,   setEditPermitExp]   = useState('');
  const [editBank,        setEditBank]        = useState('');
  const [editBankAcc,     setEditBankAcc]     = useState('');
  const [editPassportUrl, setEditPassportUrl] = useState('');
  const [editPermitUrl,   setEditPermitUrl]   = useState('');
  const [docUploading,    setDocUploading]    = useState<'passport' | 'permit' | null>(null);
  const [saving, setSaving] = useState(false);
  const passportRef = useRef<HTMLInputElement>(null);
  const permitRef   = useRef<HTMLInputElement>(null);

  // Password change state
  const [pwOpen,     setPwOpen]     = useState(false);
  const [curPw,      setCurPw]      = useState('');
  const [newPw,      setNewPw]      = useState('');
  const [confPw,     setConfPw]     = useState('');
  const [pwSaving,   setPwSaving]   = useState(false);

  // Avatar upload
  const avatarRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  function showAlert(msg: string, type: 'success' | 'danger' = 'success') {
    setAlertMsg(msg); setAlertType(type); setTimeout(() => setAlertMsg(''), 4000);
  }

  async function load() {
    setLoading(true);
    const res = await fetch('/api/employees?self=true');
    const d   = await res.json();
    const list = Array.isArray(d) ? d : [];
    setEmp(list[0] || null);
    setLoading(false);
  }

  async function loadSavings(empId: string) {
    setSavLoading(true);
    try {
      const res = await fetch(`/api/savings/${empId}/statement`);
      if (res.ok) { const d = await res.json(); setSavTxs(Array.isArray(d) ? d : []); }
    } finally { setSavLoading(false); }
  }

  useEffect(() => { load(); }, []);
  useEffect(() => { if (employee_id) loadSavings(employee_id); }, [employee_id]);

  function startEdit() {
    if (!emp) return;
    setEditPhone(emp.phone || '');
    setEditPassportNo(emp.passport_no || '');
    setEditPermitNo(emp.permit_no || '');
    setEditPermitExp(emp.permit_expire || '');
    setEditBank(emp.bank_name || '');
    setEditBankAcc(emp.bank_account || '');
    setEditPassportUrl(emp.passport_doc_url || '');
    setEditPermitUrl(emp.permit_doc_url || '');
    setEditing(true);
  }

  async function saveEdit() {
    if (!emp || !employee_id) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/employees/${employee_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone:            editPhone,
          passport_no:      editPassportNo || null,
          permit_no:        editPermitNo   || null,
          permit_expire:    editPermitExp  || null,
          bank_name:        editBank,
          bank_account:     editBankAcc,
          passport_doc_url: editPassportUrl || null,
          permit_doc_url:   editPermitUrl   || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { showAlert(data.error, 'danger'); return; }
      showAlert('Profile updated ✅');
      setEditing(false);
      load();
    } finally { setSaving(false); }
  }

  const handleDocUpload = useCallback(async (file: File, docType: 'passport' | 'permit') => {
    if (!employee_id) return;
    setDocUploading(docType);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', docType);
      fd.append('employee_id', employee_id);
      const res  = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok && data.url) {
        if (docType === 'passport') setEditPassportUrl(data.url);
        else setEditPermitUrl(data.url);
        showAlert(`${docType === 'passport' ? 'Passport' : 'Permit'} uploaded ✅`);
      } else showAlert(data.error || 'Upload failed.', 'danger');
    } finally {
      setDocUploading(null);
      if (passportRef.current) passportRef.current.value = '';
      if (permitRef.current)   permitRef.current.value   = '';
    }
  }, [employee_id]);

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !employee_id) return;
    setAvatarUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', 'avatar');
      fd.append('employee_id', employee_id);
      const res  = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok && data.url) {
        showAlert('Photo updated ✅');
        setEmp(prev => prev ? { ...prev, avatar_url: data.url } : prev);
      } else showAlert(data.error, 'danger');
    } finally {
      setAvatarUploading(false);
      if (avatarRef.current) avatarRef.current.value = '';
    }
  }

  async function changePassword() {
    if (newPw !== confPw) { showAlert('New passwords do not match.', 'danger'); return; }
    if (newPw.length < 6)  { showAlert('Password must be at least 6 characters.', 'danger'); return; }
    setPwSaving(true);
    try {
      const res = await fetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: curPw, new_password: newPw }),
      });
      const data = await res.json();
      if (!res.ok) { showAlert(data.error, 'danger'); return; }
      showAlert('Password changed ✅');
      setPwOpen(false); setCurPw(''); setNewPw(''); setConfPw('');
    } finally { setPwSaving(false); }
  }

  if (loading) return <div className="p-6 text-center text-gray-400">Loading…</div>;
  if (!emp)    return <div className="p-6 text-center text-gray-400">Profile not found. Contact your manager.</div>;

  const permitStatus = emp.permit_expire ? getPermitStatus(emp.permit_expire) : null;
  const rankColor    = emp.rank ? (RANK_COLORS[emp.rank] || 'bg-gray-100 text-gray-600') : '';
  const initials     = emp.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  // ── Savings calculations ────────────────────────────────────────────
  const currentBalance = savTxs.length > 0 ? savTxs[savTxs.length - 1].running_balance : 0;
  const thisMonthStr   = new Date().toISOString().slice(0, 7);
  const thisMonthTxs   = savTxs.filter(r => r.month === thisMonthStr);
  const thisMonthBonus = thisMonthTxs.filter(r => r.type_detail === 'mission_bonus').reduce((s, r) => s + Number(r.amount), 0);
  const thisMonthInterest = thisMonthTxs.filter(r => r.type_detail === 'monthly_interest').reduce((s, r) => s + Number(r.amount), 0);
  const totalInterest  = savTxs.filter(r => r.type_detail === 'monthly_interest').reduce((s, r) => s + Number(r.amount), 0);
  const last6          = savTxs.slice(-6).reverse();
  const RATE = 0.02;
  const proj3  = Math.round(currentBalance * Math.pow(1 + RATE, 3)  * 100) / 100;
  const proj6  = Math.round(currentBalance * Math.pow(1 + RATE, 6)  * 100) / 100;
  const proj12 = Math.round(currentBalance * Math.pow(1 + RATE, 12) * 100) / 100;
  const projMax = proj12 || 1;
  const hasSavings = savTxs.length > 0;

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold text-primary">My Profile</h1>

      {alertMsg && <div className={`alert alert-${alertType}`}>{alertMsg}</div>}

      {/* ── Avatar + Name ── */}
      <div className="card px-6 py-5">
        <div className="flex items-center gap-5">
          <div className="relative shrink-0">
            {emp.avatar_url
              ? /* eslint-disable-next-line @next/next/no-img-element */
                <img src={emp.avatar_url} alt="avatar" className="w-20 h-20 rounded-full object-cover border-2 border-primary/20" />
              : <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center text-2xl font-bold text-primary">{initials}</div>
            }
            <input ref={avatarRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            <button
              type="button"
              disabled={avatarUploading}
              onClick={() => avatarRef.current?.click()}
              className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-white border border-gray-200 shadow flex items-center justify-center text-sm hover:bg-gray-50 transition">
              {avatarUploading ? '⏳' : '📷'}
            </button>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-gray-800">{emp.full_name}</h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {emp.rank && <span className={`badge ${rankColor}`}>{emp.rank}</span>}
              <span className={`badge ${emp.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {emp.status}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-1">Daily Rate: RM {Number(emp.daily_rate).toFixed(2)}</p>
          </div>
          <button className="btn btn-outline btn-sm shrink-0" onClick={startEdit}>✏️ Edit</button>
        </div>
      </div>

      {/* ── Editable section ── */}
      {editing ? (
        <div className="card space-y-5">
          <h3 className="text-sm font-semibold text-gray-700">Edit My Info</h3>

          {/* Contact */}
          <div>
            <label className="form-label">Phone</label>
            <input className="form-control" value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="+60 1X-XXXXXXX" />
          </div>

          {/* Work Permit */}
          <div className="space-y-3 border-t border-gray-100 pt-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Work Permit</p>
            <div>
              <label className="form-label">Passport No.</label>
              <input className="form-control" value={editPassportNo} onChange={e => setEditPassportNo(e.target.value)} placeholder="e.g. A12345678" />
            </div>
            <div>
              <label className="form-label">Permit No.</label>
              <input className="form-control" value={editPermitNo} onChange={e => setEditPermitNo(e.target.value)} placeholder="e.g. PL-XXXXXXXXX" />
            </div>
            <div>
              <label className="form-label">Permit Expiry Date</label>
              <input type="date" className="form-control" value={editPermitExp} onChange={e => setEditPermitExp(e.target.value)} />
              {editPermitExp && (() => {
                const days = Math.floor((new Date(editPermitExp).getTime() - Date.now()) / 86400000);
                if (days < 0)   return <p className="text-xs text-red-500 mt-1">⚠️ Expired {Math.abs(days)} days ago — notify your manager!</p>;
                if (days <= 60) return <p className="text-xs text-orange-500 mt-1">⚠️ Expires in {days} days</p>;
                return <p className="text-xs text-green-600 mt-1">✅ Valid for {days} days</p>;
              })()}
            </div>
          </div>

          {/* Bank */}
          <div>
            <label className="form-label">Bank Name</label>
            <input className="form-control" value={editBank} onChange={e => setEditBank(e.target.value)} placeholder="e.g. Maybank" />
          </div>
          <div>
            <label className="form-label">Bank Account No.</label>
            <input className="form-control" value={editBankAcc} onChange={e => setEditBankAcc(e.target.value)} placeholder="XXXXXXXXXX" />
          </div>

          {/* Documents */}
          <div className="space-y-3 border-t border-gray-100 pt-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Documents</p>

            {/* Passport doc */}
            <div>
              <label className="form-label">Passport Copy (PDF or Photo)</label>
              <div className="flex items-center gap-2">
                <input
                  ref={passportRef}
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleDocUpload(f, 'passport'); }}
                />
                <button
                  type="button"
                  disabled={docUploading === 'passport'}
                  onClick={() => passportRef.current?.click()}
                  className="btn btn-outline btn-sm text-xs">
                  {docUploading === 'passport' ? '⏳ Uploading…' : editPassportUrl ? '🔄 Re-upload' : '📎 Upload'}
                </button>
                {editPassportUrl && (
                  <button type="button" onClick={() => setEditPassportUrl('')} className="text-xs text-danger hover:underline">Remove</button>
                )}
              </div>
              {editPassportUrl && <DocPreview url={editPassportUrl} label="Passport" />}
            </div>

            {/* Permit doc */}
            <div>
              <label className="form-label">Work Permit Copy (PDF or Photo)</label>
              <div className="flex items-center gap-2">
                <input
                  ref={permitRef}
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleDocUpload(f, 'permit'); }}
                />
                <button
                  type="button"
                  disabled={docUploading === 'permit'}
                  onClick={() => permitRef.current?.click()}
                  className="btn btn-outline btn-sm text-xs">
                  {docUploading === 'permit' ? '⏳ Uploading…' : editPermitUrl ? '🔄 Re-upload' : '📎 Upload'}
                </button>
                {editPermitUrl && (
                  <button type="button" onClick={() => setEditPermitUrl('')} className="text-xs text-danger hover:underline">Remove</button>
                )}
              </div>
              {editPermitUrl && <DocPreview url={editPermitUrl} label="Permit" />}
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button className="btn btn-primary" onClick={saveEdit} disabled={saving || !!docUploading}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
            <button className="btn btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="card divide-y divide-gray-100 p-0">
          <Section title="Contact">
            <Field label="Phone" value={emp.phone} />
          </Section>
          <Section title="Work Permit">
            <Field label="Passport No." value={emp.passport_no} />
            <Field label="Permit No." value={emp.permit_no} />
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Permit Expiry</p>
              {emp.permit_expire
                ? <div>
                    <p className="text-sm font-medium text-gray-800">
                      {new Date(emp.permit_expire).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                    {permitStatus && <p className={`text-xs mt-0.5 ${permitStatus.cls}`}>{permitStatus.label}</p>}
                  </div>
                : <p className="text-sm text-gray-400">Not set</p>}
            </div>
          </Section>
          <Section title="Bank Info">
            <Field label="Bank" value={emp.bank_name} />
            <Field label="Account No." value={emp.bank_account} />
          </Section>
          {(emp.passport_doc_url || emp.permit_doc_url) && (
            <Section title="Documents">
              <div className="flex gap-3 flex-wrap col-span-2">
                {emp.passport_doc_url && <a href={emp.passport_doc_url} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm">📄 Passport</a>}
                {emp.permit_doc_url   && <a href={emp.permit_doc_url}   target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm">📄 Permit</a>}
              </div>
            </Section>
          )}
        </div>
      )}

      {/* ── Password Change ── */}
      <div className="card">
        <button
          className="flex items-center justify-between w-full text-left"
          onClick={() => { setPwOpen(o => !o); setCurPw(''); setNewPw(''); setConfPw(''); }}>
          <span className="font-medium text-gray-800">🔒 Change Password</span>
          <span className="text-gray-400 text-sm">{pwOpen ? '▲' : '▼'}</span>
        </button>

        {pwOpen && (
          <div className="mt-4 space-y-3 border-t border-gray-100 pt-4">
            <div>
              <label className="form-label">Current Password</label>
              <input type="password" className="form-control" value={curPw} onChange={e => setCurPw(e.target.value)} />
            </div>
            <div>
              <label className="form-label">New Password</label>
              <input type="password" className="form-control" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Min. 6 characters" />
            </div>
            <div>
              <label className="form-label">Confirm New Password</label>
              <input type="password" className="form-control" value={confPw} onChange={e => setConfPw(e.target.value)} />
            </div>
            <button className="btn btn-primary" onClick={changePassword} disabled={pwSaving}>
              {pwSaving ? 'Changing…' : 'Change Password'}
            </button>
          </div>
        )}
      </div>

      {/* ── My Savings Account ── */}
      <div className="card space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-xl">🏦</span>
          <h3 className="font-bold text-gray-800 text-lg">My Savings Account</h3>
        </div>

        {savLoading ? (
          <div className="text-center py-6 text-gray-400 animate-pulse">Loading savings…</div>
        ) : !hasSavings ? (
          <div className="text-center py-6">
            <p className="text-gray-400 text-sm">No savings yet.</p>
            <p className="text-gray-400 text-xs mt-1">Site bonuses from approved attendance will appear here.</p>
          </div>
        ) : (
          <>
            {/* Balance row */}
            <div className="bg-gradient-to-r from-primary/5 to-accent/5 rounded-xl p-5 border border-primary/10">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Current Balance</p>
              <p className="text-4xl font-extrabold text-primary">{fmtRM(currentBalance)}</p>
              <p className="text-xs text-gray-400 mt-1">2% monthly compound interest</p>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <p className="text-xs text-blue-500 font-medium mb-0.5">This Month's Bonus</p>
                <p className="text-lg font-bold text-blue-700">{thisMonthBonus > 0 ? fmtRM(thisMonthBonus) : '—'}</p>
              </div>
              <div className="bg-green-50 rounded-lg p-3 text-center">
                <p className="text-xs text-green-500 font-medium mb-0.5">Interest This Month</p>
                <p className="text-lg font-bold text-green-700">{thisMonthInterest > 0 ? `+${fmtRM(thisMonthInterest)}` : '—'}</p>
              </div>
              <div className="bg-purple-50 rounded-lg p-3 text-center">
                <p className="text-xs text-purple-500 font-medium mb-0.5">Total Interest Earned</p>
                <p className="text-lg font-bold text-purple-700">{totalInterest > 0 ? fmtRM(totalInterest) : '—'}</p>
              </div>
            </div>

            {/* Projection (collapsible) */}
            <div className="border border-gray-100 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setProjExpanded(o => !o)}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition text-sm font-medium text-gray-700">
                <span>📈 See Projection</span>
                <span className="text-gray-400">{projExpanded ? '▲' : '▼'}</span>
              </button>
              {projExpanded && (
                <div className="p-4 space-y-3">
                  <p className="text-xs text-gray-400">Based on current balance at 2%/month (no withdrawals)</p>
                  {[
                    { label: '3 months', value: proj3 },
                    { label: '6 months', value: proj6 },
                    { label: '12 months', value: proj12 },
                  ].map(p => (
                    <div key={p.label}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-600 font-medium">{p.label}</span>
                        <span className="font-bold text-primary">{fmtRM(p.value)}</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-primary to-accent rounded-full transition-all"
                          style={{ width: `${Math.min((p.value / projMax) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                  <p className="text-xs text-green-600 font-medium mt-2">
                    💡 At 12 months your savings could grow to <strong>{fmtRM(proj12)}</strong>
                    {' '}({fmtRM(proj12 - currentBalance)} in interest!)
                  </p>
                </div>
              )}
            </div>

            {/* Last 6 transactions */}
            <div>
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Recent Transactions</h4>
              <div className="divide-y divide-gray-50">
                {last6.map(tx => (
                  <div key={tx.id} className="flex items-center justify-between py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-700 truncate">{txLabel(tx)}</p>
                      <p className="text-xs text-gray-400">{new Date(tx.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                    </div>
                    <div className="ml-4 text-right shrink-0">
                      <p className={`text-sm font-bold ${tx.type === 'credit' ? 'text-green-600' : 'text-red-500'}`}>
                        {tx.type === 'credit' ? '+' : '-'}{fmtRM(Number(tx.amount))}
                      </p>
                      <p className="text-xs text-gray-400">Bal: {fmtRM(tx.running_balance)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-xs text-gray-400 text-center">Withdrawals are for emergencies only and require manager approval.</p>
          </>
        )}
      </div>

      <p className="text-xs text-gray-400 text-center">Contact your manager to update name, permit, or rate information.</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-6 py-4">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{title}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className="text-sm font-medium text-gray-800">{value || <span className="text-gray-300">—</span>}</p>
    </div>
  );
}
