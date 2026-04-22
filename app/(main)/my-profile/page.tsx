'use client';
import { useEffect, useState, useRef } from 'react';
import { getPermitStatus, RANK_COLORS } from '@/lib/utils';
import { useRole } from '@/lib/role-context';

interface Employee {
  id: string; full_name: string;
  passport_no: string | null; permit_no: string | null; permit_expire: string | null;
  phone: string | null; daily_rate: number; rank: string | null;
  bank_name: string | null; bank_account: string | null;
  passport_doc_url: string | null; permit_doc_url: string | null;
  avatar_url: string | null; status: string;
}

export default function MyProfilePage() {
  const { employee_id } = useRole();
  const [emp,     setEmp]     = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [alertMsg, setAlertMsg]   = useState('');
  const [alertType, setAlertType] = useState<'success' | 'danger'>('success');

  // Edit form state
  const [editing, setEditing] = useState(false);
  const [editPhone,    setEditPhone]    = useState('');
  const [editBank,     setEditBank]     = useState('');
  const [editBankAcc,  setEditBankAcc]  = useState('');
  const [saving, setSaving] = useState(false);

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
    const res = await fetch('/api/employees');
    const d   = await res.json();
    const list = Array.isArray(d) ? d : [];
    setEmp(list[0] || null);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function startEdit() {
    if (!emp) return;
    setEditPhone(emp.phone || '');
    setEditBank(emp.bank_name || '');
    setEditBankAcc(emp.bank_account || '');
    setEditing(true);
  }

  async function saveEdit() {
    if (!emp || !employee_id) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/employees/${employee_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: editPhone, bank_name: editBank, bank_account: editBankAcc }),
      });
      const data = await res.json();
      if (!res.ok) { showAlert(data.error, 'danger'); return; }
      showAlert('Profile updated ✅');
      setEditing(false);
      load();
    } finally { setSaving(false); }
  }

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
        <div className="card space-y-4">
          <h3 className="text-sm font-semibold text-gray-700">Edit Contact & Bank Info</h3>
          <div>
            <label className="form-label">Phone</label>
            <input className="form-control" value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="+60 1X-XXXXXXX" />
          </div>
          <div>
            <label className="form-label">Bank Name</label>
            <input className="form-control" value={editBank} onChange={e => setEditBank(e.target.value)} placeholder="e.g. Maybank" />
          </div>
          <div>
            <label className="form-label">Bank Account No.</label>
            <input className="form-control" value={editBankAcc} onChange={e => setEditBankAcc(e.target.value)} placeholder="XXXXXXXXXX" />
          </div>
          <div className="flex gap-3">
            <button className="btn btn-primary" onClick={saveEdit} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
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
