'use client';
import { useEffect, useState, useMemo, useCallback } from 'react';
import Modal from '@/components/Modal';
import { formatRM, formatDate, getCurrentMonth } from '@/lib/utils';

interface Advance {
  id: string;
  employee_id: string;
  advance_date: string;
  amount: number;
  month: string;
  notes: string | null;
  employees: { full_name: string } | null;
}

interface Employee { id: string; full_name: string; status: string; }

const EMPTY_FORM = {
  employee_id: '', advance_date: new Date().toISOString().split('T')[0],
  amount: '', month: getCurrentMonth(), notes: '',
};

export default function AdvancesPage() {
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [empList, setEmpList]   = useState<Employee[]>([]);
  const [loading, setLoading]   = useState(true);
  const [alertMsg, setAlertMsg]   = useState('');
  const [alertType, setAlertType] = useState<'success' | 'danger'>('success');
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [form, setForm]           = useState({ ...EMPTY_FORM });
  const [filterMonth, setFilterMonth] = useState(getCurrentMonth());
  const [filterEmp, setFilterEmp]     = useState('');

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
    setForm({
      ...EMPTY_FORM,
      advance_date: new Date().toISOString().split('T')[0],
      month: filterMonth || getCurrentMonth(),
    });
    setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/advances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, amount: Number(form.amount) }),
      });
      const data = await res.json();
      if (!res.ok) { showAlert(data.error, 'danger'); return; }
      showAlert('Advance recorded.');
      setShowModal(false);
      loadData();
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this advance record?')) return;
    const res = await fetch(`/api/advances/${id}`, { method: 'DELETE' });
    if (res.ok) { showAlert('Advance deleted.'); loadData(); }
    else { const d = await res.json(); showAlert(d.error, 'danger'); }
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-primary">Advances</h1>
        <button className="btn btn-primary" onClick={openAdd}>+ Add Advance</button>
      </div>

      {alertMsg && <div className={`alert alert-${alertType}`}>{alertMsg}</div>}

      {/* Filters */}
      <div className="card mb-4 p-4">
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
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-th">Date</th>
                  <th className="table-th">Employee</th>
                  <th className="table-th text-right">Amount</th>
                  <th className="table-th">Salary Month</th>
                  <th className="table-th">Notes</th>
                  <th className="table-th">Action</th>
                </tr>
              </thead>
              <tbody>
                {advances.map(adv => (
                  <tr key={adv.id} className="table-tr">
                    <td className="table-td whitespace-nowrap">{formatDate(adv.advance_date)}</td>
                    <td className="table-td font-medium">{adv.employees?.full_name || '-'}</td>
                    <td className="table-td text-right text-danger font-semibold">{formatRM(adv.amount)}</td>
                    <td className="table-td">
                      <span className="badge bg-blue-100 text-blue-700">{adv.month}</span>
                    </td>
                    <td className="table-td text-gray-500">{adv.notes || '-'}</td>
                    <td className="table-td">
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(adv.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-red-50 font-bold">
                  <td className="table-td" colSpan={2}>TOTAL</td>
                  <td className="table-td text-right text-danger">{formatRM(total)}</td>
                  <td className="table-td" colSpan={3} />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Add Advance">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="form-label">Employee *</label>
            <select className="form-control" required value={form.employee_id}
              onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))}>
              <option value="">Select employee…</option>
              {empList.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Advance Date *</label>
            <input type="date" className="form-control" required value={form.advance_date}
              onChange={e => setForm(f => ({ ...f, advance_date: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">Amount (RM) *</label>
            <input type="number" className="form-control" required min="1" step="0.01"
              value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              placeholder="0.00" />
          </div>
          <div>
            <label className="form-label">Salary Month *</label>
            <input type="month" className="form-control" required value={form.month}
              onChange={e => setForm(f => ({ ...f, month: e.target.value }))} />
            <p className="text-xs text-gray-400 mt-1">The month this advance will be deducted from</p>
          </div>
          <div>
            <label className="form-label">Notes</label>
            <input className="form-control" placeholder="Optional notes…" value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving} className="btn btn-primary">
              {saving ? 'Saving…' : 'Add Advance'}
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
