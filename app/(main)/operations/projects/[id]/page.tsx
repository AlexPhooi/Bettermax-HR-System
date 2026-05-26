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
interface BonusPool {
  id: string; milestone_id: string; milestone_contract_value: number;
  total_bonus_pool: number; bonus_percent: number;
  status: 'locked'|'pending_approval'|'approved'|'distributed';
}
interface Worker {
  id: string; full_name: string; rank: string; daily_rate: number;
  is_allocated: boolean;
  allocation: { alloc_id: string; project_id: string; project_name: string; allocated_date: string } | null;
}
interface Material {
  id: string; material_name: string; unit: string | null; quantity: number;
  estimated_unit_cost: number; estimated_total_cost: number;
  actual_total_cost: number; required_by_date: string | null;
  order_by_date: string | null; ordered_date: string | null;
  received_date: string | null; supplier: string | null; status: string;
  notes: string | null; milestone_id: string | null;
  project_milestones: { name: string; sequence_order: number } | null;
}
interface DailyLog {
  id: string; log_date: string; weather: string; workers_present: number | null;
  work_done: string; issues_found: string | null; materials_used: string | null;
  photo_url: string | null; milestone_id: string | null;
  users: { username: string } | null;
}
interface PaymentStage {
  id: string; stage_name: string; sequence_order: number;
  percentage: number | null; amount: number | null;
  due_date: string | null; invoiced_date: string | null;
  received_date: string | null; status: string; notes: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────
const RANK_STYLE: Record<string, { bg: string; text: string }> = {
  Leader:  { bg: '#fef9c3', text: '#854d0e' },
  Core:    { bg: '#ffedd5', text: '#9a3412' },
  Pro:     { bg: '#f3e8ff', text: '#6b21a8' },
  Skilled: { bg: '#dcfce7', text: '#166534' },
  Support: { bg: '#dbeafe', text: '#1e40af' },
  Rookie:  { bg: '#f3f4f6', text: '#374151' },
};
const MILESTONE_STATUS_COLORS = {
  pending:     { bg: '#f3f4f6', text: '#6b7280', label: 'Pending' },
  in_progress: { bg: '#dbeafe', text: '#1d4ed8', label: 'In Progress' },
  completed:   { bg: '#eaf3de', text: '#27500A', label: 'Completed' },
  delayed:     { bg: '#fcebeb', text: '#791f1f', label: 'Delayed' },
};
const MATERIAL_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  planned:   { bg: '#f3f4f6', text: '#6b7280' },
  ordered:   { bg: '#dbeafe', text: '#1e40af' },
  received:  { bg: '#eaf3de', text: '#166534' },
  cancelled: { bg: '#fcebeb', text: '#791f1f' },
};
const PAYMENT_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending:  { bg: '#f3f4f6', text: '#6b7280' },
  invoiced: { bg: '#faeeda', text: '#633806' },
  received: { bg: '#eaf3de', text: '#27500A' },
  overdue:  { bg: '#fcebeb', text: '#791f1f' },
};
const WEATHER_ICONS: Record<string, string> = { sunny:'☀️', cloudy:'⛅', rainy:'🌧️', 'stopped work':'⛔' };

function fmt(n: number | null | undefined) {
  if (n == null) return '—';
  return 'RM ' + Number(n).toLocaleString('en-MY', { minimumFractionDigits: 0 });
}
function fmtDate(s: string | null) { return s ? new Date(s).toLocaleDateString('en-GB') : '—'; }

