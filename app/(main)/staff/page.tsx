'use client';
import { useEffect, useState, useMemo, useRef } from 'react';
import Modal from '@/components/Modal';
import { formatRM, getPermitStatus, RANK_RATES, RANK_COLORS } from '@/lib/utils';
import { useRole } from '@/lib/role-context';
import { useRouter } from 'next/navigation';

// ── Types ──────────────────────────────────────────────────────────────
interface EmpData {
  id: string; full_name: string; rank: string | null; daily_rate: number;
  permit_expire: string | null; phone: string | null;
  passport_no: string | null; permit_no: string | null;
  bank_name: string | null; bank_account: string | null;
  passport_doc_url: string | null; permit_doc_url: string | null;
  status: string;
}
interface UserRow {
  id: string; username: string; role: string; active: boolean;
  employee_id: string | null; created_at: string;
  employees: EmpData | null;
}
// Merged view: each row = one person (may have user and/or employee)
interface StaffRow {
  user_id: string | null;
  username: string | null;
  role: string | null;
  user_active: boolean | null;
  employee_id: string | null;
  full_name: string | null;
  rank: string | null;
  daily_rate: number | null;
  permit_expire: string | null;
  emp_status: string | null;
}

// ── Constants ──────────────────────────────────────────────────────────
const RANKS = ['Rookie', 'Support', 'Skilled', 'Pro', 'Core', 'Leader'];
const BANKS = [
  'Maybank', 'CIMB Bank', 'Public Bank', 'RHB Bank', 'Hong Leong Bank',
  'AmBank', 'Bank Islam', 'Bank Rakyat', 'BSN', 'OCBC Bank',
  'UOB Malaysia', 'Standard Chartered', 'HSBC Malaysia', 'Alliance Bank', 'Affin Bank',
];

const ROLE_CFG: Record<string, { label: string; color: string; icon: string }> = {
  owner:  { label: 'Owner',  color: 'bg-red-100 text-red-700',    icon: '👑' },
  admin:  { label: 'Admin',  color: 'bg-purple-100 text-purple-700', icon: '🔑' },
  leader: { label: 'Leader', color: 'bg-blue-100 text-blue-700',   icon: '👷' },
  worker: { label: 'Worker', color: 'bg-green-100 text-green-700', icon: '👤' },
};

function RoleBadge({ role }: { role: string }) {
  const cfg = ROLE_CFG[role] || { label: role, color: 'bg-gray-100 text-gray-600', icon: '?' };
  return <span className={`badge ${cfg.color}`}>{cfg.icon} {cfg.label}</span>;
}

function isPdf(url: string) { return url.toLowerCase().includes('.pdf'); }

function DocPreview({ url, label }: { url: string; label: string }) {
  if (!url) return null;
  return (
    <div className="mt-1.5">
      {isPdf(url)
        ? <a href={url} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline bg-blue-50 px-2 py-1 rounded border border-blue-200">
            📄 View {label} PDF
          </a>
        : <a href={url} target="_blank" rel="noopener noreferrer" title={`View ${label}`}>
            <img src={url} alt={label} className="h-20 w-auto rounded border border-gray-200 object-cover hover:opacity-80 cursor-pointer" />
          </a>}
    </div>
  );
}

function UploadButton({ empId, docType, currentUrl, onUploaded }: {
  empId: string | null; docType: 'passport' | 'permit';
  currentUrl: string; onUploaded: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  async function handleFile(file: File) {
    if (!empId) { setError('Save employee first before uploading.'); return; }
    setUploading(true); setError('');
    const fd = new FormData();
    fd.append('file', file); fd.append('type', docType); fd.append('employee_id', empId);
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      onUploaded(data.url);
    } finally { setUploading(false); }
  }
  return (
    <div>
      <input ref={inputRef} type="file" accept="image/*,.pdf" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
      <button type="button" disabled={uploading} onClick={() => inputRef.current?.click()}
        className="btn btn-outline btn-sm text-xs">
        {uploading ? 'Uploading…' : currentUrl ? '🔄 Re-upload' : '📎 Upload Photo / PDF'}
      </button>
      {error && <p className="text-xs text-danger mt-1">{error}</p>}
    </div>
  );
}

