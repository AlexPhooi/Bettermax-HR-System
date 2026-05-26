'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useRole } from '@/lib/role-context';

// ── Types ──────────────────────────────────────────────────────────────
interface Project {
  id: string; name: string; code: string | null; location: string | null;
  status: string; project_type: string | null; start_date: string | null;
  target_completion: string | null; actual_completion: string | null;
  progress_percent: number; contract_value: number | null;
  deposit_received: number | null; progress_billed: number | null;
  total_collected: number | null; gp_percent: number | null;
  foreman_id: string | null; foreman_name: string | null;
  total_labor_cost: number | null; total_material_cost: number | null;
  estimated_duration_days: number | null; notes: string | null;
  maps_url: string | null; waze_url: string | null;
}
interface Milestone {
  id: string; project_id: string; name: string; sequence_order: number;
  planned_start: string | null; planned_end: string | null;
  actual_start: string | null; actual_end: string | null;
  status: 'pending'|'in_progress'|'completed'|'delayed'; notes: string | null;
}
interface DailyLog {
  id: string; log_date: string; weather: string;
  workers_present: number | null; work_done: string;
  issues_found: string | null; materials_used: string | null;
  photo_url: string | null; milestone_id: string | null;
  users: { username: string } | null;
}
interface PaymentStage {
  id: string; stage_name: string; sequence_order: number;
  percentage: number | null; amount: number | null;
  due_date: string | null; invoiced_date: string | null;
  received_date: string | null; status: string; notes: string | null;
}

const MILESTONE_STATUS_COLORS = {
  pending:     { bg: '#f3f4f6', text: '#6b7280', label: 'Pending' },
  in_progress: { bg: '#dbeafe', text: '#1d4ed8', label: 'In Progress' },
  completed:   { bg: '#eaf3de', text: '#27500A', label: 'Completed' },
  delayed:     { bg: '#fcebeb', text: '#791f1f', label: 'Delayed' },
};
const PAYMENT_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending:  { bg: '#f3f4f6', text: '#6b7280' },
  invoiced: { bg: '#faeeda', text: '#633806' },
  received: { bg: '#eaf3de', text: '#27500A' },
  overdue:  { bg: '#fcebeb', text: '#791f1f' },
};
const WEATHER_ICONS: Record<string, string> = {
  sunny: '☀️', cloudy: '⛅', rainy: '🌧️', 'stopped work': '⛔',
};

function fmt(n: number | null | undefined) {
  if (n == null) return '—';
  return 'RM ' + Number(n).toLocaleString('en-MY', { minimumFractionDigits: 0 });
}
function fmtDate(s: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('en-GB');
}

