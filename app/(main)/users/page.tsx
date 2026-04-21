'use client';
import { useEffect, useState } from 'react';
import Modal from '@/components/Modal';
import { useRole } from '@/lib/role-context';
import { useRouter } from 'next/navigation';

interface UserRow {
  id: string;
  username: string;
  role: string;
  employee_id: string | null;
  created_at: string;
  employees: { full_name: string } | null;
}
interface Employee { id: string; full_name: string; status: string; }

const ROLE_COLORS: Record<string, string> = {
  admin:  'bg-purple-100 text-purple-700',
  leader: 'bg-blue-100 text-blue-700',
  worker: 'bg-green-100 text-green-700',
};

const EMPTY_FORM = { username: '', password: '', role: 'worker', employee_id: '' };

export default function UsersPage() {
  const { role, loaded } = useRole();
  const router = useRouter();
  const [users, setUsers]     = useState<UserRow[]>([]);
  const [empList, setEmpList] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [alertMsg, setAlertMsg]   = useState('');
  const [alertType, setAlertType] = useState<'success' | 'danger'>('success');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm]           = useState({ ...EMPTY_FORM });
  const [saving, setSaving]       = useState(false);
  const [editId, setEditId]       = useState<string | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetId, setResetId]               = useState<string | null>(null);
  const [newPassword, setNewPassword]       = useState('');

  // Redirect non-admins
  useEffect(() => {
    if (loaded && role !== 'admin') router.replace('/');
  }, [loaded, role, router]);

  async function loadData() {
    setLoading(true);
    const [uRes, eRes] = await Promise.all([
      fetch('/api/users').then(r => r.json()),
      fetch('/api/employees?status=active').then(r => r.json()),
    ]);
    setUsers(Array.isArray(uRes) ? uRes : []);
    setEmpList(Array.isArray(eRes) ? eRes : []);
    setLoading(false);
  }

  useEffect(() => { if (role === 'admin') loadData(); }, [role]);

  function showAlert(msg: string, type: 'success' | 'danger' = 'success') {
    setAlertMsg(msg); setAlertType(type);
    setTimeout(() => setAlertMsg(''), 5000);
  }

  function openCreate() {
    setForm({ ...EMPTY_FORM });
    setEditId(null);
    setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { showAlert(data.error, 'danger'); return; }
      showAlert(`Account "${data.username}" created successfully!`);
      setShowModal(false);
      loadData();
    } finally { setSaving(false); }
  }

  async function handleDelete(u: UserRow) {
    if (!confirm(`Delete account "${u.username}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/users/${u.id}`, { method: 'DELETE' });
    if (res.ok) { showAlert('Account deleted.'); loadData(); }
    else { const d = await res.json(); showAlert(d.error, 'danger'); }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    if (!resetId || newPassword.length < 6) { showAlert('Password must be at least 6 characters.', 'danger'); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/users/${resetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) { showAlert(data.error, 'danger'); return; }
      showAlert('Password reset successfully!');
      setShowResetModal(false);
      setNewPassword('');
    } finally { setSaving(false); }
  }

  if (!loaded || role !== 'admin') return null;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-primary">User Accounts</h1>
        <button className="btn btn-primary" onClick={openCreate}>+ Add Account</button>
      </div>

      {alertMsg && <div className={`alert alert-${alertType}`}>{alertMsg}</div>}

      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-th">Username</th>
                  <th className="table-th">Role</th>
                  <th className="table-th">Linked Employee</th>
                  <th className="table-th">Created</th>
                  <th className="table-th">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="table-tr">
                    <td className="table-td font-medium font-mono text-sm">{u.username}</td>
                    <td className="table-td">
                      <span className={`badge ${ROLE_COLORS[u.role] || 'bg-gray-100 text-gray-600'}`}>
                        {u.role === 'admin' ? '👑 Admin' : u.role === 'leader' ? '👷 Leader' : '👤 Worker'}
                      </span>
                    </td>
                    <td className="table-td text-gray-600">
                      {u.employees?.full_name || <span className="text-gray-300">—</span>}
                    </td>
                    <td className="table-td text-gray-400 text-sm">
                      {new Date(u.created_at).toLocaleDateString('en-GB')}
                    </td>
                    <td className="table-td">
                      <div className="flex gap-1.5">
                        <button className="btn btn-outline btn-sm"
                          onClick={() => { setResetId(u.id); setNewPassword(''); setShowResetModal(true); }}>
                          Reset PW
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(u)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {users.length === 0 && (
              <div className="p-8 text-center text-gray-400">No user accounts found.</div>
            )}
          </div>
        )}
      </div>

      {/* Create Account Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Create Account" maxWidth="max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="form-label">Username *</label>
            <input className="form-control" required placeholder="e.g. ahmad123"
              value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value.toLowerCase() }))} />
            <p className="text-xs text-gray-400 mt-1">Lowercase letters and numbers only</p>
          </div>
          <div>
            <label className="form-label">Password *</label>
            <input type="password" className="form-control" required placeholder="Min. 6 characters"
              value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">Role *</label>
            <select className="form-control" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
              <option value="worker">👤 Worker — view own data only</option>
              <option value="leader">👷 Leader — submit attendance</option>
              <option value="admin">👑 Admin — full access</option>
            </select>
          </div>
          <div>
            <label className="form-label">Link to Employee {form.role !== 'admin' ? '*' : '(optional)'}</label>
            <select className="form-control"
              required={form.role !== 'admin'}
              value={form.employee_id}
              onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))}>
              <option value="">— Select employee —</option>
              {empList.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
            </select>
            {form.role !== 'admin' && (
              <p className="text-xs text-gray-400 mt-1">Links this account to an employee record</p>
            )}
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving} className="btn btn-primary">
              {saving ? 'Creating…' : 'Create Account'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
          </div>
        </form>
      </Modal>

      {/* Reset Password Modal */}
      <Modal open={showResetModal} onClose={() => setShowResetModal(false)} title="Reset Password" maxWidth="max-w-sm">
        <form onSubmit={handleReset} className="space-y-4">
          <div>
            <label className="form-label">New Password *</label>
            <input type="password" className="form-control" required placeholder="Min. 6 characters"
              value={newPassword} onChange={e => setNewPassword(e.target.value)} />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving} className="btn btn-primary">
              {saving ? 'Saving…' : 'Reset Password'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowResetModal(false)}>Cancel</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