// ── Empty forms ────────────────────────────────────────────────────────
const EMPTY_ACCOUNT = { username: '', password: '', role: 'worker' };
const EMPTY_EMP = {
  full_name: '', phone: '', rank: '', daily_rate: '',
  passport_no: '', permit_no: '', permit_expire: '',
  bank_name: '', bank_account: '',
  passport_doc_url: '', permit_doc_url: '',
};

// ── Main Page ──────────────────────────────────────────────────────────
export default function StaffPage() {
  const { role: myRole, loaded } = useRole();
  const router = useRouter();
  const canManage = myRole === 'owner' || myRole === 'admin';

  const [users, setUsers]       = useState<UserRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [alertMsg, setAlertMsg] = useState('');
  const [alertType, setAlertType] = useState<'success' | 'danger'>('success');
  const [search, setSearch]     = useState('');
  const [roleFilter, setRoleFilter]   = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Add Staff modal (account + employee together)
  const [showAddModal, setShowAddModal] = useState(false);
  const [addStep, setAddStep]   = useState<1 | 2>(1);
  const [accForm, setAccForm]   = useState({ ...EMPTY_ACCOUNT });
  const [empForm, setEmpForm]   = useState({ ...EMPTY_EMP });
  const [addSaving, setAddSaving] = useState(false);
  const [createdUserId, setCreatedUserId]   = useState<string | null>(null);
  const [createdEmpId, setCreatedEmpId]     = useState<string | null>(null);

  // Edit Employee modal
  const [showEmpModal, setShowEmpModal]   = useState(false);
  const [editEmpId, setEditEmpId]         = useState<string | null>(null);
  const [editEmpForm, setEditEmpForm]     = useState({ ...EMPTY_EMP, status: 'active' });
  const [empSaving, setEmpSaving]         = useState(false);

  // Edit Account modal
  const [showAccModal, setShowAccModal]   = useState(false);
  const [editUserId, setEditUserId]       = useState<string | null>(null);
  const [editAccForm, setEditAccForm]     = useState({ role: '', password: '', newPassword: '' });
  const [accSaving, setAccSaving]         = useState(false);

  // Create Login modal (for employee without account)
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginEmpId, setLoginEmpId]         = useState<string | null>(null);
  const [loginForm, setLoginForm]           = useState({ username: '', password: '', role: 'worker' });
  const [loginSaving, setLoginSaving]       = useState(false);

  // Redirect non-managers
  useEffect(() => {
    if (loaded && !canManage) router.replace('/');
  }, [loaded, canManage, router]);

  async function loadData() {
    setLoading(true);
    const res = await fetch('/api/users');
    const data = await res.json();
    setUsers(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => { if (canManage) loadData(); }, [canManage]);

  function showAlert(msg: string, type: 'success' | 'danger' = 'success') {
    setAlertMsg(msg); setAlertType(type);
    setTimeout(() => setAlertMsg(''), 5000);
  }

  // Build merged staff rows
  const staffRows = useMemo<StaffRow[]>(() => {
    return users.map(u => ({
      user_id:     u.id,
      username:    u.username,
      role:        u.role,
      user_active: u.active,
      employee_id: u.employee_id,
      full_name:   u.employees?.full_name ?? null,
      rank:        u.employees?.rank ?? null,
      daily_rate:  u.employees?.daily_rate ?? null,
      permit_expire: u.employees?.permit_expire ?? null,
      emp_status:  u.employees?.status ?? null,
    }));
  }, [users]);

  const filtered = useMemo(() => staffRows.filter(r => {
    const name = (r.full_name || r.username || '').toLowerCase();
    if (search && !name.includes(search.toLowerCase())) return false;
    if (roleFilter && r.role !== roleFilter) return false;
    if (statusFilter === 'active'   && r.user_active === false) return false;
    if (statusFilter === 'inactive' && r.user_active !== false) return false;
    return true;
  }), [staffRows, search, roleFilter, statusFilter]);

  // ── Toggle account active ───────────────────────────────────────────
  async function toggleActive(userId: string, currentActive: boolean) {
    const res = await fetch(`/api/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !currentActive }),
    });
    if (res.ok) {
      showAlert(currentActive ? 'Account deactivated — user can no longer login.' : 'Account activated.');
      loadData();
    } else { const d = await res.json(); showAlert(d.error, 'danger'); }
  }

  // ── Add Staff: Step 1 — Account ────────────────────────────────────
  async function handleAddStep1(e: React.FormEvent) {
    e.preventDefault();
    if (addStep !== 1) return;

    // For leader/worker, we must also collect employee details
    const needsEmployee = accForm.role === 'leader' || accForm.role === 'worker';
    if (needsEmployee) {
      setAddStep(2);
      return;
    }

    // Owner/admin: create account only
    setAddSaving(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(accForm),
      });
      const data = await res.json();
      if (!res.ok) { showAlert(data.error, 'danger'); return; }
      showAlert(`Account "${data.username}" created!`);
      setShowAddModal(false);
      loadData();
    } finally { setAddSaving(false); }
  }

  // ── Add Staff: Step 2 — Employee details ───────────────────────────
  async function handleAddStep2(e: React.FormEvent) {
    e.preventDefault();
    if (!empForm.full_name.trim()) { showAlert('Full name is required.', 'danger'); return; }
    if (!empForm.rank) { showAlert('Rank is required.', 'danger'); return; }
    setAddSaving(true);
    try {
      // 1. Create employee record
      const empRes = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...empForm, daily_rate: Number(empForm.daily_rate) || 0 }),
      });
      const empData = await empRes.json();
      if (!empRes.ok) { showAlert(empData.error, 'danger'); return; }
      const employee_id = empData.id;
      setCreatedEmpId(employee_id);

      // 2. Create user account linked to employee
      const userRes = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...accForm, employee_id }),
      });
      const userData = await userRes.json();
      if (!userRes.ok) { showAlert(userData.error, 'danger'); return; }
      setCreatedUserId(userData.id);

      showAlert(`Staff member "${empData.full_name}" created with login "${userData.username}".`);
      setShowAddModal(false);
      loadData();
    } finally { setAddSaving(false); }
  }

  function openAdd() {
    setAccForm({ ...EMPTY_ACCOUNT });
    setEmpForm({ ...EMPTY_EMP });
    setAddStep(1);
    setCreatedUserId(null);
    setCreatedEmpId(null);
    setShowAddModal(true);
  }

  // ── Edit Employee details ───────────────────────────────────────────
  function openEditEmp(row: StaffRow) {
    if (!row.employee_id) return;
    const u = users.find(u => u.employee_id === row.employee_id);
    const emp = u?.employees;
    if (!emp) return;
    setEditEmpId(emp.id);
    setEditEmpForm({
      full_name: emp.full_name, phone: emp.phone || '',
      rank: emp.rank || '', daily_rate: String(emp.daily_rate),
      passport_no: emp.passport_no || '', permit_no: emp.permit_no || '',
      permit_expire: emp.permit_expire || '',
      bank_name: emp.bank_name || '', bank_account: emp.bank_account || '',
      passport_doc_url: emp.passport_doc_url || '', permit_doc_url: emp.permit_doc_url || '',
      status: emp.status,
    });
    setShowEmpModal(true);
  }

  async function handleEmpSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editEmpId) return;
    setEmpSaving(true);
    try {
      const res = await fetch(`/api/employees/${editEmpId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...editEmpForm, daily_rate: Number(editEmpForm.daily_rate) || 0 }),
      });
      const data = await res.json();
      if (!res.ok) { showAlert(data.error, 'danger'); return; }
      showAlert('Employee details updated.');
      setShowEmpModal(false);
      loadData();
    } finally { setEmpSaving(false); }
  }

  // ── Edit Account ────────────────────────────────────────────────────
  function openEditAcc(row: StaffRow) {
    if (!row.user_id) return;
    setEditUserId(row.user_id);
    setEditAccForm({ role: row.role || '', password: '', newPassword: '' });
    setShowAccModal(true);
  }

  async function handleAccSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editUserId) return;
    setAccSaving(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: Record<string, any> = {};
    if (editAccForm.role) updates.role = editAccForm.role;
    if (editAccForm.newPassword) updates.password = editAccForm.newPassword;
    try {
      const res = await fetch(`/api/users/${editUserId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (!res.ok) { showAlert(data.error, 'danger'); return; }
      showAlert('Account updated.');
      setShowAccModal(false);
      loadData();
    } finally { setAccSaving(false); }
  }

  // ── Create Login for existing employee ─────────────────────────────
  function openCreateLogin(row: StaffRow) {
    if (!row.employee_id) return;
    setLoginEmpId(row.employee_id);
    setLoginForm({ username: '', password: '', role: 'worker' });
    setShowLoginModal(true);
  }

  async function handleLoginSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoginSaving(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...loginForm, employee_id: loginEmpId }),
      });
      const data = await res.json();
      if (!res.ok) { showAlert(data.error, 'danger'); return; }
      showAlert(`Login "${data.username}" created.`);
      setShowLoginModal(false);
      loadData();
    } finally { setLoginSaving(false); }
  }

  // ── Delete account ─────────────────────────────────────────────────
  async function handleDeleteAcc(userId: string, username: string) {
    if (!confirm(`Delete login account "${username}"? The employee record is kept.`)) return;
    const res = await fetch(`/api/users/${userId}`, { method: 'DELETE' });
    if (res.ok) { showAlert('Account deleted.'); loadData(); }
    else { const d = await res.json(); showAlert(d.error, 'danger'); }
  }

  // ── Rank helpers ───────────────────────────────────────────────────
  function handleRankChange(rank: string, setter: (fn: (f: typeof EMPTY_EMP) => typeof EMPTY_EMP) => void) {
    const rate = RANK_RATES[rank];
    setter(f => ({ ...f, rank, daily_rate: rate ? String(rate) : f.daily_rate }));
  }

  // Roles available based on current user
  const creatableRoles = myRole === 'owner'
    ? ['owner', 'admin', 'leader', 'worker']
    : ['leader', 'worker'];

  if (!loaded || !canManage) return null;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary">Staff</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage employee records &amp; login accounts</p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>+ Add Staff</button>
      </div>

      {alertMsg && <div className={`alert alert-${alertType}`}>{alertMsg}</div>}

      {/* Filters */}
      <div className="card mb-4 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="form-label">Search</label>
            <input className="form-control" placeholder="Name or username…" value={search}
              onChange={e => setSearch(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Role</label>
            <select className="form-control" value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
              <option value="">All Roles</option>
              {Object.entries(ROLE_CFG).map(([r, c]) => (
                <option key={r} value={r}>{c.icon} {c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">Account Status</label>
            <select className="form-control" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-bg">
          <span className="text-sm font-semibold text-primary">
            {filtered.length} staff member{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center text-gray-400">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No staff found.</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-th">Name</th>
                  <th className="table-th">Role</th>
                  <th className="table-th">Username</th>
                  <th className="table-th">Rank</th>
                  <th className="table-th">Daily Rate</th>
                  <th className="table-th">Permit Expiry</th>
                  <th className="table-th">Account</th>
                  <th className="table-th">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(row => {
                  const permit = row.permit_expire ? getPermitStatus(row.permit_expire) : null;
                  const isActive = row.user_active !== false;
                  return (
                    <tr key={row.user_id} className={`table-tr ${!isActive ? 'opacity-60' : ''}`}>
                      {/* Name */}
                      <td className="table-td font-medium">
                        {row.full_name || <span className="text-gray-400 italic">No employee record</span>}
                      </td>

                      {/* Role */}
                      <td className="table-td">
                        {row.role ? <RoleBadge role={row.role} /> : '—'}
                      </td>

                      {/* Username */}
                      <td className="table-td font-mono text-sm text-gray-600">
                        {row.username || '—'}
                      </td>

                      {/* Rank */}
                      <td className="table-td">
                        {row.rank
                          ? <span className={`badge ${RANK_COLORS[row.rank] || 'bg-gray-100 text-gray-600'}`}>{row.rank}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>

                      {/* Daily Rate */}
                      <td className="table-td">
                        {row.daily_rate != null ? formatRM(row.daily_rate) : <span className="text-gray-300">—</span>}
                      </td>

                      {/* Permit Expiry */}
                      <td className={`table-td text-sm ${permit?.cls || 'text-gray-400'}`}>
                        {permit?.label || '—'}
                      </td>

                      {/* Account Status */}
                      <td className="table-td">
                        {row.user_id ? (
                          <button
                            onClick={() => row.user_id && toggleActive(row.user_id, isActive)}
                            className={`badge cursor-pointer hover:opacity-80 transition-opacity ${isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
                            title={isActive ? 'Click to deactivate' : 'Click to activate'}>
                            {isActive ? '✅ Active' : '🔴 Inactive'}
                          </button>
                        ) : (
                          <span className="badge bg-gray-100 text-gray-400">No Login</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="table-td">
                        <div className="flex gap-1.5 flex-wrap">
                          {row.employee_id && (
                            <button className="btn btn-outline btn-sm" onClick={() => openEditEmp(row)}>
                              ✏️ Details
                            </button>
                          )}
                          {row.user_id ? (
                            <>
                              <button className="btn btn-outline btn-sm" onClick={() => openEditAcc(row)}>
                                🔑 Account
                              </button>
                              <button className="btn btn-danger btn-sm" onClick={() => handleDeleteAcc(row.user_id!, row.username!)}>
                                Del
                              </button>
                            </>
                          ) : (
                            row.employee_id && (
                              <button className="btn btn-sm bg-blue-500 hover:bg-blue-600 text-white" onClick={() => openCreateLogin(row)}>
                                + Login
                              </button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Add Staff Modal ─────────────────────────────────────────── */}
      <Modal open={showAddModal} onClose={() => setShowAddModal(false)}
        title="Add Staff" maxWidth="max-w-lg">

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-5">
          <div className={`flex items-center gap-2 text-sm font-semibold ${addStep === 1 ? 'text-primary' : 'text-gray-400'}`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs text-white ${addStep === 1 ? 'bg-primary' : 'bg-gray-300'}`}>1</span>
            Login Account
          </div>
          {(accForm.role === 'leader' || accForm.role === 'worker') && (
            <>
              <div className="flex-1 h-px bg-gray-200" />
              <div className={`flex items-center gap-2 text-sm font-semibold ${addStep === 2 ? 'text-primary' : 'text-gray-400'}`}>
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs text-white ${addStep === 2 ? 'bg-primary' : 'bg-gray-300'}`}>2</span>
                Employee Details
              </div>
            </>
          )}
        </div>

        {/* Step 1 — Account */}
        {addStep === 1 && (
          <form onSubmit={handleAddStep1} className="space-y-4">
            <div>
              <label className="form-label">Role *</label>
              <div className="grid grid-cols-2 gap-2">
                {creatableRoles.map(r => {
                  const cfg = ROLE_CFG[r];
                  return (
                    <label key={r} className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 cursor-pointer transition-colors
                      ${accForm.role === r ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-gray-300'}`}>
                      <input type="radio" name="role" value={r} className="sr-only"
                        checked={accForm.role === r} onChange={() => setAccForm(f => ({ ...f, role: r }))} />
                      <span className="text-lg">{cfg.icon}</span>
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{cfg.label}</p>
                        <p className="text-xs text-gray-400">
                          {r === 'owner' ? 'Highest authority' :
                           r === 'admin' ? 'Full management access' :
                           r === 'leader' ? 'Submit attendance' :
                           'View own records only'}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="form-label">Username *</label>
              <input className="form-control" required placeholder="e.g. ahmad123 (lowercase)"
                value={accForm.username} onChange={e => setAccForm(f => ({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, '') }))} />
            </div>
            <div>
              <label className="form-label">Password *</label>
              <input type="password" className="form-control" required placeholder="Min. 6 characters"
                value={accForm.password} onChange={e => setAccForm(f => ({ ...f, password: e.target.value }))} />
            </div>
            {(accForm.role === 'leader' || accForm.role === 'worker') && (
              <div className="rounded bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-700">
                💡 Next step: fill in employee details (name, rank, etc.)
              </div>
            )}
            <div className="flex gap-3 pt-1">
              <button type="submit" disabled={addSaving} className="btn btn-primary">
                {addSaving ? 'Creating…' : (accForm.role === 'leader' || accForm.role === 'worker') ? 'Next →' : 'Create Account'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
            </div>
          </form>
        )}

        {/* Step 2 — Employee Details */}
        {addStep === 2 && (
          <form onSubmit={handleAddStep2} className="space-y-4">
            <button type="button" className="text-xs text-primary underline mb-1" onClick={() => setAddStep(1)}>
              ← Back to Account
            </button>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="form-label">Full Name *</label>
                <input className="form-control" required placeholder="As per passport"
                  value={empForm.full_name} onChange={e => setEmpForm(f => ({ ...f, full_name: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">Phone</label>
                <input className="form-control" placeholder="01X-XXXXXXX"
                  value={empForm.phone} onChange={e => setEmpForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="form-label">Rank *</label>
                <select className="form-control" required value={empForm.rank}
                  onChange={e => handleRankChange(e.target.value, setEmpForm as never)}>
                  <option value="">Select rank…</option>
                  {RANKS.map(r => <option key={r} value={r}>{r} — RM {RANK_RATES[r]}/day</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Daily Rate (RM)</label>
                <input className="form-control bg-gray-50 cursor-not-allowed" readOnly tabIndex={-1}
                  value={empForm.daily_rate} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="form-label">Passport No</label>
                <input className="form-control" value={empForm.passport_no}
                  onChange={e => setEmpForm(f => ({ ...f, passport_no: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">Permit No</label>
                <input className="form-control" value={empForm.permit_no}
                  onChange={e => setEmpForm(f => ({ ...f, permit_no: e.target.value }))} />
              </div>
            </div>

            <div>
              <label className="form-label">Permit Expiry Date</label>
              <input type="date" className="form-control" value={empForm.permit_expire}
                onChange={e => setEmpForm(f => ({ ...f, permit_expire: e.target.value }))} />
            </div>

            <div className="rounded bg-gray-50 border border-gray-200 px-3 py-2 text-xs text-gray-500">
              💡 Bank details, documents &amp; more can be added by editing the employee after creation.
            </div>

            <div className="flex gap-3 pt-1">
              <button type="submit" disabled={addSaving} className="btn btn-primary">
                {addSaving ? 'Creating…' : '✓ Create Staff'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
            </div>
          </form>
        )}
      </Modal>

      {/* ── Edit Employee Modal ─────────────────────────────────────── */}
      <Modal open={showEmpModal} onClose={() => setShowEmpModal(false)}
        title="Edit Employee Details" maxWidth="max-w-2xl">
        <form onSubmit={handleEmpSubmit} className="space-y-5">

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="form-label">Full Name *</label>
              <input className="form-control" required value={editEmpForm.full_name}
                onChange={e => setEditEmpForm(f => ({ ...f, full_name: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Phone</label>
              <input className="form-control" value={editEmpForm.phone}
                onChange={e => setEditEmpForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="form-label">Rank *</label>
              <select className="form-control" required value={editEmpForm.rank}
                onChange={e => handleRankChange(e.target.value, setEditEmpForm as never)}>
                <option value="">Select rank…</option>
                {RANKS.map(r => <option key={r} value={r}>{r} — RM {RANK_RATES[r]}/day</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Daily Rate (RM)</label>
              <input className="form-control bg-gray-50 cursor-not-allowed" readOnly tabIndex={-1} value={editEmpForm.daily_rate} />
            </div>
          </div>

          {/* Passport */}
          <div className="rounded-lg border border-gray-200 p-4">
            <p className="text-xs font-semibold text-gray-600 mb-3">🛂 Passport</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-2">
              <div>
                <label className="form-label">Passport No</label>
                <input className="form-control" value={editEmpForm.passport_no}
                  onChange={e => setEditEmpForm(f => ({ ...f, passport_no: e.target.value }))} />
              </div>
              <div className="flex flex-col justify-end">
                <UploadButton empId={editEmpId} docType="passport" currentUrl={editEmpForm.passport_doc_url}
                  onUploaded={url => setEditEmpForm(f => ({ ...f, passport_doc_url: url }))} />
              </div>
            </div>
            {editEmpForm.passport_doc_url && <DocPreview url={editEmpForm.passport_doc_url} label="Passport" />}
          </div>

          {/* Permit */}
          <div className="rounded-lg border border-gray-200 p-4">
            <p className="text-xs font-semibold text-gray-600 mb-3">📋 Work Permit</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-2">
              <div>
                <label className="form-label">Permit No</label>
                <input className="form-control" value={editEmpForm.permit_no}
                  onChange={e => setEditEmpForm(f => ({ ...f, permit_no: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">Expiry Date</label>
                <input type="date" className="form-control" value={editEmpForm.permit_expire}
                  onChange={e => setEditEmpForm(f => ({ ...f, permit_expire: e.target.value }))} />
              </div>
              <div className="flex flex-col justify-end">
                <UploadButton empId={editEmpId} docType="permit" currentUrl={editEmpForm.permit_doc_url}
                  onUploaded={url => setEditEmpForm(f => ({ ...f, permit_doc_url: url }))} />
              </div>
            </div>
            {editEmpForm.permit_expire && (() => {
              const days = Math.floor((new Date(editEmpForm.permit_expire).getTime() - Date.now()) / 86400000);
              if (days < 0) return <p className="text-xs text-danger font-semibold">⚠️ Expired {Math.abs(days)} days ago</p>;
              if (days <= 60) return <p className="text-xs text-warn font-semibold">⚠️ Expires in {days} day{days !== 1 ? 's' : ''}</p>;
              return <p className="text-xs text-green-600">✅ Valid for {days} days</p>;
            })()}
            {editEmpForm.permit_doc_url && <div className="mt-2"><DocPreview url={editEmpForm.permit_doc_url} label="Permit" /></div>}
          </div>

          {/* Bank */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="form-label">Bank</label>
              <select className="form-control" value={editEmpForm.bank_name}
                onChange={e => setEditEmpForm(f => ({ ...f, bank_name: e.target.value }))}>
                <option value="">Select bank…</option>
                {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Account No</label>
              <input className="form-control" value={editEmpForm.bank_account}
                onChange={e => setEditEmpForm(f => ({ ...f, bank_account: e.target.value }))} />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={empSaving} className="btn btn-primary">
              {empSaving ? 'Saving…' : 'Save Changes'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowEmpModal(false)}>Cancel</button>
          </div>
        </form>
      </Modal>

      {/* ── Edit Account Modal ──────────────────────────────────────── */}
      <Modal open={showAccModal} onClose={() => setShowAccModal(false)}
        title="Edit Login Account" maxWidth="max-w-sm">
        <form onSubmit={handleAccSubmit} className="space-y-4">
          <div>
            <label className="form-label">Role</label>
            <div className="space-y-2">
              {creatableRoles.map(r => {
                const cfg = ROLE_CFG[r];
                return (
                  <label key={r} className={`flex items-center gap-3 px-3 py-2 rounded-lg border-2 cursor-pointer transition-colors
                    ${editAccForm.role === r ? 'border-primary bg-primary/5' : 'border-gray-200'}`}>
                    <input type="radio" name="editRole" value={r} className="sr-only"
                      checked={editAccForm.role === r} onChange={() => setEditAccForm(f => ({ ...f, role: r }))} />
                    <span>{cfg.icon}</span>
                    <span className="text-sm font-medium">{cfg.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
          <div>
            <label className="form-label">New Password <span className="text-gray-400 font-normal">(leave blank to keep current)</span></label>
            <input type="password" className="form-control" placeholder="Min. 6 characters"
              value={editAccForm.newPassword} onChange={e => setEditAccForm(f => ({ ...f, newPassword: e.target.value }))} />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={accSaving} className="btn btn-primary">
              {accSaving ? 'Saving…' : 'Save Changes'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowAccModal(false)}>Cancel</button>
          </div>
        </form>
      </Modal>

      {/* ── Create Login Modal ─────────────────────────────────────── */}
      <Modal open={showLoginModal} onClose={() => setShowLoginModal(false)}
        title="Create Login Account" maxWidth="max-w-sm">
        <form onSubmit={handleLoginSubmit} className="space-y-4">
          <div>
            <label className="form-label">Role *</label>
            <select className="form-control" value={loginForm.role} onChange={e => setLoginForm(f => ({ ...f, role: e.target.value }))}>
              {creatableRoles.map(r => <option key={r} value={r}>{ROLE_CFG[r].icon} {ROLE_CFG[r].label}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Username *</label>
            <input className="form-control" required placeholder="e.g. ahmad123"
              value={loginForm.username} onChange={e => setLoginForm(f => ({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, '') }))} />
          </div>
          <div>
            <label className="form-label">Password *</label>
            <input type="password" className="form-control" required placeholder="Min. 6 characters"
              value={loginForm.password} onChange={e => setLoginForm(f => ({ ...f, password: e.target.value }))} />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={loginSaving} className="btn btn-primary">
              {loginSaving ? 'Creating…' : 'Create Login'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowLoginModal(false)}>Cancel</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
