'use client';
import { useEffect, useState, useMemo } from 'react';
import Modal from '@/components/Modal';
import { useRole } from '@/lib/role-context';
import { useRouter } from 'next/navigation';
import { formatDate, RANK_COLORS } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────
interface Project {
  id: string; name: string; code: string | null;
  location: string | null; maps_url: string | null; waze_url: string | null;
  status: string; created_at: string;
}
interface RankRate { rank: string; daily_rate: number; }

const RANKS = ['Rookie', 'Support', 'Skilled', 'Pro', 'Core', 'Leader'];
const EMPTY_PROJ = { name: '', code: '', location: '', maps_url: '', waze_url: '' };

type TabKey = 'staff' | 'record' | 'salary' | 'saving';

// ── Main Page ──────────────────────────────────────────────────────────
export default function SettingsPage() {
  const { role, loaded } = useRole();
  const router = useRouter();
  const canAccess = role === 'owner' || role === 'admin';

  useEffect(() => { if (loaded && !canAccess) router.replace('/'); }, [loaded, canAccess, router]);

  const [tab, setTab] = useState<TabKey>('staff');

  if (!loaded || !canAccess) return null;

  const TABS: { key: TabKey; label: string }[] = [
    { key: 'staff',  label: '👷 Staff'   },
    { key: 'record', label: '🏗️ Record'  },
    { key: 'salary', label: '💰 Salary'  },
    { key: 'saving', label: '🏦 Saving'  },
  ];

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-primary">Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage all system variables</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit flex-wrap">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors
              ${tab === t.key ? 'bg-white shadow text-primary' : 'text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'staff'  && <RatesTab />}
      {tab === 'record' && <ProjectsTab />}
      {tab === 'salary' && <SalaryTab />}
      {tab === 'saving' && <SavingTab />}
    </div>
  );
}

