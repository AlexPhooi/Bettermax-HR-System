'use client';
import { useEffect, useState, useMemo, useRef } from 'react';
import Modal from '@/components/Modal';
import { formatRM, formatDate, getPermitStatus, RANK_RATES, RANK_COLORS } from '@/lib/utils';

const RANKS = ['Rookie', 'Support', 'Skilled', 'Pro', 'Core', 'Leader'];
const BANKS = [
  'Maybank', 'CIMB Bank', 'Public Bank', 'RHB Bank', 'Hong Leong Bank',
  'AmBank', 'Bank Islam', 'Bank Rakyat', 'BSN', 'OCBC Bank',
  'UOB Malaysia', 'Standard Chartered', 'HSBC Malaysia', 'Alliance Bank', 'Affin Bank',
];

interface Employee {
  id: string;
  full_name: string;
  passport_no: string | null;
  permit_no: string | null;
  permit_expire: string | null;
  phone: string | null;
  daily_rate: number;
  rank: string | null;
  bank_name: string | null;
  bank_account: string | null;
  passport_doc_url: string | null;
  permit_doc_url: string | null;
  status: string;
}

const EMPTY_FORM = {
  full_name: '', phone: '', rank: '', daily_rate: '',
  passport_no: '', permit_no: '', permit_expire: '',
  bank_name: '', bank_account: '', status: 'active',
  passport_doc_url: '', permit_doc_url: '',
};

function maskAccount(acc: string | null) {
  if (!acc) return '-';
  if (acc.length <= 4) return acc;
  return '••••' + acc.slice(-4);
}

function isPdf(url: string) { return url.toLowerCase().includes('.pdf'); }

function DocPreview({ url, label }: { url: string; label: string }) {
  if (!url) return null;
  return (
    <div className="mt-1">
      {isPdf(url) ? (
        <a href={url} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:underline bg-blue-50 px-3 py-1.5 rounded border border-blue-200">
          📄 View {label} PDF
        </a>
      ) : (
        <a href={url} target="_blank" rel="noopener noreferrer" title={`View ${label}`}>
          <img src={url} alt={label}
            className="h-24 w-auto rounded border border-gray-200 object-cover hover:opacity-80 transition-opacity cursor-pointer" />
        </a>
      )}
    </div>
  );
}

