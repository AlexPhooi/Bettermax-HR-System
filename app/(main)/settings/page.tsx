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

// ── Main Page ──────────────────────────────────────────────────────────
export default function SettingsPage() {
  const { role, loaded } = useRole();
  const router = useRouter();
  const canAccess = role === 'owner' || role === 'admin';

  useEffect(() => { if (loaded && !canAccess) router.replace('/'); }, [loaded, canAccess, router]);

  const [tab, setTab] = useState<'projects' | 'rates'>('projects');

  if (!loaded || !canAccess) return null;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-primary">Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage projects and ranking rates</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        {([['projects', '🏗️ Projects'], ['rates', '💰 Ranking Rates']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors
              ${tab === key ? 'bg-white shadow text-primary' : 'text-gray-500 hover:text-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'projects' ? <ProjectsTab /> : <RatesTab />}
    </div>
  );
}

// ── Projects Tab ───────────────────────────────────────────────────────
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

  async function load() {
    setLoading(true);
    const res = await fetch('/api/projects');
    setProjects(Array.isArray(await res.json()) ? await res.json() : []);
    setLoading(false);
  }
  // avoid double-fetch from the await above
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
    if (res.ok) { showAlert(`Project marked as ${newStatus}.`); loadProjects(); }
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

// ── Ranking Rates Tab ──────────────────────────────────────────────────
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
    // Ensure all ranks are present in display order
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
      showAlert('Ranking rates updated successfully!');
      setEditing(false);
      loadRates();
    } finally { setSaving(false); }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm text-gray-500">Set the daily rate for each rank. Changes apply to all new salary calculations.</p>
        </div>
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
        💡 Rate changes only affect <strong>future salary calculations</strong>. Already finalized salary records are not changed.
      </div>
    </div>
  );
}