// ── Staff Tab — Ranking Rates ──────────────────────────────────────────
function RatesTab() {
  const [rates, setRates]         = useState<RankRate[]>([]);
  const [loading, setLoading]     = useState(true);
  const [editing, setEditing]     = useState(false);
  const [draft, setDraft]         = useState<RankRate[]>([]);
  const [saving, setSaving]       = useState(false);
  const [alertMsg, setAlertMsg]   = useState('');
  const [alertType, setAlertType] = useState<'success' | 'danger'>('success');

  function showAlert(msg: string, type: 'success' | 'danger' = 'success') {
    setAlertMsg(msg); setAlertType(type); setTimeout(() => setAlertMsg(''), 4000);
  }

  async function loadRates() {
    setLoading(true);
    const data = await fetch('/api/settings/ranking-rates').then(r => r.json());
    const map: Record<string, number> = {};
    if (Array.isArray(data)) data.forEach((r: RankRate) => { map[r.rank] = r.daily_rate; });
    const ordered = RANKS.map(r => ({ rank: r, daily_rate: map[r] ?? 0 }));
    setRates(ordered);
    setDraft(ordered);
    setLoading(false);
  }

  useEffect(() => { loadRates(); }, []);

  function startEdit() { setDraft(rates.map(r => ({ ...r }))); setEditing(true); }
  function cancelEdit() { setDraft(rates.map(r => ({ ...r }))); setEditing(false); }

  function updateDraft(rank: string, val: string) {
    setDraft(d => d.map(r => r.rank === rank ? { ...r, daily_rate: Number(val) || 0 } : r));
  }

  async function saveRates() {
    setSaving(true);
    try {
      const res = await fetch('/api/settings/ranking-rates', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft),
      });
      if (!res.ok) { showAlert('Failed to save.', 'danger'); return; }
      showAlert('Ranking rates updated!');
      setEditing(false);
      loadRates();
    } finally { setSaving(false); }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">Daily rate per rank. Changes apply to future salary calculations only.</p>
        {!editing && <button className="btn btn-primary" onClick={startEdit}>✏️ Edit Rates</button>}
      </div>

      {alertMsg && <div className={`alert alert-${alertType} mb-4`}>{alertMsg}</div>}

      {loading ? <div className="p-8 text-center text-gray-400">Loading…</div> : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-th">Rank</th>
                <th className="table-th text-right">Daily Rate (RM)</th>
                {editing && <th className="table-th text-right">New Rate (RM)</th>}
              </tr>
            </thead>
            <tbody>
              {(editing ? draft : rates).map(r => (
                <tr key={r.rank} className="table-tr">
                  <td className="table-td">
                    <span className={`badge ${RANK_COLORS[r.rank] || 'bg-gray-100 text-gray-600'}`}>{r.rank}</span>
                  </td>
                  <td className="table-td text-right font-semibold text-accent">
                    RM {Number(r.daily_rate).toFixed(2)}
                  </td>
                  {editing && (
                    <td className="table-td text-right">
                      <input
                        type="number" min="0" step="5"
                        className="form-control w-28 text-right ml-auto"
                        value={draft.find(d => d.rank === r.rank)?.daily_rate ?? r.daily_rate}
                        onChange={e => updateDraft(r.rank, e.target.value)}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          {editing && (
            <div className="px-6 py-4 border-t border-bg flex gap-3">
              <button className="btn btn-primary" onClick={saveRates} disabled={saving}>
                {saving ? 'Saving…' : '✓ Save Rates'}
              </button>
              <button className="btn btn-secondary" onClick={cancelEdit}>Cancel</button>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-700">
        💡 Rate changes only affect <strong>future salary calculations</strong>. Finalized records are not changed.
      </div>
    </div>
  );
}

// ── Record Tab — Projects ──────────────────────────────────────────────
function ProjectsTab() {
  const [projects, setProjects]   = useState<Project[]>([]);
  const [loading, setLoading]     = useState(true);
  const [alertMsg, setAlertMsg]   = useState('');
  const [alertType, setAlertType] = useState<'success' | 'danger'>('success');
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId]       = useState<string | null>(null);
  const [saving, setSaving]       = useState(false);
  const [form, setForm]           = useState({ ...EMPTY_PROJ });
  const [search, setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('active');

  function showAlert(msg: string, type: 'success' | 'danger' = 'success') {
    setAlertMsg(msg); setAlertType(type); setTimeout(() => setAlertMsg(''), 4000);
  }

  async function loadProjects() {
    setLoading(true);
    const data = await fetch('/api/projects').then(r => r.json());
    setProjects(Array.isArray(data) ? data : []);
    setLoading(false);
  }
  useEffect(() => { loadProjects(); }, []);

  const filtered = useMemo(() => projects.filter(p => {
    const q = search.toLowerCase();
    if (q && !p.name.toLowerCase().includes(q) && !(p.code || '').toLowerCase().includes(q)) return false;
    if (statusFilter && p.status !== statusFilter) return false;
    return true;
  }), [projects, search, statusFilter]);

  function openAdd() { setForm({ ...EMPTY_PROJ }); setEditId(null); setShowModal(true); }
  function openEdit(p: Project) {
    setForm({ name: p.name, code: p.code || '', location: p.location || '',
      maps_url: p.maps_url || '', waze_url: p.waze_url || '' });
    setEditId(p.id); setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      const url    = editId ? `/api/projects/${editId}` : '/api/projects';
      const method = editId ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok) { showAlert(data.error, 'danger'); return; }
      showAlert(editId ? 'Project updated.' : 'Project added.');
      setShowModal(false); loadProjects();
    } finally { setSaving(false); }
  }

  async function toggleStatus(p: Project) {
    const newStatus = p.status === 'active' ? 'completed' : 'active';
    const res = await fetch(`/api/projects/${p.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...p, status: newStatus }),
    });
    if (res.ok) { showAlert(`Marked as ${newStatus}.`); loadProjects(); }
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex gap-3 flex-wrap">
          <input className="form-control w-48" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
          <select className="form-control w-36" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
          </select>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>+ Add Project</button>
      </div>

      {alertMsg && <div className={`alert alert-${alertType} mb-4`}>{alertMsg}</div>}

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? <div className="p-8 text-center text-gray-400">Loading…</div>
          : filtered.length === 0 ? <div className="p-8 text-center text-gray-400">No projects found.</div>
          : (
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-th">Project</th>
                  <th className="table-th">Code</th>
                  <th className="table-th">Location</th>
                  <th className="table-th">Navigate</th>
                  <th className="table-th">Status</th>
                  <th className="table-th">Created</th>
                  <th className="table-th">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id} className="table-tr">
                    <td className="table-td font-medium">{p.name}</td>
                    <td className="table-td">
                      {p.code ? <span className="badge bg-gray-100 text-gray-600 font-mono">{p.code}</span> : '—'}
                    </td>
                    <td className="table-td text-gray-500">{p.location || '—'}</td>
                    <td className="table-td">
                      <div className="flex gap-1.5">
                        {p.maps_url && <a href={p.maps_url} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm text-xs">🗺 Maps</a>}
                        {p.waze_url && <a href={p.waze_url} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm text-xs">🚗 Waze</a>}
                      </div>
                    </td>
                    <td className="table-td">
                      <span className={`badge ${p.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {p.status === 'active' ? '🟢 Active' : '✅ Completed'}
                      </span>
                    </td>
                    <td className="table-td text-gray-400 text-sm">{formatDate(p.created_at)}</td>
                    <td className="table-td">
                      <div className="flex gap-1.5">
                        <button className="btn btn-outline btn-sm" onClick={() => openEdit(p)}>Edit</button>
                        <button className={`btn btn-sm ${p.status === 'active' ? 'btn-warning' : 'btn-success'}`}
                          onClick={() => toggleStatus(p)}>
                          {p.status === 'active' ? 'Complete' : 'Re-open'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)}
        title={editId ? 'Edit Project' : 'Add Project'} maxWidth="max-w-lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="form-label">Project Name *</label>
              <input className="form-control" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Code</label>
              <input className="form-control" placeholder="e.g. PRJ-01" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Location</label>
              <input className="form-control" placeholder="Area / address" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Google Maps Link</label>
              <input className="form-control" placeholder="https://maps.google.com/…" value={form.maps_url} onChange={e => setForm(f => ({ ...f, maps_url: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Waze Link</label>
              <input className="form-control" placeholder="https://waze.com/…" value={form.waze_url} onChange={e => setForm(f => ({ ...f, waze_url: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving} className="btn btn-primary">{saving ? 'Saving…' : editId ? 'Save Changes' : 'Add Project'}</button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
          </div>
        </form>
      </Modal>
    </>
  );
}

// ── Salary Tab — Payment Day ───────────────────────────────────────────
function SalaryTab() {
  const [payDay,   setPayDay]   = useState('7');
  const [draft,    setDraft]    = useState('7');
  const [editing,  setEditing]  = useState(false);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [alertMsg, setAlertMsg] = useState('');
  const [alertType, setAlertType] = useState<'success' | 'danger'>('success');

  function showAlert(msg: string, type: 'success' | 'danger' = 'success') {
    setAlertMsg(msg); setAlertType(type); setTimeout(() => setAlertMsg(''), 4000);
  }

  async function load() {
    setLoading(true);
    const data = await fetch('/api/settings/app').then(r => r.json());
    const val = data.salary_payment_day ?? '7';
    setPayDay(val); setDraft(val);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function save() {
    const day = Number(draft);
    if (isNaN(day) || day < 1 || day > 28) { showAlert('Day must be between 1 and 28.', 'danger'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/settings/app', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ salary_payment_day: String(day) }),
      });
      if (!res.ok) { const d = await res.json(); showAlert(d.error, 'danger'); return; }
      showAlert('Salary payment day updated!');
      setPayDay(String(day));
      setEditing(false);
    } finally { setSaving(false); }
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Loading…</div>;

  // Compute next payment date
  const now = new Date();
  const day = Number(payDay);
  let nextPayment = new Date(now.getFullYear(), now.getMonth() + 1, day);
  const nextPayStr = nextPayment.toLocaleDateString('en-MY', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="max-w-md space-y-5">
      {alertMsg && <div className={`alert alert-${alertType}`}>{alertMsg}</div>}

      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-800">Salary Payment Day</h3>
            <p className="text-sm text-gray-500 mt-0.5">Which day of the following month salaries are paid</p>
          </div>
          {!editing && (
            <button className="btn btn-primary" onClick={() => { setDraft(payDay); setEditing(true); }}>
              ✏️ Edit
            </button>
          )}
        </div>

        {editing ? (
          <div className="space-y-3">
            <div>
              <label className="form-label">Day of month (1–28)</label>
              <input type="number" min={1} max={28} className="form-control w-28"
                value={draft} onChange={e => setDraft(e.target.value)} />
              <p className="text-xs text-gray-400 mt-1">e.g. 7 means salary is paid on the 7th of next month</p>
            </div>
            <div className="flex gap-3">
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
              <button className="btn btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className="bg-accent/5 border border-accent/20 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">Current setting</p>
            <p className="text-3xl font-extrabold text-accent">{payDay}<sup className="text-base font-medium text-gray-500">th</sup></p>
            <p className="text-sm text-gray-600 mt-2">
              Next salary payment: <strong className="text-gray-800">{nextPayStr}</strong>
            </p>
          </div>
        )}
      </div>

      <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-700">
        💡 This date is shown on the Salary page as a reminder for when to process payments. It does not auto-trigger any action.
      </div>
    </div>
  );
}

// ── Saving Tab — Interest Rate + Birthday Rate ─────────────────────────
function SavingTab() {
  const [settings, setSettings] = useState({ interest_rate: 0.02, total_pool: 0, last_interest_month: null as string | null });
  const [draft, setDraft]   = useState({ interest_rate: '2' });
  const [editing, setEditing]   = useState(false);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [alertMsg, setAlertMsg] = useState('');
  const [alertType, setAlertType] = useState<'success' | 'danger'>('success');

  function showAlert(msg: string, type: 'success' | 'danger' = 'success') {
    setAlertMsg(msg); setAlertType(type); setTimeout(() => setAlertMsg(''), 4000);
  }

  async function load() {
    setLoading(true);
    const data = await fetch('/api/savings/settings').then(r => r.json());
    setSettings(data);
    setDraft({
      interest_rate: String(Math.round(data.interest_rate * 100)),
    });
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function save() {
    const ir = Number(draft.interest_rate) / 100;
    if (isNaN(ir) || ir < 0 || ir > 0.5) { showAlert('Interest rate must be 0–50%.', 'danger'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/savings/settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interest_rate: ir }),
      });
      if (!res.ok) { const d = await res.json(); showAlert(d.error, 'danger'); return; }
      showAlert('Saving rates updated! Effective from next month.');
      setEditing(false);
      load();
    } finally { setSaving(false); }
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Loading…</div>;

  const stdPct = (settings.interest_rate * 100).toFixed(1);

  return (
    <div className="max-w-md space-y-5">
      {alertMsg && <div className={`alert alert-${alertType}`}>{alertMsg}</div>}

      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-800">Monthly Interest Rate</h3>
            <p className="text-sm text-gray-500 mt-0.5">Flat rate applied to all employees on the 1st of each month</p>
          </div>
          {!editing && (
            <button className="btn btn-primary" onClick={() => setEditing(true)}>✏️ Edit</button>
          )}
        </div>

        {editing ? (
          <div className="space-y-4">
            <div>
              <label className="form-label">Monthly Rate (%)</label>
              <div className="flex items-center gap-2">
                <input type="number" min={0} max={50} step={0.5} className="form-control w-28"
                  value={draft.interest_rate} onChange={e => setDraft(d => ({ ...d, interest_rate: e.target.value }))} />
                <span className="text-gray-500">% / month</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">e.g. 2 = 2% monthly = 24% annually</p>
            </div>
            <div className="flex gap-3">
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
              <button className="btn btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className="bg-primary/5 border border-primary/15 rounded-xl p-4 text-center">
            <p className="text-xs text-gray-500 mb-1">Current Rate</p>
            <p className="text-4xl font-extrabold text-primary">{stdPct}<span className="text-lg font-medium">%</span></p>
            <p className="text-xs text-gray-400 mt-1">per month · same for all employees</p>
          </div>
        )}

        <div className="border-t border-gray-100 pt-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-gray-400">Total Pool</p>
            <p className="font-bold text-gray-800">RM {settings.total_pool.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Last Applied</p>
            <p className="font-bold text-gray-800">{settings.last_interest_month ?? '—'}</p>
          </div>
        </div>
      </div>

      <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700 space-y-1">
        <p>💡 <strong>Flat rate</strong>: All employees earn {stdPct}% monthly — same rate, no exceptions.</p>
        <p>💡 <strong>🎂 Birthday bonus</strong>: Attendance approved in a worker&apos;s birthday month earns <strong>RM20 site bonus</strong> (x2 vs standard RM10).</p>
        <p>💡 Rate changes take effect from the <strong>1st of next month</strong>.</p>
      </div>
    </div>
  );
}