// ── Tab: Overview ──────────────────────────────────────────────────────
function OverviewTab({ project, isManager, onSaved }: { project: Project; isManager: boolean; onSaved: (p: Project) => void }) {
  const [editing, setEditing] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');
  const [form, setForm] = useState({ ...project });
  const [employees, setEmployees] = useState<{id:string;full_name:string}[]>([]);

  useEffect(() => {
    if (isManager) fetch('/api/employees?status=active').then(r=>r.json()).then(d=>setEmployees(Array.isArray(d)?d:[])).catch(()=>{});
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
            <button onClick={() => { setEditing(e=>!e); setForm({...project}); }} className="btn btn-outline btn-sm">
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
                <input className="form-control" value={form.name||''} onChange={e=>setForm(f=>({...f,name:e.target.value}))} />
              </div>
              <div><label className="form-label">Code</label><input className="form-control" value={form.code||''} onChange={e=>setForm(f=>({...f,code:e.target.value}))}/></div>
              <div>
                <label className="form-label">Type</label>
                <select className="form-control" value={form.project_type||''} onChange={e=>setForm(f=>({...f,project_type:e.target.value}))}>
                  <option value="">—</option>
                  <option>Extension</option><option>Renovation</option><option>New Build</option><option>Commercial</option><option>Industrial</option>
                </select>
              </div>
              <div style={{ gridColumn: '1/-1' }}><label className="form-label">Location</label><input className="form-control" value={form.location||''} onChange={e=>setForm(f=>({...f,location:e.target.value}))}/></div>
              <div><label className="form-label">Start Date</label><input type="date" className="form-control" value={form.start_date||''} onChange={e=>setForm(f=>({...f,start_date:e.target.value}))}/></div>
              <div><label className="form-label">Target Completion</label><input type="date" className="form-control" value={form.target_completion||''} onChange={e=>setForm(f=>({...f,target_completion:e.target.value}))}/></div>
              <div>
                <label className="form-label">Foreman</label>
                <select className="form-control" value={form.foreman_id||''} onChange={e=>setForm(f=>({...f,foreman_id:e.target.value}))}>
                  <option value="">— None —</option>
                  {employees.map(emp=><option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Status</label>
                <select className="form-control" value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))}>
                  <option value="active">Active</option><option value="completed">Completed</option>
                </select>
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label className="form-label">Progress: {form.progress_percent||0}%</label>
                <input type="range" min="0" max="100" value={form.progress_percent||0}
                  onChange={e=>setForm(f=>({...f,progress_percent:Number(e.target.value)}))}
                  style={{ width:'100%', accentColor:'#C9A84C' }} />
              </div>
              <div><label className="form-label">Contract Value (RM)</label><input type="number" className="form-control" value={form.contract_value||''} onChange={e=>setForm(f=>({...f,contract_value:Number(e.target.value)}))}/></div>
              <div><label className="form-label">Total Collected (RM)</label><input type="number" className="form-control" value={form.total_collected||''} onChange={e=>setForm(f=>({...f,total_collected:Number(e.target.value)}))}/></div>
              <div><label className="form-label">GP%</label><input type="number" step="0.1" className="form-control" value={form.gp_percent||''} onChange={e=>setForm(f=>({...f,gp_percent:Number(e.target.value)}))}/></div>
              <div><label className="form-label">Labor Cost (RM)</label><input type="number" className="form-control" value={form.total_labor_cost||''} onChange={e=>setForm(f=>({...f,total_labor_cost:Number(e.target.value)}))}/></div>
              <div style={{ gridColumn: '1/-1' }}><label className="form-label">Notes</label><textarea className="form-control" rows={3} value={form.notes||''} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/></div>
            </div>
            <div className="flex gap-3">
              <button onClick={save} disabled={saving} className="btn btn-primary">{saving?'Saving…':'Save Changes'}</button>
              <button onClick={()=>setEditing(false)} className="btn btn-outline">Cancel</button>
            </div>
          </div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px 24px', fontSize:13 }}>
            {[['Location',project.location],['Type',project.project_type],['Status',project.status],
              ['Foreman',project.foreman_name],['Start Date',fmtDate(project.start_date)],
              ['Target Completion',fmtDate(project.target_completion)],
              ['Labor Cost',fmt(project.total_labor_cost)],['Material Cost',fmt(project.total_material_cost)],
            ].map(([label,val])=>val?(
              <div key={label as string} style={{borderBottom:'1px solid #F5EDD6',paddingBottom:6}}>
                <span style={{color:'#C49A6C',fontSize:11,display:'block',textTransform:'uppercase',letterSpacing:'0.05em'}}>{label}</span>
                <span style={{color:'#2C1A0E',fontWeight:500}}>{val}</span>
              </div>
            ):null)}
            {project.notes&&<div style={{gridColumn:'1/-1',borderTop:'1px solid #F5EDD6',paddingTop:8}}>
              <span style={{color:'#C49A6C',fontSize:11,display:'block',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:4}}>Notes</span>
              <p style={{color:'#2C1A0E',whiteSpace:'pre-wrap',margin:0}}>{project.notes}</p>
            </div>}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tab: Milestones + Bonus ────────────────────────────────────────────
function MilestonesTab({ projectId, milestones: initial, isManager, isOwner, role }: {
  projectId: string; milestones: Milestone[]; isManager: boolean; isOwner: boolean; role: string;
}) {
  const [milestones, setMilestones] = useState(initial);
  const [bonusPools, setBonusPools] = useState<BonusPool[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ name:'', planned_start:'', planned_end:'' });
  const [saving,  setSaving]  = useState<string|null>(null);
  const [editId,  setEditId]  = useState<string|null>(null);
  const [editForm, setEditForm] = useState<Partial<Milestone & { milestone_contract_value?: number }>>({});

  useEffect(() => {
    fetch(`/api/operations/bonus?project_id=${projectId}`)
      .then(r=>r.json()).then(d=>setBonusPools(d.pools||[])).catch(()=>{});
  }, [projectId]);

  function bonusForMilestone(mid: string) {
    return bonusPools.find(b=>b.milestone_id===mid)||null;
  }

  async function updateMilestone(id: string, update: Record<string, unknown>) {
    setSaving(id);
    const res = await fetch(`/api/operations/milestones/${id}`, {
      method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(update),
    });
    const data = await res.json();
    if (res.ok) {
      setMilestones(ms=>ms.map(m=>m.id===id?data:m));
      // Refresh bonus pools
      fetch(`/api/operations/bonus?project_id=${projectId}`).then(r=>r.json()).then(d=>setBonusPools(d.pools||[]));
    }
    setSaving(null); setEditId(null);
  }

  async function addMilestone() {
    if (!addForm.name.trim()) return;
    setSaving('new');
    const res = await fetch('/api/operations/milestones', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ project_id:projectId, ...addForm }),
    });
    const data = await res.json();
    if (res.ok) { setMilestones(ms=>[...ms,data]); setShowAdd(false); setAddForm({name:'',planned_start:'',planned_end:''}); }
    setSaving(null);
  }

  async function deleteMilestone(id: string) {
    if (!confirm('Delete this milestone?')) return;
    await fetch(`/api/operations/milestones/${id}`,{method:'DELETE'});
    setMilestones(ms=>ms.filter(m=>m.id!==id));
  }

  async function doBonus(poolId: string, action: 'approve'|'distribute') {
    if (!confirm(action==='approve'?'Approve this bonus?':'Mark as distributed?')) return;
    setSaving(poolId);
    const res = await fetch(`/api/operations/bonus/${poolId}`, {
      method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({action}),
    });
    if (res.ok) fetch(`/api/operations/bonus?project_id=${projectId}`).then(r=>r.json()).then(d=>setBonusPools(d.pools||[]));
    setSaving(null);
  }

  const canEdit = isManager || role === 'editor';

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 style={{ fontFamily:'Georgia,serif', fontSize:16, fontWeight:700, color:'#2C1A0E' }}>Construction Milestones</h3>
        {isManager && <button onClick={()=>setShowAdd(s=>!s)} className="btn btn-outline btn-sm">+ Add Milestone</button>}
      </div>

      {showAdd && (
        <div className="card" style={{ marginBottom:16, background:'#FAF5E9' }}>
          <div className="grid grid-cols-3 gap-3">
            <div style={{ gridColumn:'1/-1' }}>
              <label className="form-label">Milestone Name</label>
              <input className="form-control" value={addForm.name} onChange={e=>setAddForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Foundation & Footing"/>
            </div>
            <div><label className="form-label">Planned Start</label><input type="date" className="form-control" value={addForm.planned_start} onChange={e=>setAddForm(f=>({...f,planned_start:e.target.value}))}/></div>
            <div><label className="form-label">Planned End</label><input type="date" className="form-control" value={addForm.planned_end} onChange={e=>setAddForm(f=>({...f,planned_end:e.target.value}))}/></div>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={addMilestone} disabled={saving==='new'} className="btn btn-primary btn-sm">Add</button>
            <button onClick={()=>setShowAdd(false)} className="btn btn-outline btn-sm">Cancel</button>
          </div>
        </div>
      )}

      {milestones.length === 0 ? (
        <div className="card" style={{textAlign:'center',padding:'32px',color:'#C49A6C'}}>No milestones yet.</div>
      ) : (
        <div style={{ position:'relative' }}>
          <div style={{ position:'absolute', left:20, top:20, bottom:20, width:2, background:'#E8D5A3', zIndex:0 }} />
          {milestones.map((m, idx) => {
            const sc = MILESTONE_STATUS_COLORS[m.status]||MILESTONE_STATUS_COLORS.pending;
            const bonus = bonusForMilestone(m.id);
            const isEditing = editId === m.id;
            return (
              <div key={m.id} style={{ display:'flex', gap:16, marginBottom:16, position:'relative', zIndex:1 }}>
                <div style={{ width:40, height:40, borderRadius:'50%', flexShrink:0, background:sc.bg, border:`2px solid ${sc.text}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:sc.text }}>
                  {m.status==='completed'?'✓':idx+1}
                </div>
                <div className="card" style={{ flex:1, marginBottom:0 }}>
                  {isEditing ? (
                    <div style={{ display:'grid', gap:10 }}>
                      <input className="form-control" value={editForm.name||''} onChange={e=>setEditForm(f=>({...f,name:e.target.value}))}/>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="form-label">Status</label>
                          <select className="form-control" value={editForm.status||''} onChange={e=>setEditForm(f=>({...f,status:e.target.value as Milestone['status']}))}>
                            <option value="pending">Pending</option>
                            <option value="in_progress">In Progress</option>
                            <option value="completed">Completed</option>
                            <option value="delayed">Delayed</option>
                          </select>
                        </div>
                        <div>
                          <label className="form-label">Milestone Value (RM)</label>
                          <input type="number" className="form-control" value={editForm.milestone_contract_value||''} onChange={e=>setEditForm(f=>({...f,milestone_contract_value:Number(e.target.value)}))} placeholder="e.g. 50000"/>
                        </div>
                        <div><label className="form-label">Planned Start</label><input type="date" className="form-control" value={editForm.planned_start||''} onChange={e=>setEditForm(f=>({...f,planned_start:e.target.value}))}/></div>
                        <div><label className="form-label">Planned End</label><input type="date" className="form-control" value={editForm.planned_end||''} onChange={e=>setEditForm(f=>({...f,planned_end:e.target.value}))}/></div>
                        <div><label className="form-label">Actual Start</label><input type="date" className="form-control" value={editForm.actual_start||''} onChange={e=>setEditForm(f=>({...f,actual_start:e.target.value}))}/></div>
                        <div><label className="form-label">Actual End</label><input type="date" className="form-control" value={editForm.actual_end||''} onChange={e=>setEditForm(f=>({...f,actual_end:e.target.value}))}/></div>
                      </div>
                      <textarea className="form-control" rows={2} placeholder="Notes…" value={editForm.notes||''} onChange={e=>setEditForm(f=>({...f,notes:e.target.value}))}/>
                      <div className="flex gap-2">
                        <button onClick={()=>updateMilestone(m.id,editForm)} disabled={saving===m.id} className="btn btn-primary btn-sm">Save</button>
                        <button onClick={()=>setEditId(null)} className="btn btn-outline btn-sm">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span style={{ fontWeight:600, color:'#2C1A0E', fontSize:14 }}>{m.name}</span>
                          <span className="badge ml-2" style={{background:sc.bg,color:sc.text,fontSize:10}}>{sc.label}</span>
                        </div>
                        <div className="flex gap-1">
                          {/* Mark complete button for foreman/admin */}
                          {canEdit && m.status !== 'completed' && (
                            <button onClick={()=>updateMilestone(m.id,{status:'completed'})}
                              disabled={saving===m.id}
                              style={{fontSize:10,padding:'3px 10px',borderRadius:4,background:'#27500A',color:'white',border:'none',cursor:'pointer',fontWeight:600}}>
                              ✓ Mark Complete
                            </button>
                          )}
                          {isManager && (
                            <>
                              <button onClick={()=>{setEditId(m.id);setEditForm({...m,milestone_contract_value:bonus?.milestone_contract_value});}} className="btn btn-outline btn-sm" style={{padding:'2px 8px'}}>Edit</button>
                              <button onClick={()=>deleteMilestone(m.id)} className="btn btn-danger btn-sm" style={{padding:'2px 8px'}}>×</button>
                            </>
                          )}
                        </div>
                      </div>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:'4px 16px', marginTop:6, fontSize:11, color:'#6B4A00' }}>
                        {m.planned_start && <span>Plan: {fmtDate(m.planned_start)} → {fmtDate(m.planned_end)}</span>}
                        {m.actual_start  && <span>Actual: {fmtDate(m.actual_start)} → {m.actual_end?fmtDate(m.actual_end):'ongoing'}</span>}
                      </div>
                      {/* Bonus pool info */}
                      {bonus && (
                        <div style={{ marginTop:8, padding:'8px 12px', background:'#FAF5E9', borderRadius:6, display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                          <span style={{ fontSize:12, color:'#633806' }}>🎁 Bonus pool: <strong>RM {Number(bonus.total_bonus_pool).toFixed(2)}</strong> ({bonus.bonus_percent}% of {fmt(bonus.milestone_contract_value)})</span>
                          <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:9999,
                            background: bonus.status==='distributed'?'#eaf3de':bonus.status==='approved'?'#dbeafe':bonus.status==='pending_approval'?'#faeeda':'#f3f4f6',
                            color:      bonus.status==='distributed'?'#27500A':bonus.status==='approved'?'#1e40af':bonus.status==='pending_approval'?'#633806':'#6b7280',
                          }}>{bonus.status.replace('_',' ')}</span>
                          {isOwner && bonus.status==='pending_approval' && (
                            <button onClick={()=>doBonus(bonus.id,'approve')} disabled={saving===bonus.id} style={{fontSize:10,padding:'3px 10px',borderRadius:4,background:'#27500A',color:'white',border:'none',cursor:'pointer',fontWeight:600}}>
                              Approve Bonus
                            </button>
                          )}
                          {isOwner && bonus.status==='approved' && (
                            <button onClick={()=>doBonus(bonus.id,'distribute')} disabled={saving===bonus.id} style={{fontSize:10,padding:'3px 10px',borderRadius:4,background:'#C9A84C',color:'#1E1400',border:'none',cursor:'pointer',fontWeight:600}}>
                              Distribute
                            </button>
                          )}
                        </div>
                      )}
                      {m.notes && <p style={{fontSize:12,color:'#6B4A00',marginTop:4,marginBottom:0}}>{m.notes}</p>}
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

// ── Tab: Manpower ──────────────────────────────────────────────────────
function ManpowerTab({ projectId, isManager }: { projectId: string; isManager: boolean }) {
  const [onProject, setOnProject] = useState<Worker[]>([]);
  const [available, setAvailable] = useState<Worker[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState<string|null>(null);
  const [allocDate, setAllocDate] = useState(new Date().toISOString().split('T')[0]);

  function load() {
    setLoading(true);
    fetch(`/api/operations/manpower?project_id=${projectId}`)
      .then(r=>r.json())
      .then(d => { setOnProject(d.on_project||[]); setAvailable(d.available||[]); setLoading(false); })
      .catch(()=>setLoading(false));
  }
  useEffect(()=>{ load(); }, [projectId]);

  async function allocate(empId: string) {
    setSaving(empId);
    const res = await fetch('/api/operations/manpower', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ employee_id:empId, project_id:projectId, allocated_date:allocDate }),
    });
    if (res.ok) load();
    setSaving(null);
  }

  async function release(allocId: string) {
    if (!confirm('Release this worker from this project?')) return;
    setSaving(allocId);
    const res = await fetch(`/api/operations/manpower/${allocId}`, {
      method:'PUT', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ released_date:new Date().toISOString().split('T')[0] }),
    });
    if (res.ok) load();
    setSaving(null);
  }

  if (loading) return <div style={{padding:24,color:'#C49A6C'}}>Loading workers…</div>;

  return (
    <div>
      <div style={{ background:'#F5EDD6', padding:'10px 16px', borderRadius:8, marginBottom:16, fontSize:13, color:'#2C1A0E', fontWeight:600 }}>
        👷 {onProject.length} worker{onProject.length!==1?'s':''} allocated to this project
      </div>

      {/* Workers on this project */}
      <div className="card" style={{ marginBottom:16 }}>
        <h3 style={{ fontFamily:'Georgia,serif', fontSize:14, fontWeight:700, color:'#2C1A0E', marginBottom:12 }}>
          Allocated to This Project
        </h3>
        {onProject.length === 0 ? (
          <p style={{color:'#C49A6C',fontSize:13}}>No workers allocated yet.</p>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {onProject.map(w => {
              const rs = RANK_STYLE[w.rank]||RANK_STYLE.Rookie;
              return (
                <div key={w.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', background:'#FAF5E9', borderRadius:6 }}>
                  <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:9999, background:rs.bg, color:rs.text, flexShrink:0 }}>
                    {w.rank}
                  </span>
                  <span style={{ flex:1, fontSize:13, color:'#2C1A0E', fontWeight:500 }}>{w.full_name}</span>
                  <span style={{ fontSize:11, color:'#C49A6C' }}>RM{w.daily_rate}/d</span>
                  {isManager && w.allocation && (
                    <button onClick={()=>release(w.allocation!.alloc_id)} disabled={saving===w.allocation.alloc_id}
                      className="btn btn-danger btn-sm" style={{padding:'2px 8px',fontSize:11}}>
                      Release
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Available workers */}
      {isManager && available.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 style={{ fontFamily:'Georgia,serif', fontSize:14, fontWeight:700, color:'#2C1A0E' }}>
              Available Workers ({available.length})
            </h3>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <label className="form-label" style={{ marginBottom:0 }}>Alloc. Date:</label>
              <input type="date" className="form-control" style={{ width:'auto' }} value={allocDate} onChange={e=>setAllocDate(e.target.value)} />
            </div>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {available.map(w => {
              const rs = RANK_STYLE[w.rank]||RANK_STYLE.Rookie;
              return (
                <div key={w.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', background:'#eaf3de', borderRadius:6 }}>
                  <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:9999, background:rs.bg, color:rs.text, flexShrink:0 }}>
                    {w.rank}
                  </span>
                  <span style={{ flex:1, fontSize:13, color:'#2C1A0E', fontWeight:500 }}>{w.full_name}</span>
                  <span style={{ fontSize:11, color:'#C49A6C' }}>RM{w.daily_rate}/d</span>
                  <button onClick={()=>allocate(w.id)} disabled={saving===w.id}
                    className="btn btn-success btn-sm" style={{padding:'2px 10px',fontSize:11}}>
                    {saving===w.id?'…':'+ Allocate'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab: Materials ─────────────────────────────────────────────────────
function MaterialsTab({ projectId, milestones, isManager }: { projectId: string; milestones: Milestone[]; isManager: boolean }) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [showAdd,   setShowAdd]   = useState(false);
  const [saving,    setSaving]    = useState<string|null>(null);
  const [editId,    setEditId]    = useState<string|null>(null);
  const [editForm,  setEditForm]  = useState<Partial<Material>>({});
  const [addForm,   setAddForm]   = useState({
    material_name:'', unit:'', quantity:'', estimated_unit_cost:'', estimated_total_cost:'',
    required_by_date:'', order_by_date:'', supplier:'', milestone_id:'', status:'planned', notes:'',
  });

  const today  = new Date().toISOString().split('T')[0];
  const in7    = new Date(Date.now()+7*86400000).toISOString().split('T')[0];

  function load() {
    setLoading(true);
    fetch(`/api/operations/materials?project_id=${projectId}`)
      .then(r=>r.json()).then(d=>{setMaterials(Array.isArray(d)?d:[]);setLoading(false);}).catch(()=>setLoading(false));
  }
  useEffect(()=>{load();},[projectId]);

  async function addMaterial() {
    if (!addForm.material_name.trim()) return;
    setSaving('new');
    const res = await fetch('/api/operations/materials', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ project_id:projectId, ...addForm }),
    });
    const data = await res.json();
    if (res.ok) { setMaterials(ms=>[...ms,data]); setShowAdd(false); }
    setSaving(null);
  }

  async function saveMaterial(id: string) {
    setSaving(id);
    const res = await fetch(`/api/operations/materials/${id}`, {
      method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(editForm),
    });
    const data = await res.json();
    if (res.ok) { setMaterials(ms=>ms.map(m=>m.id===id?data:m)); setEditId(null); }
    setSaving(null);
  }

  async function deleteMaterial(id: string) {
    if (!confirm('Delete this material?')) return;
    await fetch(`/api/operations/materials/${id}`,{method:'DELETE'});
    setMaterials(ms=>ms.filter(m=>m.id!==id));
  }

  const urgentCount = materials.filter(m => m.status==='planned' && m.order_by_date && m.order_by_date<=in7 && m.order_by_date>=today).length;

  if (loading) return <div style={{padding:24,color:'#C49A6C'}}>Loading materials…</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 style={{ fontFamily:'Georgia,serif', fontSize:16, fontWeight:700, color:'#2C1A0E' }}>Material Schedule</h3>
          {urgentCount > 0 && (
            <div style={{ background:'#faeeda', border:'1px solid #C9A84C', borderRadius:6, padding:'6px 12px', marginTop:6, fontSize:12, color:'#633806', fontWeight:600 }}>
              ⚠ {urgentCount} material{urgentCount>1?'s':''} need ordering within 7 days!
            </div>
          )}
        </div>
        {isManager && <button onClick={()=>setShowAdd(s=>!s)} className="btn btn-outline btn-sm">+ Add Material</button>}
      </div>

      {showAdd && (
        <div className="card" style={{ marginBottom:16, background:'#FAF5E9' }}>
          <div className="grid grid-cols-2 gap-3">
            <div style={{ gridColumn:'1/-1' }}>
              <label className="form-label">Material Name *</label>
              <input className="form-control" value={addForm.material_name} onChange={e=>setAddForm(f=>({...f,material_name:e.target.value}))} placeholder="e.g. OPC Cement 50kg"/>
            </div>
            <div><label className="form-label">Unit</label><input className="form-control" value={addForm.unit} onChange={e=>setAddForm(f=>({...f,unit:e.target.value}))} placeholder="bag, m³, pcs…"/></div>
            <div><label className="form-label">Quantity</label><input type="number" className="form-control" value={addForm.quantity} onChange={e=>setAddForm(f=>({...f,quantity:e.target.value}))}/></div>
            <div><label className="form-label">Unit Cost (RM)</label><input type="number" className="form-control" value={addForm.estimated_unit_cost} onChange={e=>setAddForm(f=>({...f,estimated_unit_cost:e.target.value}))}/></div>
            <div><label className="form-label">Total Est. Cost (RM)</label><input type="number" className="form-control" value={addForm.estimated_total_cost} onChange={e=>setAddForm(f=>({...f,estimated_total_cost:e.target.value}))}/></div>
            <div><label className="form-label">Required By</label><input type="date" className="form-control" value={addForm.required_by_date} onChange={e=>setAddForm(f=>({...f,required_by_date:e.target.value}))}/></div>
            <div><label className="form-label">Order By</label><input type="date" className="form-control" value={addForm.order_by_date} onChange={e=>setAddForm(f=>({...f,order_by_date:e.target.value}))}/></div>
            <div><label className="form-label">Supplier</label><input className="form-control" value={addForm.supplier} onChange={e=>setAddForm(f=>({...f,supplier:e.target.value}))}/></div>
            <div>
              <label className="form-label">Milestone</label>
              <select className="form-control" value={addForm.milestone_id} onChange={e=>setAddForm(f=>({...f,milestone_id:e.target.value}))}>
                <option value="">— General —</option>
                {milestones.map(m=><option key={m.id} value={m.id}>{m.sequence_order}. {m.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Status</label>
              <select className="form-control" value={addForm.status} onChange={e=>setAddForm(f=>({...f,status:e.target.value}))}>
                <option value="planned">Planned</option><option value="ordered">Ordered</option>
                <option value="received">Received</option><option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={addMaterial} disabled={saving==='new'} className="btn btn-primary btn-sm">Add</button>
            <button onClick={()=>setShowAdd(false)} className="btn btn-outline btn-sm">Cancel</button>
          </div>
        </div>
      )}

      {materials.length === 0 ? (
        <div className="card" style={{textAlign:'center',padding:'32px',color:'#C49A6C'}}>No materials scheduled yet.</div>
      ) : (
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          <div className="overflow-x-auto">
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead>
                <tr>
                  <th className="table-th">Material</th>
                  <th className="table-th">Milestone</th>
                  <th className="table-th">Qty</th>
                  <th className="table-th">Est. Cost</th>
                  <th className="table-th">Order By</th>
                  <th className="table-th">Supplier</th>
                  <th className="table-th">Status</th>
                  {isManager && <th className="table-th"></th>}
                </tr>
              </thead>
              <tbody>
                {materials.map(mat => {
                  const sc  = MATERIAL_STATUS_COLORS[mat.status]||MATERIAL_STATUS_COLORS.planned;
                  const isUrgent = mat.status==='planned' && mat.order_by_date && mat.order_by_date<=in7 && mat.order_by_date>=today;
                  if (editId===mat.id) {
                    return (
                      <tr key={mat.id} style={{background:'#FAF5E9'}}>
                        <td className="table-td" colSpan={isManager?8:7}>
                          <div className="grid grid-cols-3 gap-2">
                            <input className="form-control" value={editForm.material_name||''} onChange={e=>setEditForm(f=>({...f,material_name:e.target.value}))}/>
                            <input type="number" className="form-control" placeholder="Qty" value={editForm.quantity??''} onChange={e=>setEditForm(f=>({...f,quantity:Number(e.target.value)}))}/>
                            <input type="number" className="form-control" placeholder="Est. Total RM" value={editForm.estimated_total_cost??''} onChange={e=>setEditForm(f=>({...f,estimated_total_cost:Number(e.target.value)}))}/>
                            <input type="date" className="form-control" placeholder="Order by" value={editForm.order_by_date||''} onChange={e=>setEditForm(f=>({...f,order_by_date:e.target.value}))}/>
                            <input className="form-control" placeholder="Supplier" value={editForm.supplier||''} onChange={e=>setEditForm(f=>({...f,supplier:e.target.value}))}/>
                            <select className="form-control" value={editForm.status||''} onChange={e=>setEditForm(f=>({...f,status:e.target.value}))}>
                              <option value="planned">Planned</option><option value="ordered">Ordered</option>
                              <option value="received">Received</option><option value="cancelled">Cancelled</option>
                            </select>
                            <div className="flex gap-2">
                              <button onClick={()=>saveMaterial(mat.id)} disabled={saving===mat.id} className="btn btn-primary btn-sm">Save</button>
                              <button onClick={()=>setEditId(null)} className="btn btn-outline btn-sm">Cancel</button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  }
                  return (
                    <tr key={mat.id} className="table-tr" style={isUrgent?{background:'#faeeda'}:{}}>
                      <td className="table-td">
                        <div style={{fontWeight:500}}>{mat.material_name}</div>
                        {isUrgent && <div style={{fontSize:10,color:'#633806',fontWeight:600}}>⚠ Order by {fmtDate(mat.order_by_date)}</div>}
                      </td>
                      <td className="table-td" style={{fontSize:11,color:'#6B4A00'}}>
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {(mat.project_milestones as any)?.name||'General'}
                      </td>
                      <td className="table-td" style={{fontSize:12}}>{mat.quantity} {mat.unit||''}</td>
                      <td className="table-td" style={{fontSize:12}}>{fmt(mat.estimated_total_cost)}</td>
                      <td className="table-td" style={{fontSize:12}}>{fmtDate(mat.order_by_date)}</td>
                      <td className="table-td" style={{fontSize:12}}>{mat.supplier||'—'}</td>
                      <td className="table-td">
                        <span className="badge" style={{background:sc.bg,color:sc.text,fontSize:10}}>{mat.status}</span>
                      </td>
                      {isManager && (
                        <td className="table-td">
                          <div className="flex gap-1">
                            <button onClick={()=>{setEditId(mat.id);setEditForm({...mat});}} className="btn btn-outline btn-sm" style={{padding:'2px 8px'}}>Edit</button>
                            <button onClick={()=>deleteMaterial(mat.id)} className="btn btn-danger btn-sm" style={{padding:'2px 8px'}}>×</button>
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

// ── Tab: Daily Logs ────────────────────────────────────────────────────
function DailyLogsTab({ projectId, logs: initial, isManager }: { projectId: string; logs: DailyLog[]; isManager: boolean }) {
  const [expanded, setExpanded] = useState<string|null>(null);
  const [fromDate, setFromDate] = useState('');
  const [toDate,   setToDate]   = useState('');
  const logs = initial.filter(l=>{
    if (fromDate && l.log_date < fromDate) return false;
    if (toDate   && l.log_date > toDate)   return false;
    return true;
  });

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <h3 style={{ fontFamily:'Georgia,serif', fontSize:16, fontWeight:700, color:'#2C1A0E' }}>Daily Logs</h3>
        <div className="flex items-center gap-2 flex-wrap">
          <input type="date" className="form-control" style={{width:'auto'}} value={fromDate} onChange={e=>setFromDate(e.target.value)}/>
          <span style={{color:'#C49A6C',fontSize:12}}>to</span>
          <input type="date" className="form-control" style={{width:'auto'}} value={toDate} onChange={e=>setToDate(e.target.value)}/>
          <Link href={`/operations/daily-log/new?project_id=${projectId}`} className="btn btn-primary btn-sm">+ Add Log</Link>
        </div>
      </div>
      {logs.length===0 ? (
        <div className="card" style={{textAlign:'center',padding:'32px',color:'#C49A6C'}}>
          No logs {fromDate||toDate?'in this range.':'yet.'}
          <div style={{marginTop:12}}><Link href={`/operations/daily-log/new?project_id=${projectId}`} className="btn btn-primary btn-sm">Submit First Log</Link></div>
        </div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {logs.map(log=>(
            <div key={log.id} className="card" style={{marginBottom:0}}>
              <div className="flex items-start justify-between gap-3 cursor-pointer" onClick={()=>setExpanded(expanded===log.id?null:log.id)}>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <span style={{fontSize:20}}>{WEATHER_ICONS[log.weather]||'☀️'}</span>
                  <div>
                    <div style={{fontWeight:600,color:'#2C1A0E',fontSize:14}}>{fmtDate(log.log_date)}</div>
                    <div style={{fontSize:12,color:'#6B4A00'}}>{log.users?.username||'—'} · {log.workers_present??'?'} workers</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {log.issues_found && <span className="badge" style={{background:'#fcebeb',color:'#791f1f',fontSize:10}}>⚠️</span>}
                  {log.photo_url    && <span className="badge" style={{background:'#dbeafe',color:'#1d4ed8',fontSize:10}}>📷</span>}
                  <span style={{color:'#C49A6C',fontSize:18}}>{expanded===log.id?'▲':'▼'}</span>
                </div>
              </div>
              {expanded===log.id && (
                <div style={{marginTop:12,paddingTop:12,borderTop:'1px solid #F5EDD6',display:'grid',gap:10}}>
                  <div>
                    <div style={{fontSize:10,color:'#C49A6C',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:2}}>Work Done Today</div>
                    <p style={{margin:0,color:'#2C1A0E',whiteSpace:'pre-wrap'}}>{log.work_done}</p>
                  </div>
                  {log.issues_found && (
                    <div style={{background:'#fcebeb',padding:'8px 12px',borderRadius:6}}>
                      <div style={{fontSize:10,color:'#791f1f',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:2}}>Issues Found</div>
                      <p style={{margin:0,color:'#791f1f',whiteSpace:'pre-wrap'}}>{log.issues_found}</p>
                    </div>
                  )}
                  {log.materials_used && (
                    <div>
                      <div style={{fontSize:10,color:'#C49A6C',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:2}}>Materials Used</div>
                      <p style={{margin:0,color:'#2C1A0E'}}>{log.materials_used}</p>
                    </div>
                  )}
                  {log.photo_url && (
                    <div>
                      <div style={{fontSize:10,color:'#C49A6C',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:4}}>Site Photo</div>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={log.photo_url} alt="Site" style={{maxWidth:'100%',maxHeight:240,borderRadius:6,objectFit:'cover'}}/>
                    </div>
                  )}
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
function PaymentTab({ projectId, stages: initial, contractValue, isManager }: { projectId: string; stages: PaymentStage[]; contractValue: number | null; isManager: boolean }) {
  const [stages, setStages] = useState(initial);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState<string|null>(null);
  const [editId, setEditId] = useState<string|null>(null);
  const [editForm, setEditForm] = useState<Partial<PaymentStage>>({});
  const [addForm, setAddForm] = useState({ stage_name:'', percentage:'', amount:'', due_date:'', status:'pending' });

  const totalReceived = stages.reduce((s,p)=>s+(p.received_date?Number(p.amount||0):0),0);

  async function addStage() {
    if (!addForm.stage_name.trim()) return;
    setSaving('new');
    const res = await fetch('/api/operations/payment-stages', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ project_id:projectId, ...addForm }),
    });
    const data = await res.json();
    if (res.ok) { setStages(ss=>[...ss,data]); setShowAdd(false); }
    setSaving(null);
  }

  async function saveStage(id: string) {
    setSaving(id);
    const res = await fetch(`/api/operations/payment-stages/${id}`, {
      method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(editForm),
    });
    const data = await res.json();
    if (res.ok) { setStages(ss=>ss.map(s=>s.id===id?data:s)); setEditId(null); }
    setSaving(null);
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        {[{label:'Total Received',value:fmt(totalReceived)},{label:'Outstanding',value:fmt((contractValue||0)-totalReceived)},{label:'Stages',value:stages.length}].map(s=>(
          <div key={s.label} className="card" style={{marginBottom:0,padding:'12px 16px'}}>
            <div style={{fontSize:13,fontWeight:700,color:'#2C1A0E'}}>{s.value}</div>
            <div style={{fontSize:10,color:'#C49A6C',marginTop:2,textTransform:'uppercase',letterSpacing:'0.05em'}}>{s.label}</div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between mb-4">
        <h3 style={{ fontFamily:'Georgia,serif', fontSize:16, fontWeight:700, color:'#2C1A0E' }}>Payment Stages</h3>
        {isManager && <button onClick={()=>setShowAdd(s=>!s)} className="btn btn-outline btn-sm">+ Add Stage</button>}
      </div>
      {showAdd && (
        <div className="card" style={{marginBottom:16,background:'#FAF5E9'}}>
          <div className="grid grid-cols-2 gap-3">
            <div style={{gridColumn:'1/-1'}}><label className="form-label">Stage Name</label><input className="form-control" value={addForm.stage_name} onChange={e=>setAddForm(f=>({...f,stage_name:e.target.value}))} placeholder="e.g. Deposit 10%"/></div>
            <div><label className="form-label">%</label><input type="number" className="form-control" value={addForm.percentage} onChange={e=>setAddForm(f=>({...f,percentage:e.target.value}))}/></div>
            <div><label className="form-label">Amount (RM)</label><input type="number" className="form-control" value={addForm.amount} onChange={e=>setAddForm(f=>({...f,amount:e.target.value}))}/></div>
            <div><label className="form-label">Due Date</label><input type="date" className="form-control" value={addForm.due_date} onChange={e=>setAddForm(f=>({...f,due_date:e.target.value}))}/></div>
            <div><label className="form-label">Status</label>
              <select className="form-control" value={addForm.status} onChange={e=>setAddForm(f=>({...f,status:e.target.value}))}>
                <option value="pending">Pending</option><option value="invoiced">Invoiced</option><option value="received">Received</option><option value="overdue">Overdue</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={addStage} disabled={saving==='new'} className="btn btn-primary btn-sm">Add</button>
            <button onClick={()=>setShowAdd(false)} className="btn btn-outline btn-sm">Cancel</button>
          </div>
        </div>
      )}
      {stages.length===0 ? (
        <div className="card" style={{textAlign:'center',padding:'32px',color:'#C49A6C'}}>No payment stages yet.</div>
      ) : (
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          <div className="overflow-x-auto">
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead>
                <tr>
                  <th className="table-th">Stage</th><th className="table-th">%</th><th className="table-th">Amount</th>
                  <th className="table-th">Due</th><th className="table-th">Invoiced</th><th className="table-th">Received</th>
                  <th className="table-th">Status</th>{isManager&&<th className="table-th"></th>}
                </tr>
              </thead>
              <tbody>
                {stages.map(s=>{
                  const sc=PAYMENT_STATUS_COLORS[s.status]||PAYMENT_STATUS_COLORS.pending;
                  if (editId===s.id) return (
                    <tr key={s.id} style={{background:'#FAF5E9'}}>
                      <td className="table-td" colSpan={isManager?8:7}>
                        <div className="grid grid-cols-4 gap-2">
                          <input className="form-control" value={editForm.stage_name||''} onChange={e=>setEditForm(f=>({...f,stage_name:e.target.value}))}/>
                          <input type="number" className="form-control" placeholder="%" value={editForm.percentage??''} onChange={e=>setEditForm(f=>({...f,percentage:Number(e.target.value)}))}/>
                          <input type="number" className="form-control" placeholder="RM" value={editForm.amount??''} onChange={e=>setEditForm(f=>({...f,amount:Number(e.target.value)}))}/>
                          <input type="date" className="form-control" value={editForm.due_date||''} onChange={e=>setEditForm(f=>({...f,due_date:e.target.value}))}/>
                          <input type="date" className="form-control" placeholder="Invoiced" value={editForm.invoiced_date||''} onChange={e=>setEditForm(f=>({...f,invoiced_date:e.target.value}))}/>
                          <input type="date" className="form-control" placeholder="Received" value={editForm.received_date||''} onChange={e=>setEditForm(f=>({...f,received_date:e.target.value}))}/>
                          <select className="form-control" value={editForm.status||''} onChange={e=>setEditForm(f=>({...f,status:e.target.value}))}>
                            <option value="pending">Pending</option><option value="invoiced">Invoiced</option><option value="received">Received</option><option value="overdue">Overdue</option>
                          </select>
                          <div className="flex gap-2">
                            <button onClick={()=>saveStage(s.id)} disabled={saving===s.id} className="btn btn-primary btn-sm">Save</button>
                            <button onClick={()=>setEditId(null)} className="btn btn-outline btn-sm">Cancel</button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                  return (
                    <tr key={s.id} className="table-tr">
                      <td className="table-td" style={{fontWeight:500}}>{s.stage_name}</td>
                      <td className="table-td" style={{fontSize:12}}>{s.percentage!=null?`${s.percentage}%`:'—'}</td>
                      <td className="table-td" style={{fontSize:12}}>{fmt(s.amount)}</td>
                      <td className="table-td" style={{fontSize:12}}>{fmtDate(s.due_date)}</td>
                      <td className="table-td" style={{fontSize:12}}>{fmtDate(s.invoiced_date)}</td>
                      <td className="table-td" style={{fontSize:12}}>{fmtDate(s.received_date)}</td>
                      <td className="table-td"><span className="badge" style={{background:sc.bg,color:sc.text,fontSize:10}}>{s.status}</span></td>
                      {isManager&&<td className="table-td">
                        <div className="flex gap-1">
                          <button onClick={()=>{setEditId(s.id);setEditForm({...s});}} className="btn btn-outline btn-sm" style={{padding:'2px 8px'}}>Edit</button>
                        </div>
                      </td>}
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

// ── Main page ──────────────────────────────────────────────────────────
type Tab = 'overview'|'milestones'|'manpower'|'materials'|'logs'|'payments';

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { role, loaded } = useRole();
  const router = useRouter();
  const [data, setData] = useState<{ project: Project; milestones: Milestone[]; logs: DailyLog[]; payment_stages: PaymentStage[] }|null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');

  const isManager = role === 'owner' || role === 'admin';
  const isOwner   = role === 'owner';

  useEffect(()=>{
    if (!loaded) return;
    if (role!=='owner'&&role!=='admin'&&role!=='editor') { router.replace('/operations'); return; }
    fetch(`/api/operations/projects/${id}`)
      .then(r=>r.json()).then(d=>{setData(d);setLoading(false);}).catch(()=>setLoading(false));
  },[loaded,id,role,router]);

  if (!loaded||loading) return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div style={{height:24,background:'#E8D5A3',borderRadius:4,marginBottom:8,width:300}}/>
      <div className="card"><div style={{height:200,background:'#F5EDD6',borderRadius:4}}/></div>
    </div>
  );

  if (!data?.project) return <div className="max-w-5xl mx-auto px-4 py-12 text-center" style={{color:'#C49A6C'}}>Project not found.</div>;

  const { project, milestones, logs, payment_stages } = data;

  const TABS: { key: Tab; label: string }[] = [
    { key:'overview',   label:'Overview' },
    { key:'milestones', label:`Milestones (${milestones.length})` },
    { key:'manpower',   label:'Manpower' },
    { key:'materials',  label:'Materials' },
    { key:'logs',       label:`Daily Logs (${logs.length})` },
    { key:'payments',   label:`Payments (${payment_stages.length})` },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="mb-4">
        <Link href="/operations/projects" style={{fontSize:12,color:'#C49A6C'}}>← Projects</Link>
      </div>
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 style={{fontFamily:'Georgia,serif',fontSize:22,fontWeight:700,color:'#2C1A0E',marginBottom:2}}>{project.name}</h1>
          <div style={{display:'flex',gap:8,flexWrap:'wrap',fontSize:12}}>
            {project.code && <span style={{color:'#C49A6C'}}>{project.code}</span>}
            {project.location && <span style={{color:'#6B4A00'}}>📍 {project.location}</span>}
            <span className="badge" style={project.status==='active'?{background:'#eaf3de',color:'#27500A'}:{background:'#F5EDD6',color:'#6B4A00'}}>{project.status}</span>
            {project.progress_percent!=null&&<span style={{color:'#6B4A00'}}>⬛ {project.progress_percent}%</span>}
          </div>
        </div>
        <Link href={`/operations/daily-log/new?project_id=${id}`} className="btn btn-primary btn-sm shrink-0">+ Log Today</Link>
      </div>

      {/* Tab bar */}
      <div style={{borderBottom:'2px solid #E8D5A3',marginBottom:20,overflowX:'auto'}}>
        <div className="flex gap-0" style={{minWidth:'max-content'}}>
          {TABS.map(t=>(
            <button key={t.key} onClick={()=>setTab(t.key)}
              style={tab===t.key
                ?{borderBottom:'2px solid #C9A84C',color:'#2C1A0E',fontWeight:700,marginBottom:-2}
                :{color:'#C49A6C'}}
              className="px-4 py-2 text-sm transition-colors whitespace-nowrap">
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab==='overview'   && <OverviewTab project={project} isManager={isManager} onSaved={p=>setData(d=>d?{...d,project:p}:d)} />}
      {tab==='milestones' && <MilestonesTab projectId={id} milestones={milestones} isManager={isManager} isOwner={isOwner} role={role} />}
      {tab==='manpower'   && <ManpowerTab  projectId={id} isManager={isManager} />}
      {tab==='materials'  && <MaterialsTab  projectId={id} milestones={milestones} isManager={isManager} />}
      {tab==='logs'       && <DailyLogsTab  projectId={id} logs={logs} isManager={isManager} />}
      {tab==='payments'   && <PaymentTab    projectId={id} stages={payment_stages} contractValue={project.contract_value} isManager={isManager} />}
    </div>
  );
}
