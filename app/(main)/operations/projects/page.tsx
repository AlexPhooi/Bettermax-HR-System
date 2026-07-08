'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRole } from '@/lib/role-context';
import { useRouter } from 'next/navigation';

interface Project {
  id: string;
  name: string;
  code: string | null;
  location: string | null;
  status: string;
  project_type: string | null;
  start_date: string | null;
  target_completion: string | null;
  progress_percent: number;
  contract_value: number | null;
  gp_percent: number | null;
  foreman_name: string | null;
  latest_log_date: string | null;
}

const DEFAULT_MILESTONES = [
  'Demolition','Foundation & Footing','Reinforced Concrete Structure',
  'Roofing','Brickwork','Plaster & Screeding',
  'M&E Rough-in','Tiling & Finishing','Final Touch & Handover',
];

function fmt(n: number | null | undefined) {
  if (n == null) return '—';
  return 'RM ' + Number(n).toLocaleString('en-MY', { minimumFractionDigits: 0 });
}

export default function ProjectsListPage() {
  const { role, loaded } = useRole();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [showNew,  setShowNew]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');
  const [filter,   setFilter]   = useState<'all'|'active'|'completed'>('active');

  // New project form state
  const [form, setForm] = useState({
    name: '', code: '', location: '', project_type: '',
    start_date: '', target_completion: '', contract_value: '',
    seed_milestones: true,
  });

  const isManager = role === 'owner' || role === 'admin';

  useEffect(() => {
    if (!loaded) return;
    if (role !== 'owner' && role !== 'admin') { router.replace('/operations'); return; }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, role]);

  function load() {
    setLoading(true);
    const qs = filter === 'all' ? '' : `?status=${filter}`;
    fetch(`/api/operations/projects${qs}`)
      .then(r => r.json())
      .then(d => { setProjects(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => { if (loaded && isManager) load(); }, [filter]);

  async function createProject() {
    if (!form.name.trim()) { setError('Project name is required.'); return; }
    setSaving(true); setError('');
    const res = await fetch('/api/operations/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, seed_milestones: form.seed_milestones }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error); setSaving(false); return; }
    setShowNew(false);
    setForm({ name: '', code: '', location: '', project_type: '', start_date: '', target_completion: '', contract_value: '', seed_milestones: true });
    router.push(`/operations/projects/${data.id}`);
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 22, fontWeight: 700, color: '#2C1A0E' }}>Projects</h1>
          <p style={{ color: '#C49A6C', fontSize: 13 }}>All construction &amp; renovation projects</p>
        </div>
        {isManager && (
          <button onClick={() => setShowNew(true)} className="btn btn-primary">+ New Project</button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4">
        {(['active','completed','all'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className="btn btn-sm"
            style={filter === f
              ? { background: '#C9962E', color: '#2E1810', fontWeight: 700 }
              : { background: '#F5EDD6', color: '#6B4A00' }}>
            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="card">
          {[...Array(4)].map((_, i) => (
            <div key={i} style={{ height: 40, background: i % 2 === 0 ? '#F5EDD6' : 'white', marginBottom: 1, borderRadius: 4 }} />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏗️</div>
          <p style={{ color: '#C49A6C' }}>No {filter !== 'all' ? filter : ''} projects found.</p>
          {isManager && (
            <button onClick={() => setShowNew(true)} className="btn btn-primary btn-sm" style={{ marginTop: 12 }}>
              Create First Project
            </button>
          )}
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="overflow-x-auto">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th className="table-th">Project</th>
                  <th className="table-th">Type</th>
                  <th className="table-th">Foreman</th>
                  <th className="table-th">Progress</th>
                  <th className="table-th">Target Date</th>
                  <th className="table-th">Contract Value</th>
                  <th className="table-th">GP%</th>
                  <th className="table-th">Last Log</th>
                  <th className="table-th">Status</th>
                  <th className="table-th"></th>
                </tr>
              </thead>
              <tbody>
                {projects.map(p => {
                  const daysLeft = p.target_completion
                    ? Math.ceil((new Date(p.target_completion).getTime() - Date.now()) / 86400000)
                    : null;
                  return (
                    <tr key={p.id} className="table-tr">
                      <td className="table-td">
                        <div style={{ fontWeight: 600, color: '#2C1A0E' }}>{p.name}</div>
                        {p.code && <div style={{ fontSize: 11, color: '#C49A6C' }}>{p.code}</div>}
                        {p.location && <div style={{ fontSize: 11, color: '#6B4A00' }}>📍 {p.location}</div>}
                      </td>
                      <td className="table-td" style={{ fontSize: 12 }}>{p.project_type || '—'}</td>
                      <td className="table-td" style={{ fontSize: 12 }}>{p.foreman_name || '—'}</td>
                      <td className="table-td">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ flex: 1, height: 6, background: '#F5EDD6', borderRadius: 3, overflow: 'hidden', minWidth: 60 }}>
                            <div style={{ height: '100%', width: `${p.progress_percent || 0}%`, background: '#C9962E', borderRadius: 3 }} />
                          </div>
                          <span style={{ fontSize: 11, color: '#6B4A00', whiteSpace: 'nowrap' }}>{p.progress_percent || 0}%</span>
                        </div>
                      </td>
                      <td className="table-td" style={{ fontSize: 12 }}>
                        {p.target_completion ? new Date(p.target_completion).toLocaleDateString('en-GB') : '—'}
                        {daysLeft != null && (
                          <div style={{ fontSize: 10, color: daysLeft <= 0 ? '#791f1f' : daysLeft <= 14 ? '#633806' : '#27500A', fontWeight: 600 }}>
                            {daysLeft > 0 ? `${daysLeft}d left` : `${Math.abs(daysLeft)}d overdue`}
                          </div>
                        )}
                      </td>
                      <td className="table-td" style={{ fontSize: 12 }}>{fmt(p.contract_value)}</td>
                      <td className="table-td">
                        {p.gp_percent != null ? (
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 9999,
                            background: p.gp_percent >= 20 ? '#eaf3de' : p.gp_percent >= 10 ? '#faeeda' : '#fcebeb',
                            color: p.gp_percent >= 20 ? '#27500A' : p.gp_percent >= 10 ? '#633806' : '#791f1f',
                          }}>
                            {p.gp_percent}%
                          </span>
                        ) : '—'}
                      </td>
                      <td className="table-td" style={{ fontSize: 12 }}>
                        {p.latest_log_date ? new Date(p.latest_log_date).toLocaleDateString('en-GB') : <span style={{ color: '#C49A6C' }}>—</span>}
                      </td>
                      <td className="table-td">
                        <span className="badge" style={p.status === 'active'
                          ? { background: '#eaf3de', color: '#27500A' }
                          : { background: '#F5EDD6', color: '#6B4A00' }}>
                          {p.status}
                        </span>
                      </td>
                      <td className="table-td">
                        <Link href={`/operations/projects/${p.id}`} className="btn btn-outline btn-sm">View</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* New project modal */}
      {showNew && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowNew(false); }}>
          <div className="modal-box" style={{ maxWidth: 540 }}>
            <h2 className="modal-title">New Project</h2>
            {error && <div className="alert alert-danger">{error}</div>}

            <div style={{ display: 'grid', gap: 14 }}>
              <div className="grid grid-cols-2 gap-3">
                <div style={{ gridColumn: '1/-1' }}>
                  <label className="form-label">Project Name *</label>
                  <input className="form-control" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. PJ SS24/21 Extension" />
                </div>
                <div>
                  <label className="form-label">Code</label>
                  <input className="form-control" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="e.g. PJ-001" />
                </div>
                <div>
                  <label className="form-label">Type</label>
                  <select className="form-control" value={form.project_type} onChange={e => setForm(f => ({ ...f, project_type: e.target.value }))}>
                    <option value="">Select type</option>
                    <option>Extension</option>
                    <option>Renovation</option>
                    <option>New Build</option>
                    <option>Commercial</option>
                    <option>Industrial</option>
                  </select>
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label className="form-label">Location</label>
                  <input className="form-control" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="e.g. Petaling Jaya, SS24" />
                </div>
                <div>
                  <label className="form-label">Start Date</label>
                  <input type="date" className="form-control" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Target Completion</label>
                  <input type="date" className="form-control" value={form.target_completion} onChange={e => setForm(f => ({ ...f, target_completion: e.target.value }))} />
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label className="form-label">Contract Value (RM)</label>
                  <input type="number" className="form-control" value={form.contract_value} onChange={e => setForm(f => ({ ...f, contract_value: e.target.value }))} placeholder="0.00" />
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#2C1A0E' }}>
                    <input type="checkbox" checked={form.seed_milestones} onChange={e => setForm(f => ({ ...f, seed_milestones: e.target.checked }))} />
                    Auto-create default milestones ({DEFAULT_MILESTONES.length} stages)
                  </label>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={createProject} disabled={saving} className="btn btn-primary flex-1">
                {saving ? 'Creating…' : 'Create Project'}
              </button>
              <button onClick={() => setShowNew(false)} className="btn btn-outline">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
