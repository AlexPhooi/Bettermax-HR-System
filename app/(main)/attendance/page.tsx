'use client';
import { useEffect, useState, useMemo, useCallback } from 'react';
import Modal from '@/components/Modal';
import { formatDate, formatTime, getCurrentMonth, calcHoursAndDays } from '@/lib/utils';
import { useRole } from '@/lib/role-context';

interface AttRecord {
  id: string;
  employee_id: string;
  project_id: string | null;
  work_date: string;
  clock_in: string;
  clock_out: string;
  hours_worked: number;
  days_worked: number;
  notes: string | null;
  is_rework: boolean;
  status: string;
  site_clean: boolean;
  site_bonus: number;
  employees: { full_name: string; daily_rate: number } | null;
  projects: { name: string; code: string | null } | null;
}

interface Employee { id: string; full_name: string; status: string; }
interface Project  { id: string; name: string; code: string | null; status: string; }
interface OTPreview { hours: number; days: number; lunchDeducted: boolean; }

function calcOT(date: string, inT: string, outT: string): OTPreview | null {
  if (!date || !inT || !outT) return null;
  return calcHoursAndDays(date, inT, outT);
}

const today = () => new Date().toISOString().split('T')[0];
const EMPTY_ADD  = { project_id: '', work_date: today(), clock_in: '08:00', clock_out: '17:00', notes: '', site_clean: false };
const EMPTY_EDIT = { employee_id: '', project_id: '', work_date: today(), clock_in: '08:00', clock_out: '17:00', notes: '' };

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    pending:  'bg-yellow-100 text-yellow-700',
    approved: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
  };
  const icons: Record<string, string> = { pending: '🟡', approved: '✅', rejected: '❌' };
  return (
    <span className={`badge text-xs ${cfg[status] || 'bg-gray-100 text-gray-500'}`}>
      {icons[status]} {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export default function AttendancePage() {
  const { role } = useRole();
  const isAdmin  = role === 'admin' || role === 'owner';
  const canSubmit = role === 'admin' || role === 'owner' || role === 'leader';

  const [records, setRecords]     = useState<AttRecord[]>([]);
  const [empList, setEmpList]     = useState<Employee[]>([]);
  const [projList, setProjList]   = useState<Project[]>([]);
  const [loading, setLoading]     = useState(true);
  const [alertMsg, setAlertMsg]   = useState('');
  const [alertType, setAlertType] = useState<'success' | 'danger' | 'info'>('success');

  const [filterMonth, setFilterMonth]     = useState(getCurrentMonth());
  const [filterEmp, setFilterEmp]         = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [filterStatus, setFilterStatus]   = useState('');

  const [showAddModal, setShowAddModal]   = useState(false);
  const [addForm, setAddForm]             = useState({ ...EMPTY_ADD });
  const [checkedIds, setCheckedIds]       = useState<Set<string>>(new Set());
  const [empSearch, setEmpSearch]         = useState('');
  const [addSaving, setAddSaving]         = useState(false);
  const [autoLoading, setAutoLoading]     = useState(false);
  const [autoSelectedCount, setAutoSelectedCount] = useState<number | null>(null);
  const [autoFromDaysAgo, setAutoFromDaysAgo]     = useState<number>(1);

  const [showEditModal, setShowEditModal] = useState(false);
  const [editId, setEditId]               = useState<string | null>(null);
  const [editForm, setEditForm]           = useState({ ...EMPTY_EDIT });
  const [editSaving, setEditSaving]       = useState(false);

  const [approving, setApproving] = useState<string | null>(null);

  function showAlert(msg: string, type: 'success' | 'danger' | 'info' = 'success') {
    setAlertMsg(msg); setAlertType(type);
    setTimeout(() => setAlertMsg(''), 5000);
  }

  const loadData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterMonth)   params.set('month',       filterMonth);
    if (filterEmp)     params.set('employee_id', filterEmp);
    if (filterProject) params.set('project_id',  filterProject);
    const [recRes, empRes, projRes] = await Promise.all([
      fetch(`/api/attendance?${params}`).then(r => r.json()),
      fetch('/api/employees').then(r => r.json()),
      fetch('/api/projects').then(r => r.json()),
    ]);
    setRecords(Array.isArray(recRes) ? recRes : []);
    setEmpList(Array.isArray(empRes) ? empRes.filter((e: Employee) => e.status === 'active') : []);
    setProjList(Array.isArray(projRes) ? projRes : []);
    setLoading(false);
  }, [filterMonth, filterEmp, filterProject]);

  useEffect(() => { loadData(); }, [loadData]);

  // Auto-select employees from previous working day
  useEffect(() => {
    if (!showAddModal || empList.length === 0) return;

    async function fetchForDaysAgo(daysAgo: number): Promise<Set<string>> {
      const d = new Date(addForm.work_date + 'T00:00:00');
      d.setDate(d.getDate() - daysAgo);
      const dateStr = d.toISOString().split('T')[0];
      const res  = await fetch(`/api/attendance?date=${dateStr}`);
      const data = await res.json();
      if (!Array.isArray(data)) return new Set();
      const activeIds = new Set(empList.map((e: Employee) => e.id));
      return new Set<string>(data.map((r: { employee_id: string }) => r.employee_id).filter((id: string) => activeIds.has(id)));
    }

    async function run() {
      setAutoLoading(true);
      setAutoSelectedCount(null);
      try {
        let ids = await fetchForDaysAgo(1);
        let daysAgo = 1;
        if (ids.size === 0) { ids = await fetchForDaysAgo(2); daysAgo = 2; }
        setCheckedIds(ids);
        setAutoSelectedCount(ids.size);
        setAutoFromDaysAgo(daysAgo);
      } finally { setAutoLoading(false); }
    }
    run();
  }, [showAddModal, addForm.work_date, empList]);

  const addOT  = useMemo(() => calcOT(addForm.work_date,  addForm.clock_in,  addForm.clock_out),  [addForm.work_date, addForm.clock_in, addForm.clock_out]);
  const editOT = useMemo(() => calcOT(editForm.work_date, editForm.clock_in, editForm.clock_out), [editForm.work_date, editForm.clock_in, editForm.clock_out]);

  const selectedAddProject = useMemo(() => projList.find(p => p.id === addForm.project_id) || null, [projList, addForm.project_id]);
  const isAddRework = selectedAddProject?.status === 'completed';

  const filteredEmps = useMemo(() =>
    empList.filter(e => !empSearch || e.full_name.toLowerCase().includes(empSearch.toLowerCase())),
    [empList, empSearch]
  );

  function toggleEmp(id: string) {
    setCheckedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    if (checkedIds.size === filteredEmps.length && filteredEmps.length > 0) setCheckedIds(new Set());
    else setCheckedIds(new Set(filteredEmps.map(e => e.id)));
  }

  function openAdd() {
    setAddForm({ ...EMPTY_ADD });
    setCheckedIds(new Set());
    setEmpSearch('');
    setAutoSelectedCount(null);
    setAutoFromDaysAgo(1);
    setShowAddModal(true);
  }

  async function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (checkedIds.size === 0) { showAlert('Select at least one employee.', 'danger'); return; }
    if (isAddRework && !addForm.notes.trim()) {
      showAlert('Rework remark is required for completed projects.', 'danger'); return;
    }
    setAddSaving(true);
    try {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...addForm, employee_ids: Array.from(checkedIds) }),
      });
      const data = await res.json();
      if (!res.ok) { showAlert(data.error, 'danger'); return; }
      const saved   = data.inserted?.length || 0;
      const skipped = data.skipped?.length  || 0;
      const msg = skipped
        ? `${saved} record${saved !== 1 ? 's' : ''} saved${isAddRework ? ' (Rework)' : ''}, ${skipped} skipped (duplicate).`
        : `${saved} record${saved !== 1 ? 's' : ''} submitted${isAddRework ? ' as Rework' : ''} — pending boss approval.`;
      showAlert(msg, skipped ? 'info' : 'success');
      setShowAddModal(false);
      loadData();
    } finally { setAddSaving(false); }
  }

  function openEdit(rec: AttRecord) {
    setEditId(rec.id);
    setEditForm({
      employee_id: rec.employee_id,
      project_id:  rec.project_id || '',
      work_date:   rec.work_date,
      clock_in:    rec.clock_in  ? new Date(rec.clock_in).toLocaleTimeString('en-MY',  { hour: '2-digit', minute: '2-digit', hour12: false }) : '',
      clock_out:   rec.clock_out ? new Date(rec.clock_out).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit', hour12: false }) : '',
      notes:       rec.notes || '',
    });
    setShowEditModal(true);
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editId) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/attendance/${editId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (!res.ok) { showAlert(data.error, 'danger'); return; }
      showAlert('Record updated.');
      setShowEditModal(false);
      loadData();
    } finally { setEditSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this attendance record?')) return;
    const res = await fetch(`/api/attendance/${id}`, { method: 'DELETE' });
    if (res.ok) { showAlert('Record deleted.'); loadData(); }
    else { const d = await res.json(); showAlert(d.error, 'danger'); }
  }

  async function handleApprove(id: string, status: 'approved' | 'rejected') {
    setApproving(id + status);
    try {
      const res = await fetch(`/api/attendance/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) { const d = await res.json(); showAlert(d.error, 'danger'); return; }
      showAlert(status === 'approved' ? 'Attendance approved ✅' : 'Attendance rejected ❌', status === 'approved' ? 'success' : 'info');
      loadData();
    } finally { setApproving(null); }
  }

  function OTBox({ ot }: { ot: OTPreview | null }) {
    if (!ot) return null;
    const isOT = ot.hours > 8;
    return (
      <div className={`rounded p-3 text-sm mt-2 ${isOT ? 'bg-orange-50 border border-orange-200' : 'bg-blue-50 border border-blue-200'}`}>
        <div className="flex flex-wrap gap-4">
          <span><strong>Hours:</strong> {ot.hours}h</span>
          <span><strong>Days:</strong> {ot.days.toFixed(4)}</span>
          {ot.lunchDeducted && <span className="text-gray-500">(–1h lunch deducted)</span>}
          {isOT && <span className="text-warn font-semibold">OT: +{(ot.hours - 8).toFixed(2)}h</span>}
        </div>
      </div>
    );
  }

  const allFilteredSelected = filteredEmps.length > 0 && filteredEmps.every(e => checkedIds.has(e.id));
  const activeProjects    = projList.filter(p => p.status === 'active');
  const completedProjects = projList.filter(p => p.status === 'completed');

  const pendingRecords  = records.filter(r => r.status === 'pending');
  const otherRecords    = records.filter(r => r.status !== 'pending');
  const displayRecords  = filterStatus ? records.filter(r => r.status === filterStatus) : otherRecords;

  // Site bonus preview for add form
  const addSiteBonus = addForm.site_clean && addOT && addOT.hours >= 8;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-primary">Attendance</h1>
        {canSubmit && (
          <button className="btn btn-primary" onClick={openAdd}>+ Record Attendance</button>
        )}
      </div>

      {alertMsg && <div className={`alert alert-${alertType}`}>{alertMsg}</div>}

      {/* ── Pending Approvals (admin only) ── */}
      {isAdmin && pendingRecords.length > 0 && (
        <div className="card p-0 overflow-hidden mb-6 border-l-4 border-yellow-400">
          <div className="px-6 py-4 border-b border-bg bg-yellow-50 flex items-center gap-3">
            <span className="text-lg">🟡</span>
            <span className="font-semibold text-yellow-800">
              {pendingRecords.length} Pending Approval{pendingRecords.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-th">Date</th>
                  <th className="table-th">Employee</th>
                  <th className="table-th">Project</th>
                  <th className="table-th">Hours</th>
                  <th className="table-th">Site Clean</th>
                  <th className="table-th">Bonus</th>
                  <th className="table-th">Notes</th>
                  <th className="table-th">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingRecords.map(rec => (
                  <tr key={rec.id} className="table-tr bg-yellow-50/40">
                    <td className="table-td whitespace-nowrap">{formatDate(rec.work_date)}</td>
                    <td className="table-td font-medium">{rec.employees?.full_name || '-'}</td>
                    <td className="table-td">
                      {rec.projects
                        ? <span className="badge bg-blue-100 text-blue-700">{rec.projects.code || rec.projects.name}</span>
                        : <span className="text-gray-400">-</span>}
                      {rec.is_rework && <span className="badge bg-orange-100 text-orange-700 text-xs ml-1">🔄 Rework</span>}
                    </td>
                    <td className="table-td">
                      <span className={Number(rec.hours_worked) > 8 ? 'text-warn font-semibold' : ''}>
                        {Number(rec.hours_worked).toFixed(2)}h
                      </span>
                    </td>
                    <td className="table-td text-center">
                      {rec.site_clean ? <span className="text-green-600 font-semibold">✅ Yes</span> : <span className="text-gray-400">No</span>}
                    </td>
                    <td className="table-td">
                      {Number(rec.site_bonus) > 0
                        ? <span className="badge bg-green-100 text-green-700">+RM{Number(rec.site_bonus).toFixed(2)}</span>
                        : <span className="text-gray-400">-</span>}
                    </td>
                    <td className="table-td text-gray-500 max-w-[120px]">
                      <span className="truncate block">{rec.notes || '-'}</span>
                    </td>
                    <td className="table-td">
                      <div className="flex gap-1.5">
                        <button
                          className="btn btn-sm bg-green-500 hover:bg-green-600 text-white"
                          disabled={approving !== null}
                          onClick={() => handleApprove(rec.id, 'approved')}>
                          {approving === rec.id + 'approved' ? '…' : '✓ Approve'}
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          disabled={approving !== null}
                          onClick={() => handleApprove(rec.id, 'rejected')}>
                          {approving === rec.id + 'rejected' ? '…' : '✗ Reject'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card mb-4 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div>
            <label className="form-label">Month</label>
            <input type="month" className="form-control" value={filterMonth}
              onChange={e => setFilterMonth(e.target.value)} />
          </div>
          {isAdmin && (
            <div>
              <label className="form-label">Employee</label>
              <select className="form-control" value={filterEmp} onChange={e => setFilterEmp(e.target.value)}>
                <option value="">All Employees</option>
                {empList.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="form-label">Project</label>
            <select className="form-control" value={filterProject} onChange={e => setFilterProject(e.target.value)}>
              <option value="">All Projects</option>
              {activeProjects.length > 0 && (
                <optgroup label="Active">
                  {activeProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </optgroup>
              )}
              {completedProjects.length > 0 && (
                <optgroup label="Completed">
                  {completedProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </optgroup>
              )}
            </select>
          </div>
          <div>
            <label className="form-label">Status</label>
            <select className="form-control" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">All (excl. pending)</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="pending">Pending</option>
            </select>
          </div>
          <div>
            <button className="btn btn-outline w-full" onClick={loadData}>Refresh</button>
          </div>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-bg">
          <span className="text-sm font-semibold text-primary">
            {displayRecords.length} record{displayRecords.length !== 1 ? 's' : ''}
            {!filterStatus && pendingRecords.length > 0 && (
              <span className="ml-2 text-yellow-600 text-xs">(+ {pendingRecords.length} pending above)</span>
            )}
          </span>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center text-gray-400">Loading…</div>
          ) : displayRecords.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No attendance records found.</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-th">Date</th>
                  <th className="table-th">Employee</th>
                  <th className="table-th">Project</th>
                  <th className="table-th">Hours</th>
                  <th className="table-th">Days</th>
                  {isAdmin && <th className="table-th">Site Bonus</th>}
                  <th className="table-th">Status</th>
                  <th className="table-th">Notes</th>
                  {isAdmin && <th className="table-th">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {displayRecords.map(rec => (
                  <tr key={rec.id} className={`table-tr ${rec.is_rework ? 'bg-orange-50' : ''}`}>
                    <td className="table-td whitespace-nowrap">{formatDate(rec.work_date)}</td>
                    <td className="table-td font-medium">{rec.employees?.full_name || '-'}</td>
                    <td className="table-td">
                      <div className="flex flex-col gap-1">
                        {rec.projects
                          ? <span className="badge bg-blue-100 text-blue-700">{rec.projects.code || rec.projects.name}</span>
                          : <span className="text-gray-400">-</span>}
                        {rec.is_rework && (
                          <span className="badge bg-orange-100 text-orange-700 text-xs">🔄 Rework</span>
                        )}
                      </div>
                    </td>
                    <td className="table-td">
                      <span className={Number(rec.hours_worked) > 8 ? 'text-warn font-semibold' : ''}>
                        {Number(rec.hours_worked).toFixed(2)}h
                      </span>
                    </td>
                    <td className="table-td">{Number(rec.days_worked).toFixed(4)}</td>
                    {isAdmin && (
                      <td className="table-td">
                        {Number(rec.site_bonus) > 0
                          ? <span className="badge bg-green-100 text-green-700">+RM{Number(rec.site_bonus).toFixed(2)}</span>
                          : <span className="text-gray-400">-</span>}
                      </td>
                    )}
                    <td className="table-td"><StatusBadge status={rec.status || 'pending'} /></td>
                    <td className="table-td text-gray-500 max-w-[150px]">
                      {rec.is_rework && rec.notes
                        ? <span className="text-orange-700 font-medium">{rec.notes}</span>
                        : <span className="truncate block">{rec.notes || '-'}</span>}
                    </td>
                    {isAdmin && (
                      <td className="table-td">
                        <div className="flex gap-1.5">
                          <button className="btn btn-outline btn-sm" onClick={() => openEdit(rec)}>Edit</button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDelete(rec.id)}>Del</button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Add Modal ── */}
      <Modal open={showAddModal} onClose={() => setShowAddModal(false)}
        title="Record Attendance" maxWidth="max-w-2xl">
        <form onSubmit={handleAddSubmit} className="space-y-5">

          {/* Project */}
          <div>
            <label className="form-label">Project</label>
            <select className="form-control" value={addForm.project_id}
              onChange={e => setAddForm(f => ({ ...f, project_id: e.target.value, notes: '' }))}>
              <option value="">No project</option>
              {activeProjects.length > 0 && (
                <optgroup label="Active">
                  {activeProjects.map(p => <option key={p.id} value={p.id}>{p.name}{p.code ? ` (${p.code})` : ''}</option>)}
                </optgroup>
              )}
              {completedProjects.length > 0 && (
                <optgroup label="Completed — Rework">
                  {completedProjects.map(p => <option key={p.id} value={p.id}>{p.name}{p.code ? ` (${p.code})` : ''}</option>)}
                </optgroup>
              )}
            </select>
          </div>

          {/* Rework warning */}
          {isAddRework && (
            <div className="rounded-lg border border-orange-300 bg-orange-50 px-4 py-3 flex gap-3 items-start">
              <span className="text-2xl leading-none">🔄</span>
              <div>
                <p className="font-semibold text-orange-800 text-sm">This project is completed — attendance will be flagged as Rework</p>
                <p className="text-orange-700 text-xs mt-0.5">A rework remark is required before saving.</p>
              </div>
            </div>
          )}

          {/* Date / Time */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="form-label">Work Date *</label>
              <input type="date" className="form-control" required value={addForm.work_date}
                onChange={e => {
                  setAddForm(f => ({ ...f, work_date: e.target.value }));
                  setCheckedIds(new Set());
                  setAutoSelectedCount(null);
                  setAutoFromDaysAgo(1);
                }} />
            </div>
            <div>
              <label className="form-label">Clock In *</label>
              <input type="time" className="form-control" required value={addForm.clock_in}
                onChange={e => setAddForm(f => ({ ...f, clock_in: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Clock Out *</label>
              <input type="time" className="form-control" required value={addForm.clock_out}
                onChange={e => setAddForm(f => ({ ...f, clock_out: e.target.value }))} />
            </div>
          </div>

          <OTBox ot={addOT} />

          {/* Site Clean checkbox */}
          <div className={`rounded-lg border px-4 py-3 ${addSiteBonus ? 'bg-green-50 border-green-300' : 'bg-gray-50 border-gray-200'}`}>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 accent-green-600"
                checked={addForm.site_clean}
                onChange={e => setAddForm(f => ({ ...f, site_clean: e.target.checked }))} />
              <div>
                <span className="font-medium text-sm text-gray-800">🧹 Site was clean today</span>
                <p className="text-xs text-gray-500 mt-0.5">
                  Workers who worked ≥8h will each receive a Daily Site Bonus of <strong>RM10</strong>
                </p>
              </div>
            </label>
            {addSiteBonus && (
              <div className="mt-2 text-xs text-green-700 font-semibold">
                ✅ Site Bonus applies! RM10 × {checkedIds.size} worker{checkedIds.size !== 1 ? 's' : ''} = RM{(checkedIds.size * 10).toFixed(2)}
              </div>
            )}
            {addForm.site_clean && addOT && addOT.hours < 8 && (
              <div className="mt-2 text-xs text-orange-600">
                ⚠️ Hours &lt; 8 — site bonus will not be applied
              </div>
            )}
          </div>

          {/* Notes / Rework remark */}
          <div>
            <label className="form-label">
              {isAddRework ? 'Rework Remark *' : 'Notes'}
            </label>
            <input
              className={`form-control ${isAddRework ? 'border-orange-400 focus:ring-orange-300' : ''}`}
              required={isAddRework}
              placeholder={isAddRework ? 'Describe the rework reason…' : 'Optional notes…'}
              value={addForm.notes}
              onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))} />
          </div>

          {/* Employee multi-select */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="form-label mb-0">
                Employees *{' '}
                {checkedIds.size > 0 && (
                  <span className="badge bg-primary text-white ml-1">{checkedIds.size} selected</span>
                )}
              </label>
              <button type="button" className="text-xs text-primary underline" onClick={toggleAll}>
                {allFilteredSelected ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            {autoLoading && (
              <div className="mb-2 rounded bg-gray-50 border border-gray-200 px-3 py-2 text-xs text-gray-500 flex items-center gap-2">
                <span className="animate-spin inline-block">⏳</span> Loading yesterday&apos;s attendance…
              </div>
            )}
            {!autoLoading && autoSelectedCount !== null && (
              <div className={`mb-2 rounded border px-3 py-2 text-xs flex items-start gap-2
                ${autoSelectedCount > 0 ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>
                <span className="mt-0.5 shrink-0">{autoSelectedCount > 0 ? '📋' : 'ℹ️'}</span>
                <span>
                  {autoSelectedCount > 0
                    ? <><strong>{autoSelectedCount} employee{autoSelectedCount !== 1 ? 's' : ''}</strong> auto-selected
                        from {autoFromDaysAgo === 1 ? 'yesterday' : '2 days ago'}
                        {autoFromDaysAgo === 2 ? ' (no attendance yesterday)' : ''}.
                        {' '}Untick anyone who&apos;s off today.</>
                    : <>No attendance found in the last 2 days — select employees manually.</>}
                </span>
              </div>
            )}

            <input className="form-control mb-2" placeholder="Search employee…" value={empSearch}
              onChange={e => setEmpSearch(e.target.value)} />
            <div className="border border-gray-200 rounded max-h-52 overflow-y-auto">
              {filteredEmps.length === 0 ? (
                <p className="text-sm text-gray-400 p-3">No employees found.</p>
              ) : filteredEmps.map(emp => (
                <label key={emp.id}
                  className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50 border-b border-gray-50 last:border-0 transition-colors ${checkedIds.has(emp.id) ? 'bg-blue-50' : ''}`}>
                  <input type="checkbox" className="accent-primary"
                    checked={checkedIds.has(emp.id)} onChange={() => toggleEmp(emp.id)} />
                  <span className="text-sm">{emp.full_name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={addSaving}
              className={`btn ${isAddRework ? 'bg-orange-500 hover:bg-orange-600 text-white' : 'btn-primary'}`}>
              {addSaving ? 'Saving…' : isAddRework ? '🔄 Submit as Rework' : '📤 Submit for Approval'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Edit Modal (admin only) ── */}
      {isAdmin && (
        <Modal open={showEditModal} onClose={() => setShowEditModal(false)}
          title="Edit Attendance Record" maxWidth="max-w-lg">
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div>
              <label className="form-label">Employee *</label>
              <select className="form-control" required value={editForm.employee_id}
                onChange={e => setEditForm(f => ({ ...f, employee_id: e.target.value }))}>
                <option value="">Select employee…</option>
                {empList.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Project</label>
              <select className="form-control" value={editForm.project_id}
                onChange={e => setEditForm(f => ({ ...f, project_id: e.target.value }))}>
                <option value="">No project</option>
                {activeProjects.length > 0 && (
                  <optgroup label="Active">
                    {activeProjects.map(p => <option key={p.id} value={p.id}>{p.name}{p.code ? ` (${p.code})` : ''}</option>)}
                  </optgroup>
                )}
                {completedProjects.length > 0 && (
                  <optgroup label="Completed">
                    {completedProjects.map(p => <option key={p.id} value={p.id}>{p.name}{p.code ? ` (${p.code})` : ''}</option>)}
                  </optgroup>
                )}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="form-label">Work Date *</label>
                <input type="date" className="form-control" required value={editForm.work_date}
                  onChange={e => setEditForm(f => ({ ...f, work_date: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">Clock In *</label>
                <input type="time" className="form-control" required value={editForm.clock_in}
                  onChange={e => setEditForm(f => ({ ...f, clock_in: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">Clock Out *</label>
                <input type="time" className="form-control" required value={editForm.clock_out}
                  onChange={e => setEditForm(f => ({ ...f, clock_out: e.target.value }))} />
              </div>
            </div>
            <OTBox ot={editOT} />
            <div>
              <label className="form-label">Notes</label>
              <input className="form-control" value={editForm.notes}
                onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={editSaving} className="btn btn-primary">
                {editSaving ? 'Saving…' : 'Save Changes'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setShowEditModal(false)}>
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