// ── Tab: Overview ──────────────────────────────────────────────────────
function OverviewTab({ project, isManager, onSaved }: {
  project: Project; isManager: boolean; onSaved: (p: Project) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');
  const [form, setForm] = useState({ ...project });
  const [employees, setEmployees] = useState<{id:string;full_name:string}[]>([]);

  useEffect(() => {
    if (isManager) {
      fetch('/api/employees?status=active')
        .then(r => r.json()).then(d => setEmployees(Array.isArray(d) ? d : [])).catch(() => {});
    }
  }, [isManager]);

  async function save() {
    setSaving(true); setError('');
    const res = await fetch(`/api/operations/projects/${project.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error); setSaving(false); return; }
    onSaved(data); setEditing(false); setSaving(false);
  }

  const outstanding = (project.contract_value || 0) - (project.total_collected || 0);

  return (
    <div>
      {/* Financial summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Contract Value', value: fmt(project.contract_value) },
          { label: 'Total Collected', value: fmt(project.total_collected) },
          { label: 'Outstanding', value: fmt(outstanding), warn: outstanding > 0 },
          { label: 'GP%', value: project.gp_percent != null ? `${project.gp_percent}%` : '—' },
        ].map(s => (
          <div key={s.label} className="card" style={{ marginBottom: 0, padding: '14px 16px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: s.warn ? '#791f1f' : '#2C1A0E' }}>{s.value}</div>
            <div style={{ fontSize: 10, color: '#C49A6C', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="card-title" style={{ marginBottom: 0, paddingBottom: 0, border: 'none' }}>Project Details</h3>
          {isManager && (
            <button onClick={() => { setEditing(e => !e); setForm({ ...project }); }} className="btn btn-outline btn-sm">
              {editing ? 'Cancel' : 'Edit'}
            </button>
          )}
        </div>

        {error && <div className="alert alert-danger">{error}</div>}

        {editing ? (
          <div style={{ display: 'grid', gap: 14 }}>
            <div className="grid grid-cols-2 gap-3">
              <div style={{ gridColumn: '1/-1' }}>
                <label className="form-label">Project Name</label>
                <input className="form-control" value={form.name || ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">Code</label>
                <input className="form-control" value={form.code || ''} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">Type</label>
                <select className="form-control" value={form.project_type || ''} onChange={e => setForm(f => ({ ...f, project_type: e.target.value }))}>
                  <option value="">—</option>
                  <option>Extension</option><option>Renovation</option>
                  <option>New Build</option><option>Commercial</option><option>Industrial</option>
                </select>
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label className="form-label">Location</label>
                <input className="form-control" value={form.location || ''} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">Start Date</label>
                <input type="date" className="form-control" value={form.start_date || ''} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">Target Completion</label>
                <input type="date" className="form-control" value={form.target_completion || ''} onChange={e => setForm(f => ({ ...f, target_completion: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">Foreman</label>
                <select className="form-control" value={form.foreman_id || ''} onChange={e => setForm(f => ({ ...f, foreman_id: e.target.value }))}>
                  <option value="">— None —</option>
                  {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Status</label>
                <select className="form-control" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                </select>
              </div>

              {/* Progress */}
              <div style={{ gridColumn: '1/-1' }}>
                <label className="form-label">Progress: {form.progress_percent || 0}%</label>
                <input type="range" min="0" max="100" value={form.progress_percent || 0}
                  onChange={e => setForm(f => ({ ...f, progress_percent: Number(e.target.value) }))}
                  style={{ width: '100%', accentColor: '#C9A84C' }} />
              </div>

              {/* Financials */}
              <div>
                <label className="form-label">Contract Value (RM)</label>
                <input type="number" className="form-control" value={form.contract_value || ''} onChange={e => setForm(f => ({ ...f, contract_value: Number(e.target.value) }))} />
              </div>
              <div>
                <label className="form-label">Deposit Received (RM)</label>
                <input type="number" className="form-control" value={form.deposit_received || ''} onChange={e => setForm(f => ({ ...f, deposit_received: Number(e.target.value) }))} />
              </div>
              <div>
                <label className="form-label">Progress Billed (RM)</label>
                <input type="number" className="form-control" value={form.progress_billed || ''} onChange={e => setForm(f => ({ ...f, progress_billed: Number(e.target.value) }))} />
              </div>
              <div>
                <label className="form-label">Total Collected (RM)</label>
                <input type="number" className="form-control" value={form.total_collected || ''} onChange={e => setForm(f => ({ ...f, total_collected: Number(e.target.value) }))} />
              </div>
              <div>
                <label className="form-label">GP% (gross profit)</label>
                <input type="number" step="0.1" className="form-control" value={form.gp_percent || ''} onChange={e => setForm(f => ({ ...f, gp_percent: Number(e.target.value) }))} />
              </div>
              <div>
                <label className="form-label">Est. Duration (days)</label>
                <input type="number" className="form-control" value={form.estimated_duration_days || ''} onChange={e => setForm(f => ({ ...f, estimated_duration_days: Number(e.target.value) }))} />
              </div>

              <div style={{ gridColumn: '1/-1' }}>
                <label className="form-label">Notes</label>
                <textarea className="form-control" rows={3} value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={save} disabled={saving} className="btn btn-primary">{saving ? 'Saving…' : 'Save Changes'}</button>
              <button onClick={() => setEditing(false)} className="btn btn-outline">Cancel</button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px', fontSize: 13 }}>
            {[
              ['Location', project.location],
              ['Type', project.project_type],
              ['Status', project.status],
              ['Foreman', project.foreman_name],
              ['Start Date', fmtDate(project.start_date)],
              ['Target Completion', fmtDate(project.target_completion)],
              ['Est. Duration', project.estimated_duration_days ? `${project.estimated_duration_days} days` : null],
              ['Labor Cost', fmt(project.total_labor_cost)],
              ['Material Cost', fmt(project.total_material_cost)],
            ].map(([label, val]) => val ? (
              <div key={label as string} style={{ borderBottom: '1px solid #F5EDD6', paddingBottom: 6 }}>
                <span style={{ color: '#C49A6C', fontSize: 11, display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
                <span style={{ color: '#2C1A0E', fontWeight: 500 }}>{val}</span>
              </div>
            ) : null)}
            {project.notes && (
              <div style={{ gridColumn: '1/-1', borderTop: '1px solid #F5EDD6', paddingTop: 8, marginTop: 4 }}>
                <span style={{ color: '#C49A6C', fontSize: 11, display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Notes</span>
                <p style={{ color: '#2C1A0E', whiteSpace: 'pre-wrap', margin: 0 }}>{project.notes}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tab: Milestones ────────────────────────────────────────────────────
function MilestonesTab({ projectId, milestones: initial, isManager }: {
  projectId: string; milestones: Milestone[]; isManager: boolean;
}) {
  const [milestones, setMilestones] = useState(initial);
  const [showAdd, setShowAdd]   = useState(false);
  const [addForm, setAddForm]   = useState({ name: '', planned_start: '', planned_end: '' });
  const [saving,  setSaving]    = useState<string | null>(null);
  const [editId,  setEditId]    = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Milestone>>({});

  async function updateMilestone(id: string, update: Partial<Milestone>) {
    setSaving(id);
    const res = await fetch(`/api/operations/milestones/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(update),
    });
    const data = await res.json();
    if (res.ok) setMilestones(ms => ms.map(m => m.id === id ? data : m));
    setSaving(null); setEditId(null);
  }

  async function addMilestone() {
    if (!addForm.name.trim()) return;
    setSaving('new');
    const res = await fetch('/api/operations/milestones', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId, ...addForm }),
    });
    const data = await res.json();
    if (res.ok) { setMilestones(ms => [...ms, data]); setShowAdd(false); setAddForm({ name: '', planned_start: '', planned_end: '' }); }
    setSaving(null);
  }

  async function deleteMilestone(id: string) {
    if (!confirm('Delete this milestone?')) return;
    await fetch(`/api/operations/milestones/${id}`, { method: 'DELETE' });
    setMilestones(ms => ms.filter(m => m.id !== id));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 style={{ fontFamily: 'Georgia, serif', fontSize: 16, fontWeight: 700, color: '#2C1A0E' }}>Construction Milestones</h3>
        {isManager && (
          <button onClick={() => setShowAdd(s => !s)} className="btn btn-outline btn-sm">+ Add Milestone</button>
        )}
      </div>

      {showAdd && (
        <div className="card" style={{ marginBottom: 16, background: '#FAF5E9' }}>
          <div className="grid grid-cols-3 gap-3">
            <div style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Milestone Name</label>
              <input className="form-control" value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Foundation & Footing" />
            </div>
            <div>
              <label className="form-label">Planned Start</label>
              <input type="date" className="form-control" value={addForm.planned_start} onChange={e => setAddForm(f => ({ ...f, planned_start: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Planned End</label>
              <input type="date" className="form-control" value={addForm.planned_end} onChange={e => setAddForm(f => ({ ...f, planned_end: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={addMilestone} disabled={saving === 'new'} className="btn btn-primary btn-sm">Add</button>
            <button onClick={() => setShowAdd(false)} className="btn btn-outline btn-sm">Cancel</button>
          </div>
        </div>
      )}

      {milestones.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '32px 16px', color: '#C49A6C' }}>
          No milestones yet. {isManager && 'Add milestones to track construction stages.'}
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          {/* Timeline line */}
          <div style={{ position: 'absolute', left: 20, top: 20, bottom: 20, width: 2, background: '#E8D5A3', zIndex: 0 }} />

          {milestones.map((m, idx) => {
            const sc = MILESTONE_STATUS_COLORS[m.status] || MILESTONE_STATUS_COLORS.pending;
            const isEditing = editId === m.id;
            return (
              <div key={m.id} style={{ display: 'flex', gap: 16, marginBottom: 16, position: 'relative', zIndex: 1 }}>
                {/* Circle indicator */}
                <div style={{
                  width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                  background: sc.bg, border: `2px solid ${sc.text}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 700, color: sc.text,
                }}>
                  {m.status === 'completed' ? '✓' : idx + 1}
                </div>

                <div className="card" style={{ flex: 1, marginBottom: 0 }}>
                  {isEditing ? (
                    <div style={{ display: 'grid', gap: 10 }}>
                      <input className="form-control" value={editForm.name || ''} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="form-label">Status</label>
                          <select className="form-control" value={editForm.status || ''} onChange={e => setEditForm(f => ({ ...f, status: e.target.value as Milestone['status'] }))}>
                            <option value="pending">Pending</option>
                            <option value="in_progress">In Progress</option>
                            <option value="completed">Completed</option>
                            <option value="delayed">Delayed</option>
                          </select>
                        </div>
                        <div>
                          <label className="form-label">Actual Start</label>
                          <input type="date" className="form-control" value={editForm.actual_start || ''} onChange={e => setEditForm(f => ({ ...f, actual_start: e.target.value }))} />
                        </div>
                        <div>
                          <label className="form-label">Planned Start</label>
                          <input type="date" className="form-control" value={editForm.planned_start || ''} onChange={e => setEditForm(f => ({ ...f, planned_start: e.target.value }))} />
                        </div>
                        <div>
                          <label className="form-label">Planned End</label>
                          <input type="date" className="form-control" value={editForm.planned_end || ''} onChange={e => setEditForm(f => ({ ...f, planned_end: e.target.value }))} />
                        </div>
                        <div>
                          <label className="form-label">Actual End</label>
                          <input type="date" className="form-control" value={editForm.actual_end || ''} onChange={e => setEditForm(f => ({ ...f, actual_end: e.target.value }))} />
                        </div>
                      </div>
                      <textarea className="form-control" rows={2} placeholder="Notes…" value={editForm.notes || ''} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
                      <div className="flex gap-2">
                        <button onClick={() => updateMilestone(m.id, editForm)} disabled={saving === m.id} className="btn btn-primary btn-sm">Save</button>
                        <button onClick={() => setEditId(null)} className="btn btn-outline btn-sm">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span style={{ fontWeight: 600, color: '#2C1A0E', fontSize: 14 }}>{m.name}</span>
                          <span className="badge ml-2" style={{ background: sc.bg, color: sc.text, fontSize: 10 }}>{sc.label}</span>
                        </div>
                        {isManager && (
                          <div className="flex gap-1">
                            <button onClick={() => { setEditId(m.id); setEditForm({ ...m }); }} className="btn btn-outline btn-sm" style={{ padding: '2px 8px' }}>Edit</button>
                            <button onClick={() => deleteMilestone(m.id)} className="btn btn-danger btn-sm" style={{ padding: '2px 8px' }}>×</button>
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', marginTop: 6, fontSize: 11, color: '#6B4A00' }}>
                        {m.planned_start && <span>Plan: {fmtDate(m.planned_start)} → {fmtDate(m.planned_end)}</span>}
                        {m.actual_start  && <span>Actual: {fmtDate(m.actual_start)} → {m.actual_end ? fmtDate(m.actual_end) : 'ongoing'}</span>}
                      </div>
                      {m.notes && <p style={{ fontSize: 12, color: '#6B4A00', marginTop: 4, marginBottom: 0 }}>{m.notes}</p>}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Tab: Daily Logs ────────────────────────────────────────────────────
function DailyLogsTab({ projectId, logs: initial, isManager }: {
  projectId: string; logs: DailyLog[]; isManager: boolean;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState('');
  const [toDate,   setToDate]   = useState('');
  const logs = initial.filter(l => {
    if (fromDate && l.log_date < fromDate) return false;
    if (toDate   && l.log_date > toDate)   return false;
    return true;
  });

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <h3 style={{ fontFamily: 'Georgia, serif', fontSize: 16, fontWeight: 700, color: '#2C1A0E' }}>Daily Logs</h3>
        <div className="flex items-center gap-2 flex-wrap">
          <input type="date" className="form-control" style={{ width: 'auto' }} value={fromDate} onChange={e => setFromDate(e.target.value)} placeholder="From" />
          <span style={{ color: '#C49A6C', fontSize: 12 }}>to</span>
          <input type="date" className="form-control" style={{ width: 'auto' }} value={toDate} onChange={e => setToDate(e.target.value)} />
          <Link href={`/operations/daily-log/new?project_id=${projectId}`} className="btn btn-primary btn-sm">+ Add Log</Link>
        </div>
      </div>

      {logs.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '32px 16px', color: '#C49A6C' }}>
          No daily logs {fromDate || toDate ? 'in this date range.' : 'yet.'}
          <div style={{ marginTop: 12 }}>
            <Link href={`/operations/daily-log/new?project_id=${projectId}`} className="btn btn-primary btn-sm">Submit First Log</Link>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {logs.map(log => (
            <div key={log.id} className="card" style={{ marginBottom: 0 }}>
              <div className="flex items-start justify-between gap-3 cursor-pointer" onClick={() => setExpanded(expanded === log.id ? null : log.id)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 20 }}>{WEATHER_ICONS[log.weather] || '☀️'}</span>
                  <div>
                    <div style={{ fontWeight: 600, color: '#2C1A0E', fontSize: 14 }}>{fmtDate(log.log_date)}</div>
                    <div style={{ fontSize: 12, color: '#6B4A00' }}>
                      By {log.users?.username || '—'} · {log.workers_present ?? '?'} workers · {log.weather}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {log.issues_found && <span className="badge" style={{ background: '#fcebeb', color: '#791f1f', fontSize: 10 }}>⚠️ Issue</span>}
                  {log.photo_url    && <span className="badge" style={{ background: '#dbeafe', color: '#1d4ed8', fontSize: 10 }}>📷</span>}
                  <span style={{ color: '#C49A6C', fontSize: 18 }}>{expanded === log.id ? '▲' : '▼'}</span>
                </div>
              </div>

              {expanded === log.id && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #F5EDD6' }}>
                  <div style={{ display: 'grid', gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 10, color: '#C49A6C', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Work Done Today</div>
                      <p style={{ margin: 0, color: '#2C1A0E', whiteSpace: 'pre-wrap' }}>{log.work_done}</p>
                    </div>
                    {log.issues_found && (
                      <div style={{ background: '#fcebeb', padding: '8px 12px', borderRadius: 6 }}>
                        <div style={{ fontSize: 10, color: '#791f1f', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Issues Found</div>
                        <p style={{ margin: 0, color: '#791f1f', whiteSpace: 'pre-wrap' }}>{log.issues_found}</p>
                      </div>
                    )}
                    {log.materials_used && (
                      <div>
                        <div style={{ fontSize: 10, color: '#C49A6C', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Materials Used</div>
                        <p style={{ margin: 0, color: '#2C1A0E' }}>{log.materials_used}</p>
                      </div>
                    )}
                    {log.photo_url && (
                      <div>
                        <div style={{ fontSize: 10, color: '#C49A6C', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Site Photo</div>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={log.photo_url} alt="Site" style={{ maxWidth: '100%', maxHeight: 240, borderRadius: 6, objectFit: 'cover' }} />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tab: Payment Stages ────────────────────────────────────────────────
function PaymentTab({ projectId, stages: initial, contractValue, isManager }: {
  projectId: string; stages: PaymentStage[]; contractValue: number | null; isManager: boolean;
}) {
  const [stages,  setStages]  = useState(initial);
  const [showAdd, setShowAdd] = useState(false);
  const [saving,  setSaving]  = useState<string|null>(null);
  const [editId,  setEditId]  = useState<string|null>(null);
  const [editForm, setEditForm] = useState<Partial<PaymentStage>>({});
  const [addForm, setAddForm] = useState({ stage_name: '', percentage: '', amount: '', due_date: '', status: 'pending' });

  const totalInvoiced = stages.reduce((s, p) => s + (p.invoiced_date ? Number(p.amount || 0) : 0), 0);
  const totalReceived = stages.reduce((s, p) => s + (p.received_date ? Number(p.amount || 0) : 0), 0);

  async function addStage() {
    if (!addForm.stage_name.trim()) return;
    setSaving('new');
    const res = await fetch('/api/operations/payment-stages', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId, ...addForm }),
    });
    const data = await res.json();
    if (res.ok) { setStages(ss => [...ss, data]); setShowAdd(false); }
    setSaving(null);
  }

  async function saveStage(id: string) {
    setSaving(id);
    const res = await fetch(`/api/operations/payment-stages/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editForm),
    });
    const data = await res.json();
    if (res.ok) { setStages(ss => ss.map(s => s.id === id ? data : s)); setEditId(null); }
    setSaving(null);
  }

  async function deleteStage(id: string) {
    if (!confirm('Delete this payment stage?')) return;
    await fetch(`/api/operations/payment-stages/${id}`, { method: 'DELETE' });
    setStages(ss => ss.filter(s => s.id !== id));
  }

  return (
    <div>
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Total Invoiced', value: fmt(totalInvoiced) },
          { label: 'Total Received', value: fmt(totalReceived) },
          { label: 'Outstanding',    value: fmt((contractValue || 0) - totalReceived) },
        ].map(s => (
          <div key={s.label} className="card" style={{ marginBottom: 0, padding: '12px 16px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#2C1A0E' }}>{s.value}</div>
            <div style={{ fontSize: 10, color: '#C49A6C', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mb-4">
        <h3 style={{ fontFamily: 'Georgia, serif', fontSize: 16, fontWeight: 700, color: '#2C1A0E' }}>Payment Stages</h3>
        {isManager && (
          <button onClick={() => setShowAdd(s => !s)} className="btn btn-outline btn-sm">+ Add Stage</button>
        )}
      </div>

      {showAdd && (
        <div className="card" style={{ marginBottom: 16, background: '#FAF5E9' }}>
          <div className="grid grid-cols-2 gap-3">
            <div style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Stage Name</label>
              <input className="form-control" value={addForm.stage_name} onChange={e => setAddForm(f => ({ ...f, stage_name: e.target.value }))} placeholder="e.g. Deposit 10%" />
            </div>
            <div>
              <label className="form-label">Percentage (%)</label>
              <input type="number" className="form-control" value={addForm.percentage} onChange={e => setAddForm(f => ({ ...f, percentage: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Amount (RM)</label>
              <input type="number" className="form-control" value={addForm.amount} onChange={e => setAddForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Due Date</label>
              <input type="date" className="form-control" value={addForm.due_date} onChange={e => setAddForm(f => ({ ...f, due_date: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Status</label>
              <select className="form-control" value={addForm.status} onChange={e => setAddForm(f => ({ ...f, status: e.target.value }))}>
                <option value="pending">Pending</option>
                <option value="invoiced">Invoiced</option>
                <option value="received">Received</option>
                <option value="overdue">Overdue</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={addStage} disabled={saving === 'new'} className="btn btn-primary btn-sm">Add</button>
            <button onClick={() => setShowAdd(false)} className="btn btn-outline btn-sm">Cancel</button>
          </div>
        </div>
      )}

      {stages.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '32px 16px', color: '#C49A6C' }}>
          No payment stages defined yet.
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="overflow-x-auto">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th className="table-th">#</th>
                  <th className="table-th">Stage</th>
                  <th className="table-th">%</th>
                  <th className="table-th">Amount</th>
                  <th className="table-th">Due</th>
                  <th className="table-th">Invoiced</th>
                  <th className="table-th">Received</th>
                  <th className="table-th">Status</th>
                  {isManager && <th className="table-th"></th>}
                </tr>
              </thead>
              <tbody>
                {stages.map(s => {
                  const sc = PAYMENT_STATUS_COLORS[s.status] || PAYMENT_STATUS_COLORS.pending;
                  if (editId === s.id) {
                    return (
                      <tr key={s.id} style={{ background: '#FAF5E9' }}>
                        <td className="table-td" colSpan={isManager ? 9 : 8}>
                          <div className="grid grid-cols-4 gap-2">
                            <div style={{ gridColumn: '1/3' }}>
                              <input className="form-control" value={editForm.stage_name || ''} onChange={e => setEditForm(f => ({ ...f, stage_name: e.target.value }))} />
                            </div>
                            <div>
                              <input type="number" className="form-control" placeholder="%" value={editForm.percentage ?? ''} onChange={e => setEditForm(f => ({ ...f, percentage: Number(e.target.value) }))} />
                            </div>
                            <div>
                              <input type="number" className="form-control" placeholder="RM" value={editForm.amount ?? ''} onChange={e => setEditForm(f => ({ ...f, amount: Number(e.target.value) }))} />
                            </div>
                            <div>
                              <input type="date" className="form-control" value={editForm.due_date || ''} onChange={e => setEditForm(f => ({ ...f, due_date: e.target.value }))} />
                            </div>
                            <div>
                              <input type="date" className="form-control" placeholder="Invoiced date" value={editForm.invoiced_date || ''} onChange={e => setEditForm(f => ({ ...f, invoiced_date: e.target.value }))} />
                            </div>
                            <div>
                              <input type="date" className="form-control" placeholder="Received date" value={editForm.received_date || ''} onChange={e => setEditForm(f => ({ ...f, received_date: e.target.value }))} />
                            </div>
                            <div>
                              <select className="form-control" value={editForm.status || ''} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}>
                                <option value="pending">Pending</option>
                                <option value="invoiced">Invoiced</option>
                                <option value="received">Received</option>
                                <option value="overdue">Overdue</option>
                              </select>
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => saveStage(s.id)} disabled={saving === s.id} className="btn btn-primary btn-sm">Save</button>
                              <button onClick={() => setEditId(null)} className="btn btn-outline btn-sm">Cancel</button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  }
                  return (
                    <tr key={s.id} className="table-tr">
                      <td className="table-td" style={{ fontSize: 12, color: '#C49A6C' }}>{s.sequence_order}</td>
                      <td className="table-td" style={{ fontWeight: 500 }}>{s.stage_name}</td>
                      <td className="table-td" style={{ fontSize: 12 }}>{s.percentage != null ? `${s.percentage}%` : '—'}</td>
                      <td className="table-td" style={{ fontSize: 12 }}>{fmt(s.amount)}</td>
                      <td className="table-td" style={{ fontSize: 12 }}>{fmtDate(s.due_date)}</td>
                      <td className="table-td" style={{ fontSize: 12 }}>{fmtDate(s.invoiced_date)}</td>
                      <td className="table-td" style={{ fontSize: 12 }}>{fmtDate(s.received_date)}</td>
                      <td className="table-td">
                        <span className="badge" style={{ background: sc.bg, color: sc.text, fontSize: 10 }}>{s.status}</span>
                      </td>
                      {isManager && (
                        <td className="table-td">
                          <div className="flex gap-1">
                            <button onClick={() => { setEditId(s.id); setEditForm({ ...s }); }} className="btn btn-outline btn-sm" style={{ padding: '2px 8px' }}>Edit</button>
                            <button onClick={() => deleteStage(s.id)} className="btn btn-danger btn-sm" style={{ padding: '2px 8px' }}>×</button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────
type Tab = 'overview' | 'milestones' | 'logs' | 'payments';

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { role, loaded } = useRole();
  const router = useRouter();
  const [data, setData]     = useState<{ project: Project; milestones: Milestone[]; logs: DailyLog[]; payment_stages: PaymentStage[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]       = useState<Tab>('overview');

  const isManager = role === 'owner' || role === 'admin';

  useEffect(() => {
    if (!loaded) return;
    if (role !== 'owner' && role !== 'admin' && role !== 'editor') { router.replace('/operations'); return; }
    fetch(`/api/operations/projects/${id}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [loaded, id, role, router]);

  if (!loaded || loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div style={{ height: 24, background: '#E8D5A3', borderRadius: 4, marginBottom: 8, width: 300 }} />
        <div style={{ height: 16, background: '#F5EDD6', borderRadius: 4, marginBottom: 24, width: 200 }} />
        <div className="card">
          <div style={{ height: 200, background: '#F5EDD6', borderRadius: 4 }} />
        </div>
      </div>
    );
  }

  if (!data?.project) {
    return <div className="max-w-5xl mx-auto px-4 py-12 text-center" style={{ color: '#C49A6C' }}>Project not found.</div>;
  }

  const { project, milestones, logs, payment_stages } = data;

  const TABS: { key: Tab; label: string }[] = [
    { key: 'overview',   label: 'Overview' },
    { key: 'milestones', label: `Milestones (${milestones.length})` },
    { key: 'logs',       label: `Daily Logs (${logs.length})` },
    { key: 'payments',   label: `Payments (${payment_stages.length})` },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Breadcrumb + header */}
      <div className="mb-4">
        <Link href="/operations/projects" style={{ fontSize: 12, color: '#C49A6C' }}>← Projects</Link>
      </div>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 22, fontWeight: 700, color: '#2C1A0E', marginBottom: 2 }}>
            {project.name}
          </h1>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
            {project.code && <span style={{ color: '#C49A6C' }}>{project.code}</span>}
            {project.location && <span style={{ color: '#6B4A00' }}>📍 {project.location}</span>}
            <span className="badge" style={project.status === 'active'
              ? { background: '#eaf3de', color: '#27500A' }
              : { background: '#F5EDD6', color: '#6B4A00' }}>
              {project.status}
            </span>
            {project.progress_percent != null && (
              <span style={{ color: '#6B4A00' }}>⬛ {project.progress_percent}% complete</span>
            )}
          </div>
        </div>
        <Link href={`/operations/daily-log/new?project_id=${id}`} className="btn btn-primary btn-sm shrink-0">
          + Log Today
        </Link>
      </div>

      {/* Tab bar */}
      <div style={{ borderBottom: '2px solid #E8D5A3', marginBottom: 20 }}>
        <div className="flex gap-0">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={tab === t.key
                ? { borderBottom: '2px solid #C9A84C', color: '#2C1A0E', fontWeight: 700, marginBottom: -2 }
                : { color: '#C49A6C' }}
              className="px-4 py-2 text-sm transition-colors">
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'overview'   && <OverviewTab project={project} isManager={isManager} onSaved={p => setData(d => d ? { ...d, project: p } : d)} />}
      {tab === 'milestones' && <MilestonesTab projectId={id} milestones={milestones} isManager={isManager} />}
      {tab === 'logs'       && <DailyLogsTab projectId={id} logs={logs} isManager={isManager} />}
      {tab === 'payments'   && <PaymentTab projectId={id} stages={payment_stages} contractValue={project.contract_value} isManager={isManager} />}
    </div>
  );
}
