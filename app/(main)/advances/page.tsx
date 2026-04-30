'use client';
import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import Modal from '@/components/Modal';
import { formatRM, getCurrentMonth } from '@/lib/utils';
import { useRole } from '@/lib/role-context';
import { useRouter } from 'next/navigation';

interface Advance {
  id: string; employee_id: string; advance_date: string | null; amount: number;
  month: string; notes: string | null; detail_type: string | null; pay_by: string | null;
  bank_name: string | null; account_name: string | null; account_no: string | null;
  bank_slip_url: string | null;
  employees: { full_name: string; bank_name: string | null; bank_account: string | null } | null;
}
interface Employee {
  id: string; full_name: string; status: string;
  bank_name: string | null; bank_account: string | null;
}

const today = () => {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
};

const EMPTY_ADV_FORM = {
  advance_date: today(),
  month: getCurrentMonth(),
  amount: '',
  detail_type: 'makan' as 'makan' | 'pinjam' | 'other',
  detail_note: '',
  pay_by: 'cash' as 'cash' | 'transfer',
  bank_name: '', account_name: '', account_no: '', bank_slip_url: '',
  bank_search_id: '',
};

const EMPTY_EDIT_FORM = {
  amount: '', advance_date: '', detail_type: '', notes: '', pay_by: 'cash',
};