function UploadButton({
  empId, docType, currentUrl, onUploaded, disabled,
}: {
  empId: string | null;
  docType: 'passport' | 'permit';
  currentUrl: string;
  onUploaded: (url: string) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  async function handleFile(file: File) {
    if (!empId) { setError('Save the employee first before uploading a document.'); return; }
    setUploading(true); setError('');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('type', docType);
    fd.append('employee_id', empId);
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
      <button type="button" disabled={uploading || disabled}
        onClick={() => inputRef.current?.click()}
        className="btn btn-outline btn-sm text-xs">
        {uploading ? 'Uploading…' : currentUrl ? '🔄 Re-upload' : '📎 Upload Photo / PDF'}
      </button>
      {error && <p className="text-xs text-danger mt-1">{error}</p>}
    </div>
  );
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading]     = useState(true);
  const [alertMsg, setAlertMsg]   = useState('');
  const [alertType, setAlertType] = useState<'success' | 'danger'>('success');
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId]       = useState<string | null>(null);
  const [saving, setSaving]       = useState(false);
  const [form, setForm]           = useState({ ...EMPTY_FORM });
  const [search, setSearch]       = useState('');
  const [rankFilter, setRankFilter]     = useState('');
  const [statusFilter, setStatusFilter] = useState('active');

  function showAlert(msg: string, type: 'success' | 'danger' = 'success') {
    setAlertMsg(msg); setAlertType(type);
    setTimeout(() => setAlertMsg(''), 4000);
  }

  async function loadEmployees() {
    setLoading(true);
    const res  = await fetch('/api/employees');
    const data = await res.json();
    setEmployees(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => { loadEmployees(); }, []);

  const filtered = useMemo(() => employees.filter(e => {
    const matchSearch  = !search || e.full_name.toLowerCase().includes(search.toLowerCase());
    const matchRank    = !rankFilter   || e.rank   === rankFilter;
    const matchStatus  = !statusFilter || e.status === statusFilter;
    return matchSearch && matchRank && matchStatus;
  }), [employees, search, rankFilter, statusFilter]);

  function openAdd() {
    setForm({ ...EMPTY_FORM }); setEditId(null); setShowModal(true);
  }

  function openEdit(emp: Employee) {
    setForm({
      full_name: emp.full_name, phone: emp.phone || '',
      rank: emp.rank || '', daily_rate: String(emp.daily_rate),
      passport_no: emp.passport_no || '', permit_no: emp.permit_no || '',
      permit_expire: emp.permit_expire || '',
      bank_name: emp.bank_name || '', bank_account: emp.bank_account || '',
      status: emp.status,
      passport_doc_url: emp.passport_doc_url || '',
      permit_doc_url:   emp.permit_doc_url   || '',
    });
    setEditId(emp.id); setShowModal(true);
  }

  function handleRankChange(rank: string) {
    const rate = RANK_RATES[rank];
    setForm(f => ({ ...f, rank, daily_rate: rate ? String(rate) : f.daily_rate }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const url    = editId ? `/api/employees/${editId}` : '/api/employees';
      const method = editId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, daily_rate: Number(form.daily_rate) || 0 }),
      });
      const data = await res.json();
      if (!res.ok) { showAlert(data.error, 'danger'); return; }
      // After add, set editId so subsequent uploads work
      if (!editId && data.id) setEditId(data.id);
      showAlert(editId ? 'Employee updated.' : 'Employee added.');
      setShowModal(false);
      loadEmployees();
    } finally { setSaving(false); }
  }

  async function toggleStatus(emp: Employee) {
    const newStatus = emp.status === 'active' ? 'inactive' : 'active';
    const res = await fetch(`/api/employees/${emp.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...emp, status: newStatus }),
    });
    if (res.ok) {
      showAlert(`Employee ${newStatus === 'active' ? 'activated' : 'deactivated'}.`);
      loadEmployees();
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-primary">Employees</h1>
        <button className="btn btn-primary" onClick={openAdd}>+ Add Employee</button>
      </div>

      {alertMsg && <div className={`alert alert-${alertType}`}>{alertMsg}</div>}

      {/* Filters */}
      <div className="card mb-4 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="form-label">Search</label>
            <input className="form-control" placeholder="Search name…" value={search}
              onChange={e => setSearch(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Rank</label>
            <select className="form-control" value={rankFilter} onChange={e => setRankFilter(e.target.value)}>
              <option value="">All Ranks</option>
              {RANKS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Status</label>
            <select className="form-control" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-bg flex items-center justify-between">
          <span className="text-sm font-semibold text-primary">
            {filtered.length} employee{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center text-gray-400">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No employees found.</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-th">Name</th>
                  <th className="table-th">Rank</th>
                  <th className="table-th">Daily Rate</th>
                  <th className="table-th">Bank Account</th>
                  <th className="table-th">Passport</th>
                  <th className="table-th">Permit No</th>
                  <th className="table-th">Permit Expiry</th>
                  <th className="table-th">Phone</th>
                  <th className="table-th">Status</th>
                  <th className="table-th">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(emp => {
                  const permit = getPermitStatus(emp.permit_expire);
                  return (
                    <tr key={emp.id} className="table-tr">
                      <td className="table-td font-medium">{emp.full_name}</td>
                      <td className="table-td">
                        {emp.rank
                          ? <span className={`badge ${RANK_COLORS[emp.rank] || 'bg-gray-100 text-gray-600'}`}>{emp.rank}</span>
                          : '-'}
                      </td>
                      <td className="table-td">{formatRM(emp.daily_rate)}</td>
                      <td className="table-td text-gray-500">
                        {emp.bank_name && <span className="text-xs text-gray-400 mr-1">{emp.bank_name}</span>}
                        {maskAccount(emp.bank_account)}
                      </td>
                      <td className="table-td">
                        <div className="text-gray-600 text-sm">{emp.passport_no || '-'}</div>
                        {emp.passport_doc_url && (
                          <a href={emp.passport_doc_url} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-blue-500 hover:underline">
                            {isPdf(emp.passport_doc_url) ? '📄 View PDF' : '🖼 View Photo'}
                          </a>
                        )}
                      </td>
                      <td className="table-td">
                        <div className="text-gray-600 text-sm">{emp.permit_no || '-'}</div>
                        {emp.permit_doc_url && (
                          <a href={emp.permit_doc_url} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-blue-500 hover:underline">
                            {isPdf(emp.permit_doc_url) ? '📄 View PDF' : '🖼 View Photo'}
                          </a>
                        )}
                      </td>
                      <td className={`table-td ${permit.cls}`}>{permit.label}</td>
                      <td className="table-td">{emp.phone || '-'}</td>
                      <td className="table-td">
                        <span className={`badge ${emp.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {emp.status}
                        </span>
                      </td>
                      <td className="table-td">
                        <div className="flex gap-1.5">
                          <button className="btn btn-outline btn-sm" onClick={() => openEdit(emp)}>Edit</button>
                          <button
                            className={`btn btn-sm ${emp.status === 'active' ? 'btn-warning' : 'btn-success'}`}
                            onClick={() => toggleStatus(emp)}>
                            {emp.status === 'active' ? 'Deactivate' : 'Activate'}
                          </button>
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

      {/* ── Add / Edit Modal ── */}
      <Modal open={showModal} onClose={() => setShowModal(false)}
        title={editId ? 'Edit Employee' : 'Add Employee'} maxWidth="max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Basic Info */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Basic Info</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="form-label">Full Name *</label>
                <input className="form-control" required value={form.full_name}
                  onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                  placeholder="Full name as per IC/passport" />
              </div>
              <div>
                <label className="form-label">Phone</label>
                <input className="form-control" value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="e.g. 01X-XXXXXXX" />
              </div>
            </div>
          </div>

          {/* Rank & Rate */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Rank & Rate</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="form-label">Rank *</label>
                <select className="form-control" required value={form.rank}
                  onChange={e => handleRankChange(e.target.value)}>
                  <option value="">Select rank…</option>
                  {RANKS.map(r => (
                    <option key={r} value={r}>{r} — RM {RANK_RATES[r]}/day</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">Daily Rate (RM)</label>
                <input className="form-control bg-gray-50 cursor-not-allowed" type="number" readOnly
                  value={form.daily_rate} tabIndex={-1} />
                <p className="text-xs text-gray-400 mt-1">Auto-filled from rank — not editable</p>
              </div>
            </div>
          </div>

          {/* Passport & Permit */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Passport & Permit</h3>

            {/* Passport */}
            <div className="rounded-lg border border-gray-200 p-4 mb-3">
              <p className="text-xs font-semibold text-gray-600 mb-3">🛂 Passport</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
                <div>
                  <label className="form-label">Passport No</label>
                  <input className="form-control" value={form.passport_no}
                    onChange={e => setForm(f => ({ ...f, passport_no: e.target.value }))}
                    placeholder="Passport number" />
                </div>
                <div className="flex flex-col justify-end">
                  <UploadButton
                    empId={editId}
                    docType="passport"
                    currentUrl={form.passport_doc_url}
                    onUploaded={url => setForm(f => ({ ...f, passport_doc_url: url }))}
                  />
                  <p className="text-xs text-gray-400 mt-1">JPG, PNG, HEIC or PDF · max 10 MB</p>
                </div>
              </div>
              {form.passport_doc_url && (
                <DocPreview url={form.passport_doc_url} label="Passport" />
              )}
            </div>

            {/* Permit */}
            <div className="rounded-lg border border-gray-200 p-4">
              <p className="text-xs font-semibold text-gray-600 mb-3">📋 Work Permit</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-3">
                <div>
                  <label className="form-label">Permit No</label>
                  <input className="form-control" value={form.permit_no}
                    onChange={e => setForm(f => ({ ...f, permit_no: e.target.value }))}
                    placeholder="Work permit no." />
                </div>
                <div>
                  <label className="form-label">Expiry Date</label>
                  <input type="date" className="form-control" value={form.permit_expire}
                    onChange={e => setForm(f => ({ ...f, permit_expire: e.target.value }))} />
                </div>
                <div className="flex flex-col justify-end">
                  <UploadButton
                    empId={editId}
                    docType="permit"
                    currentUrl={form.permit_doc_url}
                    onUploaded={url => setForm(f => ({ ...f, permit_doc_url: url }))}
                  />
                  <p className="text-xs text-gray-400 mt-1">JPG, PNG, HEIC or PDF · max 10 MB</p>
                </div>
              </div>
              {/* Expiry warning preview */}
              {form.permit_expire && (() => {
                const days = Math.floor((new Date(form.permit_expire).getTime() - Date.now()) / 86400000);
                if (days < 0)
                  return <p className="text-xs font-semibold text-danger">⚠️ Permit already expired ({Math.abs(days)} days ago)</p>;
                if (days <= 60)
                  return <p className="text-xs font-semibold text-warn">⚠️ Expires in {days} day{days !== 1 ? 's' : ''} — renewal needed</p>;
                return <p className="text-xs text-green-600">✅ Valid for {days} days</p>;
              })()}
              {form.permit_doc_url && (
                <div className="mt-2">
                  <DocPreview url={form.permit_doc_url} label="Work Permit" />
                </div>
              )}
            </div>
          </div>

          {/* Bank */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Bank Account</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="form-label">Bank Name</label>
                <select className="form-control" value={form.bank_name}
                  onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))}>
                  <option value="">Select bank…</option>
                  {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Account Number</label>
                <input className="form-control" value={form.bank_account}
                  onChange={e => setForm(f => ({ ...f, bank_account: e.target.value }))}
                  placeholder="Bank account number" />
              </div>
            </div>
          </div>

          {/* Status (edit only) */}
          {editId && (
            <div>
              <label className="form-label">Status</label>
              <select className="form-control" value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          )}

          {!editId && (
            <div className="rounded bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-700">
              💡 Save the employee first, then re-open to upload passport / permit documents.
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving} className="btn btn-primary">
              {saving ? 'Saving…' : editId ? 'Save Changes' : 'Add Employee'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
              Cancel
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
