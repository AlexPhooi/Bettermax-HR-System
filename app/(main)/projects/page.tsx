'use client';
import { useEffect, useState, useMemo } from 'react';
import Modal from '@/components/Modal';
import { formatDate } from '@/lib/utils';

interface Project {
  id: string;
  name: string;
  code: string | null;
  location: string | null;
  maps_url: string | null;
  waze_url: string | null;
  status: string;
  created_at: string;
}

const EMPTY_FORM = { name: '', code: '', location: '', maps_url: '', waze_url: '', status: 'active' };

export default function ProjectsPage() {
  const [projects, setProjects]     = useState<Project[]>([]);
  const [loading, setLoading]       = useState(true);
  const [alertMsg, setAlertMsg]     = useState('');
  const [alertType, setAlertType]   = useState<'success' | 'danger'>('success');
  const [showModal, setShowModal]   = useState(false);
  const [editId, setEditId]         = useState<string | null>(null);
  const [saving, setSaving]         = useState(false);
  const [form, setForm]             = useState({ ...EMPTY_FORM });
  const [search, setSearch]         = useState('');
  const [statusFilter, setStatusFilter] = useState('active');

  function showAlert(msg: string, type: 'success' | 'danger' = 'success') {
    setAlertMsg(msg); setAlertType(type);
    setTimeout(() => setAlertMsg(''), 4000);
  }

  async function loadProjects() {
    setLoading(true);
    const res = await fetch('/api/projects');
    const data = await res.json();
    setProjects(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => { loadProjects(); }, []);

  const filtered = useMemo(() => projects.filter(p => {
    const matchSearch = !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.code || '').toLowerCase().includes(search.toLowerCase()) ||
      (p.location || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || p.status === statusFilter;
    return matchSearch && matchStatus;
  }), [projects, search, statusFilter]);

  function openAdd() {
    setForm({ ...EMPTY_FORM }); setEditId(null); setShowModal(true);
  }

  function openEdit(proj: Project) {
    setForm({
      name: proj.name, code: proj.code || '', location: proj.location || '',
      maps_url: proj.maps_url || '',
      waze_url: proj.waze_url || '',
      status: proj.status,
    });
    setEditId(proj.id); setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const url    = editId ? `/api/projects/${editId}` : '/api/projects';
      const method = editId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { showAlert(data.error, 'danger'); return; }
      showAlert(editId ? 'Project updated.' : 'Project added.');
      setShowModal(false);
      loadProjects();
    } finally { setSaving(false); }
  }

  async function toggleStatus(proj: Project) {
    const newStatus = proj.status === 'active' ? 'completed' : 'active';
    const res = await fetch(`/api/projects/${proj.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...proj, status: newStatus }),
    });
    if (res.ok) {
      showAlert(`Project marked as ${newStatus}.`);
      loadProjects();
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-primary">Projects</h1>
        <button className="btn btn-primary" onClick={openAdd}>+ Add Project</button>
      </div>

      {alertMsg && <div className={`alert alert-${alertType}`}>{alertMsg}</div>}

      {/* Filters */}
      <div className="card mb-4 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="form-label">Search</label>
            <input className="form-control" placeholder="Search name, code, location…"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Status</label>
            <select className="form-control" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
            </select>
          </div>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-bg">
          <span className="text-sm font-semibold text-primary">
            {filtered.length} project{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center text-gray-400">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No projects found.</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-th">Name</th>
                  <th className="table-th">Code</th>
                  <th className="table-th">Location</th>
                  <th className="table-th">Navigate</th>
                  <th className="table-th">Status</th>
                  <th className="table-th">Created</th>
                  <th className="table-th">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(proj => (
                    <tr key={proj.id} className="table-tr">
                      <td className="table-td font-medium">{proj.name}</td>
                      <td className="table-td">
                        {proj.code
                          ? <span className="badge bg-blue-100 text-blue-700">{proj.code}</span>
                          : <span className="text-gray-400">-</span>}
                      </td>
                      <td className="table-td text-gray-600 max-w-[160px]">
                        <div className="truncate">{proj.location || '-'}</div>
                      </td>
                      <td className="table-td">
                        <div className="flex gap-1.5">
                          {proj.maps_url && (
                            <a href={proj.maps_url} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors">
                              📍 Maps
                            </a>
                          )}
                          {proj.waze_url && (
                            <a href={proj.waze_url} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-cyan-500 text-white hover:bg-cyan-600 transition-colors">
                              🗺 Waze
                            </a>
                          )}
                          {!proj.maps_url && !proj.waze_url && <span className="text-gray-400 text-xs">-</span>}
                        </div>
                      </td>
                      <td className="table-td">
                        <span className={`badge ${proj.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {proj.status === 'active' ? 'Active' : 'Completed'}
                        </span>
                      </td>
                      <td className="table-td text-gray-500">{formatDate(proj.created_at)}</td>
                      <td className="table-td">
                        <div className="flex gap-1.5">
                          <button className="btn btn-outline btn-sm" onClick={() => openEdit(proj)}>Edit</button>
                          <button
                            className={`btn btn-sm ${proj.status === 'active' ? 'btn-warning' : 'btn-success'}`}
                            onClick={() => toggleStatus(proj)}>
                            {proj.status === 'active' ? 'Complete' : 'Re-open'}
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
        title={editId ? 'Edit Project' : 'Add Project'} maxWidth="max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Basic */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Basic Info</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="form-label">Project Name *</label>
                <input className="form-control" required value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Project name" />
              </div>
              <div>
                <label className="form-label">Code</label>
                <input className="form-control" value={form.code}
                  onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                  placeholder="e.g. PRJ-001" />
              </div>
            </div>
          </div>

          {/* Location */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Location & Navigation</h3>
            <div className="space-y-3">
              <div>
                <label className="form-label">Location Name / Address</label>
                <input className="form-control" value={form.location}
                  onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                  placeholder="e.g. Lot 5, Jalan Industri, Shah Alam" />
              </div>
              <div>
                <label className="form-label">
                  📍 Google Maps Link
                </label>
                <div className="flex gap-2">
                  <input className="form-control" value={form.maps_url}
                    onChange={e => setForm(f => ({ ...f, maps_url: e.target.value }))}
                    placeholder="Paste Google Maps share link…" />
                  {form.maps_url && (
                    <a href={form.maps_url} target="_blank" rel="noopener noreferrer"
                      className="shrink-0 inline-flex items-center px-3 py-2 rounded text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors">
                      Test
                    </a>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Open <a href="https://maps.google.com" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">Google Maps</a> → find location → Share → Copy link
                </p>
              </div>
              <div>
                <label className="form-label">
                  🗺 Waze Link
                </label>
                <div className="flex gap-2">
                  <input className="form-control" value={form.waze_url}
                    onChange={e => setForm(f => ({ ...f, waze_url: e.target.value }))}
                    placeholder="Paste Waze share link…" />
                  {form.waze_url && (
                    <a href={form.waze_url} target="_blank" rel="noopener noreferrer"
                      className="shrink-0 inline-flex items-center px-3 py-2 rounded text-sm font-medium bg-cyan-500 text-white hover:bg-cyan-600 transition-colors">
                      Test
                    </a>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Open <a href="https://www.waze.com" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">Waze</a> → search location → Share → Copy link
                </p>
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
                <option value="completed">Completed</option>
              </select>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving} className="btn btn-primary">
              {saving ? 'Saving…' : editId ? 'Save Changes' : 'Add Project'}
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