export default function AdvancesPage() {
  const { role, loaded } = useRole();
  const router = useRouter();

  const [advances,     setAdvances]     = useState<Advance[]>([]);
  const [empList,      setEmpList]       = useState<Employee[]>([]);
  const [loading,      setLoading]       = useState(true);
  const [alertMsg,     setAlertMsg]      = useState('');
  const [alertType,    setAlertType]     = useState<'success' | 'danger'>('success');
  const [filterMonth,  setFilterMonth]   = useState(getCurrentMonth());
  const [filterEmp,    setFilterEmp]     = useState('');

  // Add modal
  const [showAddModal,    setShowAddModal]    = useState(false);
  const [addForm,         setAddForm]         = useState({ ...EMPTY_ADV_FORM });
  const [addSelectedIds,  setAddSelectedIds]  = useState<Set<string>>(new Set());
  const [addEmpSearch,    setAddEmpSearch]    = useState('');
  const [addSaving,       setAddSaving]       = useState(false);
  const [slipUploading,   setSlipUploading]   = useState(false);
  const slipRef = useRef<HTMLInputElement>(null);

  // Edit modal
  const [editId,      setEditId]      = useState<string | null>(null);
  const [editForm,    setEditForm]    = useState({ ...EMPTY_EDIT_FORM });
  const [editSaving,  setEditSaving]  = useState(false);

  const isManager = loaded && (role === 'admin' || role === 'owner');

  function showAlert(msg: string, type: 'success' | 'danger' = 'success') {
    setAlertMsg(msg); setAlertType(type);
    setTimeout(() => setAlertMsg(''), 4000);
  }

  const loadData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterMonth) params.set('month', filterMonth);
    if (filterEmp)   params.set('employee_id', filterEmp);
    const [advRes, empRes] = await Promise.all([
      fetch(`/api/advances?${params}`).then(r => r.json()),
      fetch('/api/employees').then(r => r.json()),
    ]);
    setAdvances(Array.isArray(advRes) ? advRes : []);
    setEmpList(Array.isArray(empRes) ? empRes.filter((e: Employee) => e.status === 'active') : []);
    setLoading(false);
  }, [filterMonth, filterEmp]);

  useEffect(() => { loadData(); }, [loadData]);

  const total = useMemo(() =>
    advances.reduce((s, a) => s + Number(a.amount || 0), 0),
    [advances]
  );

  function openAdd() {
    setAddForm({ ...EMPTY_ADV_FORM, advance_date: today(), month: filterMonth || getCurrentMonth() });
    setAddSelectedIds(new Set());
    setAddEmpSearch('');
    setShowAddModal(true);
  }

  async function uploadSlip(file: File) {
    setSlipUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', 'bank_slip');
      const firstId = Array.from(addSelectedIds)[0];
      if (firstId) fd.append('employee_id', firstId);
      const res  = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok && data.url) setAddForm(f => ({ ...f, bank_slip_url: data.url }));
      else showAlert(data.error || 'Upload failed.', 'danger');
    } finally {
      setSlipUploading(false);
      if (slipRef.current) slipRef.current.value = '';
    }
  }

  async function handleAddAdvance(e: React.FormEvent) {
    e.preventDefault();
    if (addSelectedIds.size === 0) { showAlert('Select at least one employee.', 'danger'); return; }
    if (!addForm.amount || Number(addForm.amount) <= 0) { showAlert('Enter a valid amount.', 'danger'); return; }
    setAddSaving(true);
    try {
      const notes = addForm.detail_type === 'other' ? addForm.detail_note.trim() : addForm.detail_type;
      const res = await fetch('/api/advances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_ids:  Array.from(addSelectedIds),
          advance_date:  addForm.advance_date || null,
          month:         addForm.month,
          amount:        Number(addForm.amount),
          notes,
          detail_type:   addForm.detail_type,
          pay_by:        addForm.pay_by,
          bank_name:     addForm.bank_name     || null,
          account_name:  addForm.account_name  || null,
          account_no:    addForm.account_no    || null,
          bank_slip_url: addForm.bank_slip_url || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { showAlert(data.error || 'Failed.', 'danger'); return; }
      const count = data.inserted?.length || 0;
      showAlert(`Advance recorded for ${count} employee${count !== 1 ? 's' : ''}.`);
      setShowAddModal(false);
      loadData();
    } finally { setAddSaving(false); }
  }

  function openEdit(adv: Advance) {
    setEditId(adv.id);
    setEditForm({
      amount:       String(adv.amount),
      advance_date: adv.advance_date || '',
      detail_type:  adv.detail_type  || 'makan',
      notes:        adv.notes        || '',
      pay_by:       adv.pay_by       || 'cash',
    });
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editId) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/advances/${editId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount:       Number(editForm.amount),
          advance_date: editForm.advance_date || null,
          detail_type:  editForm.detail_type,
          notes:        editForm.notes || null,
          pay_by:       editForm.pay_by,
        }),
      });
      const data = await res.json();
      if (!res.ok) { showAlert(data.error || 'Failed.', 'danger'); return; }
      showAlert('Advance updated.');
      setEditId(null);
      loadData();
    } finally { setEditSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this advance record? This cannot be undone.')) return;
    const res = await fetch(`/api/advances/${id}`, { method: 'DELETE' });
    if (res.ok) { showAlert('Advance deleted.'); loadData(); }
    else { const d = await res.json(); showAlert(d.error || 'Failed.', 'danger'); }
  }

  function formatDate(d: string | null) {
    if (!d) return '—';
    return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  if (!loaded) return <div className="p-8 text-center text-gray-400">Loading…</div>;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-primary">Advances</h1>
        {isManager && (
          <button className="btn btn-primary" onClick={openAdd}>+ Add Advance</button>
        )}
      </div>

      {alertMsg && <div className={`alert alert-${alertType}`}>{alertMsg}</div>}

      {/* Filter bar */}
      <div className="card p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div>
            <label className="form-label">Month</label>
            <input type="month" className="form-control" value={filterMonth}
              onChange={e => setFilterMonth(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Employee</label>
            <select className="form-control" value={filterEmp} onChange={e => setFilterEmp(e.target.value)}>
              <option value="">All Employees</option>
              {empList.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
            </select>
          </div>
          <div>
            <button className="btn btn-outline w-full" onClick={loadData}>Refresh</button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-bg flex items-center justify-between">
          <span className="text-sm font-semibold text-primary">
            {advances.length} advance{advances.length !== 1 ? 's' : ''}
          </span>
          {advances.length > 0 && (
            <span className="text-sm font-semibold text-danger">
              Total: {formatRM(total)}
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center text-gray-400">Loading…</div>
          ) : advances.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No advances found for the selected filters.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="table-th">Employee</th>
                  <th className="table-th">Date</th>
                  <th className="table-th">Type</th>
                  <th className="table-th">Pay By</th>
                  <th className="table-th">Notes</th>
                  <th className="table-th text-right">Amount</th>
                  {isManager && <th className="table-th"></th>}
                </tr>
              </thead>
              <tbody>
                {advances.map(adv => (
                  <tr key={adv.id} className="table-tr">
                    <td className="table-td font-medium">
                      {adv.employees?.full_name || empList.find(e => e.id === adv.employee_id)?.full_name || '—'}
                    </td>
                    <td className="table-td whitespace-nowrap text-gray-500">{formatDate(adv.advance_date)}</td>
                    <td className="table-td">
                      <span className="badge bg-orange-100 text-orange-700 capitalize">
                        {adv.detail_type === 'makan' ? '🍱 Makan'
                          : adv.detail_type === 'pinjam' ? '💰 Pinjam'
                          : adv.detail_type ? `📝 ${adv.detail_type}` : '—'}
                      </span>
                    </td>
                    <td className="table-td capitalize">{adv.pay_by || 'cash'}</td>
                    <td className="table-td text-gray-500">{adv.notes || '—'}</td>
                    <td className="table-td text-right font-semibold text-danger">-{formatRM(Number(adv.amount))}</td>
                    {isManager && (
                      <td className="table-td">
                        <div className="flex gap-1 justify-end">
                          <button className="btn btn-outline btn-sm" onClick={() => openEdit(adv)}>✏️</button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDelete(adv.id)}>🗑</button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-red-50 font-bold">
                  <td className="table-td" colSpan={5}>TOTAL</td>
                  <td className="table-td text-right text-danger">-{formatRM(total)}</td>
                  {isManager && <td className="table-td" />}
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>

      {/* ── Add Advance Modal ── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-primary">+ Add Advance</h2>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>

            <form onSubmit={handleAddAdvance} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

              {/* Date + Deduct from Month */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Date *</label>
                  <input type="date" className="form-control" required
                    value={addForm.advance_date}
                    onChange={e => setAddForm(f => ({ ...f, advance_date: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Deduct from Month *</label>
                  <input type="month" className="form-control" required
                    value={addForm.month}
                    onChange={e => setAddForm(f => ({ ...f, month: e.target.value }))} />
                </div>
              </div>

              {/* Employee multi-select */}
              <div>
                <label className="form-label">
                  Staff *
                  <span className="ml-2 text-primary font-bold">{addSelectedIds.size} selected</span>
                </label>
                <input className="form-control mb-2" placeholder="Search staff…"
                  value={addEmpSearch} onChange={e => setAddEmpSearch(e.target.value)} />
                <div className="border border-gray-200 rounded-lg max-h-40 overflow-y-auto divide-y divide-gray-100">
                  {empList
                    .filter(emp => emp.full_name.toLowerCase().includes(addEmpSearch.toLowerCase()))
                    .map(emp => (
                      <label key={emp.id}
                        className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50 ${addSelectedIds.has(emp.id) ? 'bg-primary/5' : ''}`}>
                        <input type="checkbox"
                          checked={addSelectedIds.has(emp.id)}
                          onChange={e => {
                            const next = new Set(addSelectedIds);
                            e.target.checked ? next.add(emp.id) : next.delete(emp.id);
                            setAddSelectedIds(next);
                          }}
                          className="w-4 h-4 accent-primary" />
                        <span className="text-sm font-medium text-gray-800 flex-1">{emp.full_name}</span>
                        {emp.bank_name && <span className="text-xs text-gray-400">{emp.bank_name}</span>}
                      </label>
                    ))}
                  {empList.filter(e => e.full_name.toLowerCase().includes(addEmpSearch.toLowerCase())).length === 0 && (
                    <p className="p-4 text-center text-sm text-gray-400">No employees found.</p>
                  )}
                </div>
                <div className="flex gap-2 mt-1.5">
                  <button type="button" className="text-xs text-primary underline"
                    onClick={() => setAddSelectedIds(new Set(empList.map(e => e.id)))}>Select all</button>
                  <span className="text-gray-300">|</span>
                  <button type="button" className="text-xs text-gray-500 underline"
                    onClick={() => setAddSelectedIds(new Set())}>Clear</button>
                </div>
              </div>

              {/* Amount */}
              <div>
                <label className="form-label">Amount (RM) *</label>
                <input type="number" className="form-control" min="0.01" step="0.01" placeholder="0.00" required
                  value={addForm.amount}
                  onChange={e => setAddForm(f => ({ ...f, amount: e.target.value }))} />
              </div>

              {/* Detail type */}
              <div>
                <label className="form-label">Detail</label>
                <div className="grid grid-cols-3 gap-2">
                  {([['makan', '🍱', 'Makan'], ['pinjam', '💰', 'Pinjam'], ['other', '📝', 'Other']] as const).map(([val, icon, lbl]) => (
                    <label key={val} className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 cursor-pointer transition-colors
                      ${addForm.detail_type === val ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-gray-300'}`}>
                      <input type="radio" name="detail_type" value={val} className="sr-only"
                        checked={addForm.detail_type === val}
                        onChange={() => setAddForm(f => ({ ...f, detail_type: val }))} />
                      <span>{icon}</span>
                      <span className="text-sm font-semibold">{lbl}</span>
                    </label>
                  ))}
                </div>
                {addForm.detail_type === 'other' && (
                  <input className="form-control mt-2" placeholder="Describe reason…"
                    value={addForm.detail_note}
                    onChange={e => setAddForm(f => ({ ...f, detail_note: e.target.value }))} />
                )}
              </div>

              {/* Pay by */}
              <div>
                <label className="form-label">Pay By</label>
                <div className="grid grid-cols-2 gap-2">
                  {([['cash', '💵', 'Cash'], ['transfer', '🏦', 'Transfer']] as const).map(([val, icon, lbl]) => (
                    <label key={val} className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 cursor-pointer transition-colors
                      ${addForm.pay_by === val ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-gray-300'}`}>
                      <input type="radio" name="pay_by" value={val} className="sr-only"
                        checked={addForm.pay_by === val}
                        onChange={() => setAddForm(f => ({ ...f, pay_by: val }))} />
                      <span>{icon}</span>
                      <span className="text-sm font-semibold">{lbl}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Bank details — only if transfer */}
              {addForm.pay_by === 'transfer' && (
                <div className="rounded-xl border border-gray-200 p-4 space-y-3">
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">🏦 Bank Details</p>

                  {/* Auto-fill from staff */}
                  <div>
                    <label className="form-label text-xs">Load from staff profile</label>
                    <select className="form-control"
                      value={addForm.bank_search_id}
                      onChange={e => {
                        const emp = empList.find(x => x.id === e.target.value);
                        setAddForm(f => ({
                          ...f,
                          bank_search_id: e.target.value,
                          bank_name:    emp?.bank_name    || '',
                          account_name: emp?.full_name    || '',
                          account_no:   emp?.bank_account || '',
                        }));
                      }}>
                      <option value="">— Select staff to auto-fill —</option>
                      {empList.map(e => (
                        <option key={e.id} value={e.id}>
                          {e.full_name}{e.bank_name ? ` · ${e.bank_name}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="form-label text-xs">Bank Name</label>
                      <input className="form-control" placeholder="e.g. Maybank"
                        value={addForm.bank_name}
                        onChange={e => setAddForm(f => ({ ...f, bank_name: e.target.value, bank_search_id: '' }))} />
                    </div>
                    <div>
                      <label className="form-label text-xs">Account Name</label>
                      <input className="form-control" placeholder="Full name"
                        value={addForm.account_name}
                        onChange={e => setAddForm(f => ({ ...f, account_name: e.target.value, bank_search_id: '' }))} />
                    </div>
                    <div>
                      <label className="form-label text-xs">Account No.</label>
                      <input className="form-control" placeholder="1234567890"
                        value={addForm.account_no}
                        onChange={e => setAddForm(f => ({ ...f, account_no: e.target.value, bank_search_id: '' }))} />
                    </div>
                  </div>

                  {/* Bank slip upload */}
                  <div>
                    <label className="form-label text-xs">Bank Slip <span className="text-gray-400 font-normal">(PDF or photo)</span></label>
                    <input ref={slipRef} type="file" accept="image/*,.pdf" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) uploadSlip(f); }} />
                    <div className="flex items-center gap-3">
                      <button type="button" disabled={slipUploading}
                        onClick={() => slipRef.current?.click()}
                        className={`btn btn-sm ${addForm.bank_slip_url ? 'btn-outline' : 'btn-primary'}`}>
                        {slipUploading ? '⏳ Uploading…' : addForm.bank_slip_url ? '↻ Replace Slip' : '📎 Upload Slip'}
                      </button>
                      {addForm.bank_slip_url && (
                        <a href={addForm.bank_slip_url} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline">
                          ✅ View uploaded slip →
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </form>

            <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
              <button type="button" disabled={addSaving || slipUploading}
                onClick={handleAddAdvance}
                className="btn btn-primary flex-1">
                {addSaving ? 'Saving…' : `Record Advance${addSelectedIds.size > 1 ? ` (${addSelectedIds.size})` : ''}`}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Advance Modal ── */}
      <Modal open={!!editId} onClose={() => setEditId(null)} title="Edit Advance">
        <form onSubmit={handleEdit} className="space-y-4">
          <div>
            <label className="form-label">Amount (RM) *</label>
            <input type="number" min="0.01" step="0.01" required className="form-control"
              value={editForm.amount}
              onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">Date</label>
            <input type="date" className="form-control"
              value={editForm.advance_date}
              onChange={e => setEditForm(f => ({ ...f, advance_date: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">Type</label>
            <select className="form-control" value={editForm.detail_type}
              onChange={e => setEditForm(f => ({ ...f, detail_type: e.target.value }))}>
              {['makan','pinjam','petrol','permit','flight','medical','accommodation','equipment','other'].map(t => (
                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">Notes</label>
            <input className="form-control" placeholder="Optional remark"
              value={editForm.notes}
              onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">Pay By</label>
            <select className="form-control" value={editForm.pay_by}
              onChange={e => setEditForm(f => ({ ...f, pay_by: e.target.value }))}>
              <option value="cash">Cash</option>
              <option value="transfer">Bank Transfer</option>
            </select>
          </div>
          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={editSaving} className="btn btn-primary">
              {editSaving ? 'Saving…' : 'Save Changes'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setEditId(null)}>Cancel</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
