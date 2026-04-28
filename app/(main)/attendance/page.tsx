'use client';
import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { formatDate, formatRM, getCurrentMonth } from '@/lib/utils';
import { useRole } from '@/lib/role-context';
import { calcHoursFromTimes, DEFAULT_SCHEDULE, WorkSchedule } from '@/lib/work-schedule';

// ── Types ─────────────────────────────────────────────────────────────
interface WorkerRow { employee_id: string; full_name: string; check_in_time: string; check_out_time: string; }

interface AttRecord {
  id: string;
  employee_id: string;
  project_id: string | null;
  work_date: string;
  hours_worked: number;
  days_worked: number;
  ot_hours: number;
  check_in_time:  string | null;
  check_out_time: string | null;
  notes: string | null;
  is_rework: boolean;
  status: string;
  site_clean: boolean;
  site_bonus: number;
  submitted_by: string | null;
  check_in_photo_url:   string | null;
  check_out_photo_url:  string | null;
  site_photo_front_url: string | null;
  site_photo_back_url:  string | null;
  site_photo_store_url: string | null;
  photo_url: string | null;
  employees: { full_name: string; daily_rate: number } | null;
  projects:  { name: string; code: string | null } | null;
}

interface EditEntry {
  id: string;
  attendance_id: string;
  edited_at: string;
  old_check_in_time:  string | null;
  new_check_in_time:  string | null;
  old_check_out_time: string | null;
  new_check_out_time: string | null;
  users: { username: string } | null;
}

interface AttGroup {
  key: string;
  work_date: string;
  project_id: string | null;
  project: { name: string; code: string | null } | null;
  records: AttRecord[];
  workerCount: number;
  totalGong: number;
  totalSalary: number;
  totalSiteBonus: number;
  totalAdvance: number;
  status: string; // dominant status
  check_in_photo_url:   string | null;
  check_out_photo_url:  string | null;
  site_photo_front_url: string | null;
  site_photo_back_url:  string | null;
  site_photo_store_url: string | null;
  submitted_by: string | null;
}

interface Employee {
  id: string; full_name: string; status: string;
  bank_name: string | null; bank_account: string | null;
}
interface Project  { id: string; name: string; code: string | null; status: string; }
interface Advance  { id: string; employee_id: string; advance_date: string | null; amount: number; }

const today = () => new Date().toISOString().split('T')[0];

// ── Shared helpers ─────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    draft:    'bg-gray-100 text-gray-500',
    pending:  'bg-yellow-100 text-yellow-700',
    approved: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
    mixed:    'bg-purple-100 text-purple-700',
  };
  const icons: Record<string, string> = { draft: '📝', pending: '🟡', approved: '✅', rejected: '❌', mixed: '⚡' };
  return (
    <span className={`badge text-xs ${cfg[status] || 'bg-gray-100 text-gray-500'}`}>
      {icons[status] || '?'} {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

/** Extract upload time from Supabase storage URL (filename contains ms timestamp) */
function getPhotoTime(url: string | null): string {
  if (!url) return '';
  const m = url.match(/_(\d{13})[._]/);
  if (!m) return '';
  return new Date(parseInt(m[1])).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function PhotoCard({ url, label }: { url: string | null; label: string }) {
  const time = getPhotoTime(url);
  return (
    <div className="flex flex-col items-center gap-1.5 min-w-[80px]">
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      {url
        ? <a href={url} target="_blank" rel="noopener noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={label} className="w-20 h-20 object-cover rounded-lg border border-gray-200 hover:opacity-80 transition" />
          </a>
        : <div className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-200 flex items-center justify-center text-gray-300 text-2xl">📷</div>
      }
      <p className="text-[10px] text-gray-400">{time || (url ? '—' : 'No photo')}</p>
    </div>
  );
}

// Inline photo upload button (uploads to storage, calls back with URL)
function PhotoUploadBtn({ url, type, photoLabel, onUrl }: {
  url: string | null; type: string; photoLabel?: string; onUrl: (u: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', type);
      if (photoLabel) fd.append('label', photoLabel);
      const res  = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok && data.url) onUrl(data.url);
    } finally { setUploading(false); if (ref.current) ref.current.value = ''; }
  }

  return (
    <>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      <button type="button" disabled={uploading} onClick={() => ref.current?.click()}
        className={`btn btn-sm text-xs ${url ? 'btn-outline' : 'btn-primary'}`}>
        {uploading ? '⏳' : url ? '↻' : '📷'}
      </button>
    </>
  );
}

// Hours & OT picker (button grid)
function HourPicker({ value, onChange, max, label, prefix = '' }: {
  value: number; onChange: (v: number) => void; max: number; label: string; prefix?: string;
}) {
  return (
    <div>
      <p className="form-label">{label}</p>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: max + 1 }, (_, i) => i).map(h => (
          <button key={h} type="button" onClick={() => onChange(h)}
            className={`min-w-[44px] h-10 rounded-lg border text-sm font-semibold transition-all
              ${value === h ? 'bg-primary text-white border-primary shadow-sm scale-105' : 'bg-white text-gray-600 border-gray-200 hover:border-primary hover:text-primary'}`}>
            {prefix}{h}h
          </button>
        ))}
      </div>
    </div>
  );
}

// Photo upload button for standalone use
function PhotoBtn({ label, url, onUrl, type, photoLabel }: {
  label: string; url: string | null; onUrl: (url: string) => void; type: string; photoLabel?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', type);
      if (photoLabel) fd.append('label', photoLabel);
      const res  = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok && data.url) onUrl(data.url);
    } finally { setUploading(false); if (ref.current) ref.current.value = ''; }
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      {url
        ? <a href={url} target="_blank" rel="noopener noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={label} className="w-20 h-20 object-cover rounded-lg border-2 border-green-400 hover:opacity-80 transition" />
          </a>
        : <div className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-300 text-3xl">📷</div>
      }
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      <button type="button" disabled={uploading} onClick={() => ref.current?.click()}
        className={`btn btn-sm text-xs ${url ? 'btn-outline' : 'btn-primary'}`}>
        {uploading ? '⏳' : url ? '↻ Replace' : '📷 Upload'}
      </button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// WORKER VIEW — own records only
// ══════════════════════════════════════════════════════════════════════
function WorkerView() {
  const [records,  setRecords]  = useState<AttRecord[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [filterMonth, setFilter] = useState(getCurrentMonth());

  useEffect(() => {
    setLoading(true);
    fetch(`/api/attendance?month=${filterMonth}`)
      .then(r => r.json())
      .then(d => { setRecords(Array.isArray(d) ? d : []); setLoading(false); });
  }, [filterMonth]);

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-primary mb-4">My Attendance</h1>
      <div className="card mb-4 p-4 flex gap-3 items-end">
        <div>
          <label className="form-label">Month</label>
          <input type="month" className="form-control" value={filterMonth} onChange={e => setFilter(e.target.value)} />
        </div>
      </div>
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? <div className="p-8 text-center text-gray-400">Loading…</div>
          : records.length === 0 ? <div className="p-8 text-center text-gray-400">No records found.</div>
          : (
            <table className="w-full">
              <thead><tr>
                <th className="table-th">Date</th>
                <th className="table-th">Project</th>
                <th className="table-th">Gong 工</th>
                <th className="table-th">OT</th>
                <th className="table-th">Site Bonus</th>
                <th className="table-th">Status</th>
              </tr></thead>
              <tbody>
                {records.map(r => (
                  <tr key={r.id} className="table-tr">
                    <td className="table-td whitespace-nowrap">{formatDate(r.work_date)}</td>
                    <td className="table-td">
                      {r.projects
                        ? <span className="badge bg-blue-100 text-blue-700">{r.projects.code || r.projects.name}</span>
                        : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="table-td font-semibold">{Number(r.days_worked).toFixed(2)} 工</td>
                    <td className="table-td text-gray-500">{Number(r.ot_hours) > 0 ? `+${Number(r.ot_hours)}h` : '—'}</td>
                    <td className="table-td">
                      {Number(r.site_bonus) > 0
                        ? <span className="badge bg-green-100 text-green-700">+RM{Number(r.site_bonus).toFixed(2)}</span>
                        : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="table-td"><StatusBadge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// COMPLETE SESSION CARD — one per active draft session (leader can have multiple)
// ══════════════════════════════════════════════════════════════════════
function CompleteSessionCard({ draftRecs, empList, projList, showAlert, onDone }: {
  draftRecs: AttRecord[];
  empList:   Employee[];
  projList:  Project[];
  showAlert: (msg: string, type?: 'success' | 'danger' | 'info') => void;
  onDone:    () => void;
}) {
  const [workerRows,    setWorkerRows]    = useState<WorkerRow[]>([]);
  const [newWorkerRows, setNewWorkerRows] = useState<WorkerRow[]>([]);
  const [bulkIn,    setBulkIn]    = useState('08:00');
  const [bulkOut,   setBulkOut]   = useState('18:00');
  const [addOpen,   setAddOpen]   = useState(false);
  const [addEmpId,  setAddEmpId]  = useState('');
  const [coPhoto,    setCoPhoto]    = useState<string | null>(null);
  const [frontPhoto, setFrontPhoto] = useState<string | null>(null);
  const [backPhoto,  setBackPhoto]  = useState<string | null>(null);
  const [storePhoto, setStorePhoto] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [schedule, setSchedule] = useState<WorkSchedule>(DEFAULT_SCHEDULE);

  const sessionProject      = projList.find(p => p.id === draftRecs[0]?.project_id);
  const sessionCheckInPhoto = draftRecs[0]?.check_in_photo_url || null;

  // Load work schedule from settings once
  useEffect(() => {
    fetch('/api/settings/app').then(r => r.json()).then(s => {
      if (s.work_schedule) {
        try { setSchedule(JSON.parse(s.work_schedule)); } catch { /* use default */ }
      }
    }).catch(() => {});
  }, []);

  const draftKey = draftRecs.map(r => r.id).join(',');
  useEffect(() => {
    if (!draftRecs.length || !empList.length) return;
    setWorkerRows(draftRecs.map(r => ({
      employee_id:    r.employee_id,
      full_name:      empList.find(e => e.id === r.employee_id)?.full_name || r.employee_id,
      check_in_time:  schedule.default_start,
      check_out_time: schedule.work_end,
    })));
    setNewWorkerRows([]); setAddOpen(false); setAddEmpId('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey, empList.length]);

  const draftedIds  = new Set(draftRecs.map(r => r.employee_id));
  const addedIds    = new Set(newWorkerRows.map(r => r.employee_id));
  const addableEmps = empList.filter(e => !draftedIds.has(e.id) && !addedIds.has(e.id));

  function updateRow(idx: number, field: 'check_in_time' | 'check_out_time', val: string, isNew = false) {
    if (isNew) setNewWorkerRows(rows => rows.map((r, i) => i === idx ? { ...r, [field]: val } : r));
    else       setWorkerRows(rows => rows.map((r, i) => i === idx ? { ...r, [field]: val } : r));
  }
  function applyBulk() {
    setWorkerRows(rows => rows.map(r => ({ ...r, check_in_time: bulkIn, check_out_time: bulkOut })));
    setNewWorkerRows(rows => rows.map(r => ({ ...r, check_in_time: bulkIn, check_out_time: bulkOut })));
  }
  function handleAddWorker() {
    const emp = empList.find(e => e.id === addEmpId);
    if (!emp) return;
    setNewWorkerRows(prev => [...prev, {
      employee_id:    emp.id,
      full_name:      emp.full_name,
      check_in_time:  schedule.default_start,
      check_out_time: schedule.work_end,
    }]);
    setAddEmpId(''); setAddOpen(false);
  }
  async function handleComplete() {
    if (!coPhoto) { showAlert('Check-out group photo is required.', 'danger'); return; }
    if (!workerRows.length) { showAlert('No workers in session.', 'danger'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/attendance/complete', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id:  draftRecs[0]?.project_id || null,
          work_date:   draftRecs[0]?.work_date || today(),
          workers:     workerRows.map(r => ({ employee_id: r.employee_id, check_in_time: r.check_in_time, check_out_time: r.check_out_time })),
          new_workers: newWorkerRows.map(r => ({ employee_id: r.employee_id, check_in_time: r.check_in_time, check_out_time: r.check_out_time })),
          check_out_photo_url:  coPhoto,
          site_photo_front_url: frontPhoto,
          site_photo_back_url:  backPhoto,
          site_photo_store_url: storePhoto,
        }),
      });
      const data = await res.json();
      if (!res.ok) { showAlert(data.error, 'danger'); return; }
      showAlert(`Submitted ${data.updated} record${data.updated !== 1 ? 's' : ''} for approval ✅`);
      onDone();
    } finally { setSaving(false); }
  }

  return (
    <div className="card space-y-5 border-l-4 border-primary">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-gray-800">
            Complete Attendance{sessionProject ? ` — ${sessionProject.name}` : ''}
          </h3>
          <p className="text-sm text-gray-500 mt-0.5">
            {draftRecs.length} worker{draftRecs.length !== 1 ? 's' : ''} checked in
          </p>
        </div>
        {sessionCheckInPhoto && (
          <a href={sessionCheckInPhoto} target="_blank" rel="noopener noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={sessionCheckInPhoto} alt="check-in" className="w-14 h-14 object-cover rounded-lg border-2 border-green-400 hover:opacity-80" />
          </a>
        )}
      </div>

      {/* Per-worker time table */}
      <div>
        <p className="form-label mb-2">Check-In / Check-Out Times</p>
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wide">
            <span>Worker</span>
            <span className="w-20 text-center">In</span>
            <span className="w-20 text-center">Out</span>
            <span className="w-12 text-right">工</span>
          </div>
          {workerRows.map((w, i) => {
            const { days_worked } = calcHoursFromTimes(w.check_in_time, w.check_out_time, schedule);
            return (
              <div key={w.employee_id} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 px-3 py-2.5 border-b border-gray-100 last:border-0">
                <span className="text-sm text-gray-800 truncate">{w.full_name}</span>
                <input type="time" value={w.check_in_time}
                  onChange={e => updateRow(i, 'check_in_time', e.target.value)}
                  className="w-20 text-sm border border-gray-200 rounded px-1 py-1 bg-white" />
                <input type="time" value={w.check_out_time}
                  onChange={e => updateRow(i, 'check_out_time', e.target.value)}
                  className="w-20 text-sm border border-gray-200 rounded px-1 py-1 bg-white" />
                <span className="w-12 text-right text-xs font-semibold text-primary">{days_worked.toFixed(2)}</span>
              </div>
            );
          })}
          {newWorkerRows.map((w, i) => {
            const { days_worked } = calcHoursFromTimes(w.check_in_time, w.check_out_time, schedule);
            return (
              <div key={w.employee_id} className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-2 px-3 py-2.5 border-b border-gray-100 bg-blue-50">
                <span className="text-sm text-blue-800 truncate">
                  {w.full_name} <span className="text-xs text-blue-400">(late)</span>
                </span>
                <input type="time" value={w.check_in_time}
                  onChange={e => updateRow(i, 'check_in_time', e.target.value, true)}
                  className="w-20 text-sm border border-blue-200 rounded px-1 py-1 bg-white" />
                <input type="time" value={w.check_out_time}
                  onChange={e => updateRow(i, 'check_out_time', e.target.value, true)}
                  className="w-20 text-sm border border-blue-200 rounded px-1 py-1 bg-white" />
                <span className="w-12 text-right text-xs font-semibold text-blue-600">{days_worked.toFixed(2)}</span>
                <button onClick={() => setNewWorkerRows(rows => rows.filter((_, idx) => idx !== i))}
                  className="text-red-400 hover:text-red-600 text-sm">✕</button>
              </div>
            );
          })}
        </div>

        {/* Set all times */}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <span className="text-xs text-gray-500 shrink-0">Set all:</span>
          <input type="time" value={bulkIn}  onChange={e => setBulkIn(e.target.value)}
            className="text-sm border border-gray-200 rounded px-1.5 py-1 bg-white w-24" />
          <span className="text-xs text-gray-400">→</span>
          <input type="time" value={bulkOut} onChange={e => setBulkOut(e.target.value)}
            className="text-sm border border-gray-200 rounded px-1.5 py-1 bg-white w-24" />
          <button onClick={applyBulk} className="btn btn-sm btn-outline text-xs px-3">Apply to all</button>
        </div>

        {/* Add late worker */}
        <div className="mt-2">
          {addOpen ? (
            <div className="flex items-center gap-2 mt-1">
              <select value={addEmpId} onChange={e => setAddEmpId(e.target.value)}
                className="flex-1 text-sm border border-gray-200 rounded px-2 py-1.5 bg-white">
                <option value="">Select worker…</option>
                {addableEmps.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select>
              <button onClick={handleAddWorker} disabled={!addEmpId} className="btn btn-sm btn-primary text-xs px-3">Add</button>
              <button onClick={() => { setAddOpen(false); setAddEmpId(''); }} className="btn btn-sm btn-outline text-xs">✕</button>
            </div>
          ) : (
            <button onClick={() => setAddOpen(true)}
              className="text-sm text-primary hover:underline flex items-center gap-1 mt-1">
              + Add late worker
            </button>
          )}
        </div>
      </div>

      <div>
        <p className="form-label mb-3">Group Photos</p>
        <div className="flex gap-6 flex-wrap">
          <PhotoBtn label="Check-Out Photo *" url={coPhoto} onUrl={setCoPhoto} type="check_out_photo" />
        </div>
      </div>
      <div>
        <p className="form-label mb-3">Site Photos (for bonus review)</p>
        <div className="flex gap-6 flex-wrap">
          <PhotoBtn label="Front"  url={frontPhoto} onUrl={setFrontPhoto} type="site_front" photoLabel="front" />
          <PhotoBtn label="Back"   url={backPhoto}  onUrl={setBackPhoto}  type="site_back"  photoLabel="back"  />
          <PhotoBtn label="Store"  url={storePhoto} onUrl={setStorePhoto} type="site_store" photoLabel="store" />
        </div>
        <p className="text-xs text-gray-400 mt-2">Boss reviews site photos to grant <strong>+RM10</strong> site bonus for workers ≥8h.</p>
      </div>
      <button type="button" disabled={saving} onClick={handleComplete} className="btn btn-primary w-full">
        {saving ? 'Submitting…' : '📤 Submit for Approval'}
      </button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// LEADER VIEW — check-in / complete + personal history
// ══════════════════════════════════════════════════════════════════════
function LeaderView() {
  const { employee_id: myEmpId } = useRole();

  const [empList,  setEmpList]  = useState<Employee[]>([]);
  const [projList, setProjList] = useState<Project[]>([]);
  const [todayRecs, setTodayRecs] = useState<AttRecord[]>([]);
  const [historyRecs, setHistoryRecs] = useState<AttRecord[]>([]);
  const [loading, setLoading]   = useState(true);
  const [alertMsg, setAlertMsg] = useState('');
  const [alertType, setAlertType] = useState<'success' | 'danger' | 'info'>('success');
  const [historyMonth, setHistoryMonth] = useState(getCurrentMonth());
  const [saving, setSaving] = useState(false);

  // Check-in form
  const [ciProject,  setCiProject]  = useState('');
  const [ciDate,     setCiDate]     = useState(today());
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [empSearch,  setEmpSearch]  = useState('');
  const [autoLoading, setAutoLoading] = useState(false);
  const [autoCount,   setAutoCount]   = useState<number | null>(null);
  const [ciPhoto,    setCiPhoto]    = useState<string | null>(null);


  function showAlert(msg: string, type: 'success' | 'danger' | 'info' = 'success') {
    setAlertMsg(msg); setAlertType(type); setTimeout(() => setAlertMsg(''), 5000);
  }

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [empRes, projRes, todayRes, histRes] = await Promise.all([
      fetch('/api/employees').then(r => r.json()),
      fetch('/api/projects').then(r => r.json()),
      fetch(`/api/attendance?date=${today()}`).then(r => r.json()),
      fetch(`/api/attendance?mode=personal&month=${historyMonth}`).then(r => r.json()),
    ]);
    setEmpList(Array.isArray(empRes)   ? empRes.filter((e: Employee) => e.status === 'active') : []);
    setProjList(Array.isArray(projRes) ? projRes : []);
    setTodayRecs(Array.isArray(todayRes) ? todayRes : []);
    setHistoryRecs(Array.isArray(histRes) ? histRes : []);
    setLoading(false);
  }, [historyMonth]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Auto-select workers from yesterday
  useEffect(() => {
    if (empList.length === 0) return;
    async function autoSelect() {
      setAutoLoading(true); setAutoCount(null);
      const d = new Date(ciDate + 'T00:00:00');
      d.setDate(d.getDate() - 1);
      const prev = d.toISOString().split('T')[0];
      const res = await fetch(`/api/attendance?date=${prev}`).then(r => r.json());
      if (Array.isArray(res)) {
        const activeIds = new Set(empList.map(e => e.id));
        const ids = new Set<string>(res.map((r: AttRecord) => r.employee_id).filter(id => activeIds.has(id)));
        setCheckedIds(ids); setAutoCount(ids.size);
      }
      setAutoLoading(false);
    }
    autoSelect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ciDate, empList]);

  const filteredEmps = useMemo(() =>
    empList.filter(e => !empSearch || e.full_name.toLowerCase().includes(empSearch.toLowerCase())),
    [empList, empSearch]
  );

  const allSelected = filteredEmps.length > 0 && filteredEmps.every(e => checkedIds.has(e.id));
  const activeProjects = projList.filter(p => p.status === 'active');

  // Group today's records by project — one session per project
  const draftSessions = useMemo(() => {
    const groups: Record<string, AttRecord[]> = {};
    for (const r of todayRecs.filter(r => r.status === 'draft')) {
      const key = r.project_id || 'none';
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    }
    return Object.values(groups);
  }, [todayRecs]);

  const submittedSessions = useMemo(() => {
    const groups: Record<string, AttRecord[]> = {};
    for (const r of todayRecs.filter(r => r.status !== 'draft')) {
      const key = r.project_id || 'none';
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    }
    return Object.values(groups).map(recs => ({
      recs,
      project: recs[0].projects,
      dominantStatus: recs.some(r => r.status === 'rejected') ? 'rejected'
        : recs.some(r => r.status === 'pending') ? 'pending' : 'approved',
    }));
  }, [todayRecs]);

  // Filter check-in project list to exclude projects that already have an active draft
  const draftedProjectIds = new Set(draftSessions.map(s => s[0]?.project_id));
  const availableProjects = activeProjects.filter(p => !draftedProjectIds.has(p.id));

  async function handleCheckIn() {
    if (checkedIds.size === 0) { showAlert('Select at least one worker.', 'danger'); return; }
    if (!ciPhoto) { showAlert('Check-in group photo is required.', 'danger'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/attendance', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'draft', project_id: ciProject || null, work_date: ciDate,
          employee_ids: Array.from(checkedIds), check_in_photo_url: ciPhoto }),
      });
      const data = await res.json();
      if (!res.ok) { showAlert(data.error, 'danger'); return; }
      const saved = data.inserted?.length || 0;
      showAlert(`Checked in ${saved} worker${saved !== 1 ? 's' : ''}${data.skipped?.length ? ` (${data.skipped.length} skipped)` : ''}.`);
      setCiPhoto(null); loadAll();
    } finally { setSaving(false); }
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Loading…</div>;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-primary">Attendance</h1>
      {alertMsg && <div className={`alert alert-${alertType}`}>{alertMsg}</div>}

      {/* ── Today ─── */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-3">
          📅 Today — {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
        </h2>

        {/* Status banners — one per submitted session */}
        {submittedSessions.map(s => {
          const key = s.recs[0]?.project_id || 'none';
          const projectName = s.project?.name || 'No project';
          return (
            <div key={key} className={`card border-l-4 mb-3 ${
              s.dominantStatus === 'approved' ? 'border-green-400 bg-green-50' :
              s.dominantStatus === 'rejected' ? 'border-red-400 bg-red-50' :
              'border-yellow-400 bg-yellow-50'
            }`}>
              <div className="flex items-center gap-3">
                <span className="text-2xl">
                  {s.dominantStatus === 'approved' ? '✅' : s.dominantStatus === 'rejected' ? '❌' : '🟡'}
                </span>
                <div>
                  <p className={`font-semibold ${
                    s.dominantStatus === 'approved' ? 'text-green-800' :
                    s.dominantStatus === 'rejected' ? 'text-red-800' : 'text-yellow-800'
                  }`}>
                    {projectName} —{' '}
                    {s.dominantStatus === 'approved' ? 'Approved' :
                     s.dominantStatus === 'rejected' ? 'Rejected — contact admin' :
                     'Submitted, awaiting approval'}
                  </p>
                  <p className={`text-sm mt-0.5 ${
                    s.dominantStatus === 'approved' ? 'text-green-700' :
                    s.dominantStatus === 'rejected' ? 'text-red-700' : 'text-yellow-700'
                  }`}>{s.recs.length} record{s.recs.length !== 1 ? 's' : ''}</p>
                </div>
              </div>
            </div>
          );
        })}

        {/* Complete cards — one per active draft session */}
        {draftSessions.map(recs => (
          <CompleteSessionCard
            key={recs[0]?.project_id || 'none'}
            draftRecs={recs}
            empList={empList}
            projList={projList}
            showAlert={showAlert}
            onDone={loadAll}
          />
        ))}

        {/* Check-In form — always visible so leader can start a new site */}
        <div className="card space-y-5">
          <h3 className="font-semibold text-gray-800">
            {draftSessions.length > 0 ? '+ Check In Another Site' : 'Morning Check-In'}
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Date</label>
              <input type="date" className="form-control" value={ciDate}
                onChange={e => { setCiDate(e.target.value); setCheckedIds(new Set()); setAutoCount(null); }} />
            </div>
            <div>
              <label className="form-label">Project</label>
              <select className="form-control" value={ciProject} onChange={e => setCiProject(e.target.value)}>
                <option value="">No project</option>
                {availableProjects.map(p => <option key={p.id} value={p.id}>{p.name}{p.code ? ` (${p.code})` : ''}</option>)}
              </select>
            </div>
          </div>
          <div className="flex items-start gap-5">
            <PhotoBtn label="Check-In Group Photo *" url={ciPhoto} onUrl={setCiPhoto} type="check_in_photo" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="form-label mb-0">
                Workers *{' '}{checkedIds.size > 0 && <span className="badge bg-primary text-white ml-1">{checkedIds.size} selected</span>}
              </label>
              <button type="button" className="text-xs text-primary underline"
                onClick={() => allSelected ? setCheckedIds(new Set()) : setCheckedIds(new Set(filteredEmps.map(e => e.id)))}>
                {allSelected ? 'Deselect All' : 'Select All'}
              </button>
            </div>
            {autoLoading && <div className="mb-2 text-xs text-gray-400 flex items-center gap-1">⏳ Auto-selecting from yesterday…</div>}
            {!autoLoading && autoCount !== null && (
              <div className={`mb-2 text-xs px-3 py-2 rounded border ${autoCount > 0 ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>
                {autoCount > 0 ? <>📋 <strong>{autoCount}</strong> workers auto-selected from yesterday. Untick anyone absent.</> : <>ℹ️ No yesterday records — select manually.</>}
              </div>
            )}
            <input className="form-control mb-2" placeholder="Search worker…" value={empSearch} onChange={e => setEmpSearch(e.target.value)} />
            <div className="border border-gray-200 rounded max-h-52 overflow-y-auto">
              {filteredEmps.map(emp => (
                <label key={emp.id}
                  className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50 border-b border-gray-50 last:border-0 transition-colors ${checkedIds.has(emp.id) ? 'bg-blue-50' : ''}`}>
                  <input type="checkbox" className="accent-primary" checked={checkedIds.has(emp.id)} onChange={() => {
                    setCheckedIds(prev => { const n = new Set(prev); n.has(emp.id) ? n.delete(emp.id) : n.add(emp.id); return n; });
                  }} />
                  <span className="text-sm">{emp.full_name}</span>
                  {emp.id === myEmpId && <span className="text-xs text-primary font-medium">(me)</span>}
                </label>
              ))}
            </div>
          </div>
          <button type="button" disabled={saving} onClick={handleCheckIn} className="btn btn-primary w-full">
            {saving ? 'Checking in…' : '✓ Check In'}
          </button>
        </div>
      </div>

      {/* ── My History ─── */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">My Attendance History</h2>
          <input type="month" className="form-control w-40" value={historyMonth} onChange={e => setHistoryMonth(e.target.value)} />
        </div>
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            {historyRecs.length === 0
              ? <div className="p-6 text-center text-gray-400 text-sm">No records for this month.</div>
              : (
                <table className="w-full">
                  <thead><tr>
                    <th className="table-th">Date</th>
                    <th className="table-th">Project</th>
                    <th className="table-th">Gong 工</th>
                    <th className="table-th">OT</th>
                    <th className="table-th">Site Bonus</th>
                    <th className="table-th">Status</th>
                  </tr></thead>
                  <tbody>
                    {historyRecs.map(r => (
                      <tr key={r.id} className="table-tr">
                        <td className="table-td whitespace-nowrap text-sm">{formatDate(r.work_date)}</td>
                        <td className="table-td">{r.projects ? <span className="badge bg-blue-100 text-blue-700">{r.projects.code || r.projects.name}</span> : <span className="text-gray-400">—</span>}</td>
                        <td className="table-td font-semibold">{Number(r.days_worked).toFixed(2)} 工</td>
                        <td className="table-td text-gray-500">{Number(r.ot_hours) > 0 ? `+${Number(r.ot_hours)}h` : '—'}</td>
                        <td className="table-td">{Number(r.site_bonus) > 0 ? <span className="badge bg-green-100 text-green-700">+RM{Number(r.site_bonus).toFixed(2)}</span> : <span className="text-gray-400">—</span>}</td>
                        <td className="table-td"><StatusBadge status={r.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// ADMIN VIEW — grouped by Date + Project, expandable Details
// ══════════════════════════════════════════════════════════════════════
const EMPTY_ADD = {
  work_date: today(), project_id: '', work_hours: 8, ot_hours: 0,
  site_clean: false, notes: '', status: 'approved',
};

function AdminView() {
  const [records,  setRecords]  = useState<AttRecord[]>([]);
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [projList, setProjList] = useState<Project[]>([]);
  const [empList,  setEmpList]  = useState<Employee[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [alertMsg, setAlertMsg] = useState('');
  const [alertType, setAlertType] = useState<'success' | 'danger' | 'info'>('success');
  const [filterMonth,   setFilterMonth]   = useState(getCurrentMonth());
  const [filterProject, setFilterProject] = useState('');
  const [filterStatus,  setFilterStatus]  = useState('');
  const [approving, setApproving] = useState<string | null>(null);
  const [expanded,  setExpanded] = useState<Set<string>>(new Set());

  // Per-group site-clean toggle (keyed by group key)
  const [siteCleanEdits, setSiteCleanEdits] = useState<Record<string, boolean>>({});
  // Per-record time edits (keyed by record id)
  const [recEdits, setRecEdits] = useState<Record<string, { check_in_time: string; check_out_time: string }>>({});
  // Records currently being saved
  const [savingRecs, setSavingRecs] = useState<Set<string>>(new Set());
  // Edit history per group key
  const [editHistory, setEditHistory] = useState<Record<string, EditEntry[]>>({});
  const [historyLoading, setHistoryLoading] = useState<Set<string>>(new Set());
  const [showHistory, setShowHistory] = useState<Set<string>>(new Set());
  // Schedule for real-time gong calc
  const [adminSchedule, setAdminSchedule] = useState<WorkSchedule>(DEFAULT_SCHEDULE);

  // Add Attendance modal
  const [showAddModal, setShowAddModal]   = useState(false);
  const [addForm, setAddForm]             = useState({ ...EMPTY_ADD });
  const [addSelectedIds, setAddSelectedIds] = useState<Set<string>>(new Set());
  const [addEmpSearch, setAddEmpSearch]   = useState('');
  const [addSaving, setAddSaving]         = useState(false);

  // Add Advance modal
  const [showAdvModal, setShowAdvModal]   = useState(false);
  const [advSelectedIds, setAdvSelectedIds] = useState<Set<string>>(new Set());
  const [advEmpSearch, setAdvEmpSearch]   = useState('');
  const [advSaving, setAdvSaving]         = useState(false);
  const [advSlipUploading, setAdvSlipUploading] = useState(false);
  const advSlipRef = useRef<HTMLInputElement>(null);

  // Bin
  const [binOpen,    setBinOpen]    = useState(false);
  const [binData,    setBinData]    = useState<{id: string; work_date: string; hours_worked: number; deleted_at: string; employees: {full_name: string} | null; projects: {name: string; code: string} | null}[] | null>(null);
  const [binLoading, setBinLoading] = useState(false);

  const [advForm, setAdvForm] = useState({
    advance_date: today(), month: getCurrentMonth().substring(0, 7),
    amount: '', detail_type: 'makan', detail_note: '',
    pay_by: 'cash',
    bank_name: '', account_name: '', account_no: '', bank_slip_url: '',
    bank_search_id: '',
  });

  function showAlert(msg: string, type: 'success' | 'danger' | 'info' = 'success') {
    setAlertMsg(msg); setAlertType(type); setTimeout(() => setAlertMsg(''), 5000);
  }

  const loadData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterMonth)   params.set('month',      filterMonth);
    if (filterProject) params.set('project_id', filterProject);
    if (filterStatus)  params.set('status',     filterStatus);
    const [recRes, projRes, advRes, empRes] = await Promise.all([
      fetch(`/api/attendance?${params}`).then(r => r.json()),
      fetch('/api/projects').then(r => r.json()),
      fetch(`/api/advances?month=${filterMonth}`).then(r => r.json()),
      fetch('/api/employees').then(r => r.json()),
    ]);
    setRecords(Array.isArray(recRes)  ? recRes  : []);
    setProjList(Array.isArray(projRes) ? projRes : []);
    setAdvances(Array.isArray(advRes) ? advRes  : []);
    setEmpList(Array.isArray(empRes)  ? empRes.filter((e: Employee) => e.status === 'active') : []);
    setLoading(false);
  }, [filterMonth, filterProject, filterStatus]);

  useEffect(() => { loadData(); }, [loadData]);

  // Advance lookup: employeeId_date → total amount
  const advanceMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const a of advances) {
      if (!a.advance_date) continue;
      const k = `${a.employee_id}_${a.advance_date}`;
      m[k] = (m[k] || 0) + Number(a.amount);
    }
    return m;
  }, [advances]);

  // Group records by date + project_id
  const groups = useMemo((): AttGroup[] => {
    const g: Record<string, AttGroup> = {};
    for (const rec of records) {
      const key = `${rec.work_date}__${rec.project_id || 'none'}`;
      if (!g[key]) {
        g[key] = {
          key, work_date: rec.work_date, project_id: rec.project_id, project: rec.projects,
          records: [], workerCount: 0, totalGong: 0, totalSalary: 0, totalSiteBonus: 0, totalAdvance: 0,
          status: rec.status, submitted_by: rec.submitted_by,
          check_in_photo_url: null, check_out_photo_url: null,
          site_photo_front_url: null, site_photo_back_url: null, site_photo_store_url: null,
        };
      }
      const grp = g[key];
      grp.records.push(rec);
      grp.totalGong      += Number(rec.days_worked);
      grp.totalSalary    += Number(rec.days_worked) * Number(rec.employees?.daily_rate || 0);
      grp.totalSiteBonus += Number(rec.site_bonus);
      grp.totalAdvance   += advanceMap[`${rec.employee_id}_${rec.work_date}`] || 0;
      // Grab first non-null photo for each type
      if (!grp.check_in_photo_url   && rec.check_in_photo_url)   grp.check_in_photo_url   = rec.check_in_photo_url;
      if (!grp.check_out_photo_url  && rec.check_out_photo_url)  grp.check_out_photo_url  = rec.check_out_photo_url;
      if (!grp.site_photo_front_url && rec.site_photo_front_url) grp.site_photo_front_url = rec.site_photo_front_url;
      if (!grp.site_photo_back_url  && rec.site_photo_back_url)  grp.site_photo_back_url  = rec.site_photo_back_url;
      if (!grp.site_photo_store_url && rec.site_photo_store_url) grp.site_photo_store_url = rec.site_photo_store_url;
    }
    for (const grp of Object.values(g)) {
      grp.workerCount = grp.records.length;
      const statuses = new Set(grp.records.map(r => r.status));
      grp.status = statuses.size === 1 ? grp.records[0].status : 'mixed';
    }
    return Object.values(g).sort((a, b) => b.work_date.localeCompare(a.work_date));
  }, [records, advanceMap]);

  // Load work schedule for real-time gong display
  useEffect(() => {
    fetch('/api/settings/app').then(r => r.json()).then(s => {
      if (s.work_schedule) try { setAdminSchedule(JSON.parse(s.work_schedule)); } catch { /* use default */ }
    }).catch(() => {});
  }, []);

  // Init site-clean edits for all visible groups
  useEffect(() => {
    const init: Record<string, boolean> = {};
    for (const grp of groups) {
      if (!Object.prototype.hasOwnProperty.call(siteCleanEdits, grp.key)) {
        init[grp.key] = grp.records[0]?.site_clean ?? false;
      }
    }
    if (Object.keys(init).length) setSiteCleanEdits(prev => ({ ...prev, ...init }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups]);

  function toggleExpand(key: string) {
    setExpanded(prev => {
      const n = new Set(prev);
      if (n.has(key)) {
        n.delete(key);
      } else {
        n.add(key);
        // Init per-record time edits for this group
        const grp = groups.find(g => g.key === key);
        if (grp) {
          setRecEdits(re => {
            const next = { ...re };
            for (const rec of grp.records) {
              if (!next[rec.id]) {
                next[rec.id] = {
                  check_in_time:  rec.check_in_time  || adminSchedule.default_start,
                  check_out_time: rec.check_out_time || adminSchedule.work_end,
                };
              }
            }
            return next;
          });
        }
      }
      return n;
    });
  }

  async function loadHistory(grp: AttGroup) {
    const key = grp.key;
    setHistoryLoading(prev => new Set(prev).add(key));
    const ids = grp.records.map(r => r.id).join(',');
    try {
      const res = await fetch(`/api/attendance/history?ids=${ids}`);
      const data = await res.json();
      setEditHistory(prev => ({ ...prev, [key]: Array.isArray(data) ? data : [] }));
    } finally {
      setHistoryLoading(prev => { const n = new Set(prev); n.delete(key); return n; });
    }
  }

  function toggleHistory(grp: AttGroup) {
    const key = grp.key;
    setShowHistory(prev => {
      const n = new Set(prev);
      if (n.has(key)) { n.delete(key); }
      else {
        n.add(key);
        if (!editHistory[key]) loadHistory(grp);
      }
      return n;
    });
  }

  async function saveRecordTimes(rec: AttRecord) {
    const edit = recEdits[rec.id];
    if (!edit) return;
    setSavingRecs(prev => new Set(prev).add(rec.id));
    try {
      const res = await fetch(`/api/attendance/${rec.id}/edit-time`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ check_in_time: edit.check_in_time, check_out_time: edit.check_out_time }),
      });
      if (!res.ok) { const d = await res.json(); showAlert(d.error || 'Save failed.', 'danger'); return; }
      showAlert(`⏱ Times updated for ${rec.employees?.full_name || 'worker'}.`);
      // Invalidate history cache for this group so it reloads
      const grpKey = `${rec.work_date}__${rec.project_id || 'none'}`;
      setEditHistory(prev => { const n = { ...prev }; delete n[grpKey]; return n; });
      loadData();
    } finally {
      setSavingRecs(prev => { const n = new Set(prev); n.delete(rec.id); return n; });
    }
  }

  async function approveGroup(grp: AttGroup, status: 'approved' | 'rejected') {
    const ids       = grp.records.map(r => r.id);
    const siteClean = siteCleanEdits[grp.key] ?? false;
    setApproving(grp.key + status);
    try {
      const res = await fetch('/api/attendance/group', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, status, site_clean: siteClean }),
      });
      if (!res.ok) { const d = await res.json(); showAlert(d.error, 'danger'); return; }
      showAlert(status === 'approved'
        ? `✅ ${ids.length} record${ids.length !== 1 ? 's' : ''} approved!`
        : `❌ ${ids.length} record${ids.length !== 1 ? 's' : ''} rejected.`,
        status === 'approved' ? 'success' : 'info');
      loadData();
    } finally { setApproving(null); }
  }

  async function deleteRecord(id: string) {
    if (!confirm('Delete this record?')) return;
    await fetch(`/api/attendance/${id}`, { method: 'DELETE' });
    loadData();
  }

  async function loadBin() {
    setBinLoading(true);
    const res = await fetch('/api/bin');
    const data = await res.json();
    setBinData(res.ok ? (data.attendance || []) : null);
    setBinLoading(false);
  }

  async function handleRestoreAtt(id: string) {
    const res = await fetch('/api/bin/restore', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'attendance', id }),
    });
    const d = await res.json();
    if (res.ok) { showAlert('Record restored.'); loadBin(); loadData(); }
    else showAlert(d.error || 'Restore failed.', 'danger');
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (binOpen && !binData) loadBin();
  }, [binOpen]);

  // Auto-select workers from the most recent session of the chosen project
  useEffect(() => {
    if (!showAddModal) return;
    if (!addForm.project_id) { setAddSelectedIds(new Set()); return; }
    // Find all records for this project, pick the most recent date
    const projectRecs = records.filter(r => r.project_id === addForm.project_id);
    if (projectRecs.length === 0) { setAddSelectedIds(new Set()); return; }
    const latestDate = projectRecs.reduce((max, r) => r.work_date > max ? r.work_date : max, '');
    const latestIds  = projectRecs.filter(r => r.work_date === latestDate).map(r => r.employee_id);
    setAddSelectedIds(new Set(latestIds));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addForm.project_id, showAddModal]);

  async function handleAddAttendance(e: React.FormEvent) {
    e.preventDefault();
    if (addSelectedIds.size === 0) { showAlert('Select at least one employee.', 'danger'); return; }
    if (!addForm.work_date) { showAlert('Date is required.', 'danger'); return; }
    setAddSaving(true);
    try {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_ids: Array.from(addSelectedIds),
          work_date:   addForm.work_date,
          project_id:  addForm.project_id || null,
          work_hours:  addForm.work_hours,
          ot_hours:    addForm.ot_hours,
          site_clean:  addForm.site_clean,
          notes:       addForm.notes,
          status:      addForm.status,
        }),
      });
      const data = await res.json();
      if (!res.ok) { showAlert(data.error || 'Failed to add.', 'danger'); return; }
      const count = data.inserted?.length || 0;
      const skip  = data.skipped?.length  || 0;
      showAlert(`✅ Added ${count} record${count !== 1 ? 's' : ''}${skip ? ` (${skip} skipped — duplicate)` : ''}.`);
      setShowAddModal(false);
      setAddForm({ ...EMPTY_ADD });
      setAddSelectedIds(new Set());
      setAddEmpSearch('');
      loadData();
    } finally { setAddSaving(false); }
  }

  async function handleAddAdvance(e: React.FormEvent) {
    e.preventDefault();
    if (advSelectedIds.size === 0) { showAlert('Select at least one employee.', 'danger'); return; }
    if (!advForm.amount || Number(advForm.amount) <= 0) { showAlert('Enter a valid amount.', 'danger'); return; }
    setAdvSaving(true);
    try {
      const notes = advForm.detail_type === 'other' ? advForm.detail_note.trim() : advForm.detail_type;
      const res = await fetch('/api/advances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_ids:  Array.from(advSelectedIds),
          advance_date:  advForm.advance_date || null,
          month:         advForm.month,
          amount:        Number(advForm.amount),
          notes,
          detail_type:   advForm.detail_type,
          pay_by:        advForm.pay_by,
          bank_name:     advForm.bank_name     || null,
          account_name:  advForm.account_name  || null,
          account_no:    advForm.account_no    || null,
          bank_slip_url: advForm.bank_slip_url || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { showAlert(data.error || 'Failed.', 'danger'); return; }
      const count = data.inserted?.length || 0;
      showAlert(`✅ Advance recorded for ${count} employee${count !== 1 ? 's' : ''}.`);
      setShowAdvModal(false);
      setAdvSelectedIds(new Set()); setAdvEmpSearch('');
      setAdvForm({ advance_date: today(), month: getCurrentMonth().substring(0, 7), amount: '', detail_type: 'makan', detail_note: '', pay_by: 'cash', bank_name: '', account_name: '', account_no: '', bank_slip_url: '', bank_search_id: '' });
      loadData();
    } finally { setAdvSaving(false); }
  }

  async function uploadAdvSlip(file: File) {
    setAdvSlipUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file); fd.append('type', 'bank_slip');
      const res  = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok && data.url) setAdvForm(f => ({ ...f, bank_slip_url: data.url }));
      else showAlert(data.error || 'Upload failed.', 'danger');
    } finally { setAdvSlipUploading(false); if (advSlipRef.current) advSlipRef.current.value = ''; }
  }

  const pendingCount = groups.filter(g => g.status === 'pending').length;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary">Record</h1>
          {pendingCount > 0 && (
            <span className="badge bg-yellow-100 text-yellow-700 text-sm px-3 py-1 mt-1 inline-block">
              🟡 {pendingCount} session{pendingCount !== 1 ? 's' : ''} pending approval
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button className="btn btn-primary" onClick={() => {
            setAddForm({ ...EMPTY_ADD });
            setAddSelectedIds(new Set());
            setAddEmpSearch('');
            setShowAddModal(true);
          }}>
            + Add Attendance
          </button>
          <button className="btn bg-orange-500 hover:bg-orange-600 text-white" onClick={() => {
            setAdvSelectedIds(new Set()); setAdvEmpSearch('');
            setAdvForm({ advance_date: today(), month: getCurrentMonth().substring(0, 7), amount: '', detail_type: 'makan', detail_note: '', pay_by: 'cash', bank_name: '', account_name: '', account_no: '', bank_slip_url: '', bank_search_id: '' });
            setShowAdvModal(true);
          }}>
            + Add Advance
          </button>
        </div>
      </div>

      {alertMsg && <div className={`alert alert-${alertType}`}>{alertMsg}</div>}

      {/* ── Filters ── */}
      <div className="card p-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
          <div>
            <label className="form-label">Month</label>
            <input type="month" className="form-control" value={filterMonth} onChange={e => setFilterMonth(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Project</label>
            <select className="form-control" value={filterProject} onChange={e => setFilterProject(e.target.value)}>
              <option value="">All Projects</option>
              {projList.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Status</label>
            <select className="form-control" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">All</option>
              <option value="draft">Draft</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          <div><button className="btn btn-outline w-full" onClick={loadData}>Refresh</button></div>
        </div>
      </div>

      {/* ── Grouped Table ── */}
      {loading ? (
        <div className="p-8 text-center text-gray-400">Loading…</div>
      ) : groups.length === 0 ? (
        <div className="card p-8 text-center text-gray-400">No attendance records found.</div>
      ) : (
        <div className="card p-0 overflow-hidden">
          {/* Table header */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-th">Date</th>
                  <th className="table-th">Project</th>
                  <th className="table-th text-right">Workers</th>
                  <th className="table-th text-right">Total Gong 工</th>
                  <th className="table-th text-right">Total Salary</th>
                  <th className="table-th text-right">Site Bonus</th>
                  <th className="table-th text-right">Advance</th>
                  <th className="table-th">Status</th>
                  <th className="table-th"></th>
                </tr>
              </thead>
              <tbody>
                {groups.map(grp => {
                  const isOpen = expanded.has(grp.key);
                  const isPending = grp.status === 'pending';

                  const siteClean = siteCleanEdits[grp.key] ?? false;
                  const eligibleCount = grp.records.filter(r => Number(r.hours_worked) >= 8).length;

                  return [
                    /* ── Summary row ── */
                    <tr key={grp.key}
                      className={`table-tr cursor-pointer hover:bg-gray-50 transition-colors ${isPending ? 'bg-yellow-50/40' : ''}`}
                      onClick={() => toggleExpand(grp.key)}>
                      <td className="table-td whitespace-nowrap font-medium">{formatDate(grp.work_date)}</td>
                      <td className="table-td">
                        {grp.project
                          ? <span className="badge bg-blue-100 text-blue-700">{grp.project.code || grp.project.name}</span>
                          : <span className="text-gray-400">No project</span>}
                      </td>
                      <td className="table-td text-right text-gray-600">{grp.workerCount}</td>
                      <td className="table-td text-right font-bold text-primary">{grp.totalGong.toFixed(2)} 工</td>
                      <td className="table-td text-right font-semibold text-accent">{formatRM(grp.totalSalary)}</td>
                      <td className="table-td text-right">
                        {grp.totalSiteBonus > 0
                          ? <span className="badge bg-green-100 text-green-700">+{formatRM(grp.totalSiteBonus)}</span>
                          : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="table-td text-right">
                        {grp.totalAdvance > 0
                          ? <span className="badge bg-red-100 text-red-700">-{formatRM(grp.totalAdvance)}</span>
                          : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="table-td"><StatusBadge status={grp.status} /></td>
                      <td className="table-td">
                        <button
                          className={`btn btn-sm text-xs transition-colors ${isPending ? 'btn-primary' : 'btn-outline'}`}
                          onClick={e => { e.stopPropagation(); toggleExpand(grp.key); }}>
                          {isOpen ? '▲ Hide' : '▼ Details'}
                        </button>
                      </td>
                    </tr>,

                    /* ── Detail expand row ── */
                    isOpen && (
                      <tr key={grp.key + '_detail'}>
                        <td colSpan={9} className="p-0 border-t border-gray-100">
                          <div className="bg-gray-50 px-6 py-5 space-y-5">

                            {/* Photos strip */}
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Photos</p>
                              <div className="flex gap-6 flex-wrap items-start">
                                <PhotoCard url={grp.check_in_photo_url}   label="Check-In" />
                                <PhotoCard url={grp.check_out_photo_url}  label="Check-Out" />
                                <div className="w-px h-24 bg-gray-200 self-center" />
                                <PhotoCard url={grp.site_photo_front_url} label="Site — Front" />
                                <PhotoCard url={grp.site_photo_back_url}  label="Site — Back" />
                                <PhotoCard url={grp.site_photo_store_url} label="Site — Store" />
                              </div>
                            </div>

                            {/* Approval / site-bonus panel — pending AND approved (editable) */}
                            {(isPending || grp.status === 'approved') && (
                              <div className={`rounded-xl border p-4 space-y-3 ${isPending ? 'border-yellow-200 bg-yellow-50' : 'border-green-200 bg-green-50'}`}>
                                <div className="flex items-center justify-between flex-wrap gap-2">
                                  <p className="text-sm font-semibold">{isPending ? '🟡 Awaiting Approval' : '✅ Approved — edit times below if needed'}</p>
                                </div>
                                {/* Site bonus */}
                                <label className={`flex items-start gap-3 cursor-pointer rounded-lg border p-3 transition-colors ${siteClean ? 'bg-green-100 border-green-300' : 'bg-white border-gray-200'}`}>
                                  <input type="checkbox" className="mt-0.5 w-4 h-4 accent-green-600"
                                    checked={siteClean}
                                    onChange={e => setSiteCleanEdits(g => ({ ...g, [grp.key]: e.target.checked }))} />
                                  <div>
                                    <p className="text-sm font-medium text-gray-800">🧹 Site was clean</p>
                                    <p className="text-xs text-gray-500">+RM10 per worker ≥8h</p>
                                    {siteClean && eligibleCount > 0 && (
                                      <p className="text-xs text-green-700 font-semibold mt-0.5">
                                        +RM10 × {eligibleCount} worker{eligibleCount !== 1 ? 's' : ''} = +RM{(eligibleCount * 10).toFixed(2)}
                                      </p>
                                    )}
                                  </div>
                                </label>
                                {isPending && (
                                  <div className="flex gap-3">
                                    <button
                                      className="btn bg-green-500 hover:bg-green-600 text-white flex-1"
                                      disabled={approving !== null}
                                      onClick={() => approveGroup(grp, 'approved')}>
                                      {approving === grp.key + 'approved' ? '…' : `✓ Approve ${grp.workerCount} Records`}
                                    </button>
                                    <button
                                      className="btn btn-danger"
                                      disabled={approving !== null}
                                      onClick={() => approveGroup(grp, 'rejected')}>
                                      {approving === grp.key + 'rejected' ? '…' : '✗ Reject'}
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Individual workers table with editable times */}
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
                                Workers ({grp.workerCount})
                              </p>
                              <div className="rounded-lg border border-gray-200 overflow-x-auto">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="bg-gray-100">
                                      <th className="table-th text-xs">Name</th>
                                      <th className="table-th text-xs text-center">In</th>
                                      <th className="table-th text-xs text-center">Out</th>
                                      <th className="table-th text-xs text-right">Gong 工</th>
                                      <th className="table-th text-xs text-right">Salary</th>
                                      <th className="table-th text-xs text-right">Site Bonus</th>
                                      <th className="table-th text-xs text-right">Advance</th>
                                      <th className="table-th text-xs">Status</th>
                                      <th className="table-th text-xs"></th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {grp.records.map(rec => {
                                      const adv    = advanceMap[`${rec.employee_id}_${rec.work_date}`] || 0;
                                      const edit   = recEdits[rec.id];
                                      // Real-time gong from edits if available, else from DB
                                      const liveGong = edit
                                        ? calcHoursFromTimes(edit.check_in_time, edit.check_out_time, adminSchedule).days_worked
                                        : Number(rec.days_worked);
                                      const sal    = liveGong * Number(rec.employees?.daily_rate || 0);
                                      const isDirty = edit && (edit.check_in_time !== (rec.check_in_time || adminSchedule.default_start) || edit.check_out_time !== (rec.check_out_time || adminSchedule.work_end));
                                      const isSavingThis = savingRecs.has(rec.id);
                                      return (
                                        <tr key={rec.id} className={`border-t border-gray-100 hover:bg-white transition-colors ${isDirty ? 'bg-blue-50/40' : ''}`}>
                                          <td className="table-td font-medium">{rec.employees?.full_name || '—'}</td>
                                          <td className="table-td">
                                            <input type="time"
                                              value={edit?.check_in_time  || rec.check_in_time  || adminSchedule.default_start}
                                              onChange={e => setRecEdits(r => ({ ...r, [rec.id]: { ...r[rec.id] || { check_in_time: adminSchedule.default_start, check_out_time: adminSchedule.work_end }, check_in_time: e.target.value } }))}
                                              className="text-xs border border-gray-200 rounded px-1 py-0.5 w-24 bg-white" />
                                          </td>
                                          <td className="table-td">
                                            <input type="time"
                                              value={edit?.check_out_time || rec.check_out_time || adminSchedule.work_end}
                                              onChange={e => setRecEdits(r => ({ ...r, [rec.id]: { ...r[rec.id] || { check_in_time: adminSchedule.default_start, check_out_time: adminSchedule.work_end }, check_out_time: e.target.value } }))}
                                              className="text-xs border border-gray-200 rounded px-1 py-0.5 w-24 bg-white" />
                                          </td>
                                          <td className="table-td text-right font-semibold text-primary">{liveGong.toFixed(2)} 工</td>
                                          <td className="table-td text-right text-accent font-medium">{formatRM(sal)}</td>
                                          <td className="table-td text-right">
                                            {Number(rec.site_bonus) > 0
                                              ? <span className="text-green-700 font-medium">+{formatRM(Number(rec.site_bonus))}</span>
                                              : <span className="text-gray-400">—</span>}
                                          </td>
                                          <td className="table-td text-right">
                                            {adv > 0
                                              ? <span className="text-red-600 font-medium">-{formatRM(adv)}</span>
                                              : <span className="text-gray-400">—</span>}
                                          </td>
                                          <td className="table-td"><StatusBadge status={rec.status} /></td>
                                          <td className="table-td">
                                            <div className="flex gap-1">
                                              {isDirty && (
                                                <button
                                                  className="btn btn-sm text-xs bg-blue-500 hover:bg-blue-600 text-white"
                                                  disabled={isSavingThis}
                                                  onClick={() => saveRecordTimes(rec)}>
                                                  {isSavingThis ? '…' : '💾'}
                                                </button>
                                              )}
                                              <button className="btn btn-danger btn-sm text-xs" onClick={() => deleteRecord(rec.id)}>Del</button>
                                            </div>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                  <tfoot>
                                    <tr className="bg-gray-100 border-t-2 border-gray-200 font-semibold">
                                      <td className="table-td text-gray-600" colSpan={3}>Total</td>
                                      <td className="table-td text-right text-primary">{grp.totalGong.toFixed(2)} 工</td>
                                      <td className="table-td text-right text-accent">{formatRM(grp.totalSalary)}</td>
                                      <td className="table-td text-right text-green-700">{grp.totalSiteBonus > 0 ? `+${formatRM(grp.totalSiteBonus)}` : '—'}</td>
                                      <td className="table-td text-right text-red-600">{grp.totalAdvance > 0 ? `-${formatRM(grp.totalAdvance)}` : '—'}</td>
                                      <td className="table-td" colSpan={2}></td>
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>
                            </div>

                            {/* Edit history (immutable audit log) */}
                            <div>
                              <button
                                onClick={() => toggleHistory(grp)}
                                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors">
                                📋 {historyLoading.has(grp.key) ? 'Loading…' : showHistory.has(grp.key) ? '▲ Hide edit history' : '▼ Edit history'}
                                {editHistory[grp.key]?.length > 0 && (
                                  <span className="badge bg-gray-200 text-gray-600 text-[10px]">{editHistory[grp.key].length}</span>
                                )}
                              </button>
                              {showHistory.has(grp.key) && (
                                <div className="mt-2 rounded border border-gray-200 overflow-hidden">
                                  {!editHistory[grp.key] || editHistory[grp.key].length === 0 ? (
                                    <p className="px-4 py-3 text-xs text-gray-400">No time edits recorded for this session.</p>
                                  ) : (
                                    <table className="w-full text-xs">
                                      <thead>
                                        <tr className="bg-gray-100">
                                          <th className="table-th text-xs">When</th>
                                          <th className="table-th text-xs">By</th>
                                          <th className="table-th text-xs">Worker</th>
                                          <th className="table-th text-xs text-center">Old In</th>
                                          <th className="table-th text-xs text-center">New In</th>
                                          <th className="table-th text-xs text-center">Old Out</th>
                                          <th className="table-th text-xs text-center">New Out</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {editHistory[grp.key].map(e => {
                                          const worker = grp.records.find(r => r.id === e.attendance_id);
                                          return (
                                            <tr key={e.id} className="border-t border-gray-100">
                                              <td className="table-td text-gray-500 whitespace-nowrap">
                                                {new Date(e.edited_at).toLocaleString('en-MY', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}
                                              </td>
                                              <td className="table-td font-medium">{e.users?.username || '—'}</td>
                                              <td className="table-td">{worker?.employees?.full_name || '—'}</td>
                                              <td className="table-td text-center text-gray-400">{e.old_check_in_time  || '—'}</td>
                                              <td className="table-td text-center text-primary font-medium">{e.new_check_in_time}</td>
                                              <td className="table-td text-center text-gray-400">{e.old_check_out_time || '—'}</td>
                                              <td className="table-td text-center text-primary font-medium">{e.new_check_out_time}</td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  )}
                                </div>
                              )}
                            </div>

                          </div>
                        </td>
                      </tr>
                    ),
                  ];
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Bin ── */}
      <div className="mt-10">
        <button
          onClick={() => setBinOpen(b => !b)}
          className="w-full flex items-center justify-between px-5 py-3 rounded-xl border-2 border-dashed border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-600 transition-colors"
        >
          <span className="flex items-center gap-2 font-semibold text-sm">
            🗑️ Bin
            {binData && binData.length > 0 && (
              <span className="bg-red-100 text-red-600 text-xs font-bold px-2 py-0.5 rounded-full">{binData.length}</span>
            )}
          </span>
          <span className="text-xs">{binOpen ? '▲ Collapse' : '▼ Expand'}</span>
        </button>
        {binOpen && (
          <div className="mt-3 card p-0 overflow-hidden">
            <div className="px-5 py-3 border-b border-bg bg-gray-50">
              <p className="text-xs text-gray-500">Deleted attendance records are stored here. Restore to recover.</p>
            </div>
            <div className="p-4">
              {binLoading ? (
                <div className="py-8 text-center text-gray-400 text-sm">Loading bin…</div>
              ) : !binData || binData.length === 0 ? (
                <div className="py-8 text-center text-gray-400 text-sm">No deleted attendance records.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th className="table-th">Date</th>
                        <th className="table-th">Employee</th>
                        <th className="table-th">Project</th>
                        <th className="table-th">Hours</th>
                        <th className="table-th">Deleted At</th>
                        <th className="table-th">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {binData.map(row => (
                        <tr key={row.id} className="table-tr">
                          <td className="table-td">{row.work_date}</td>
                          <td className="table-td font-medium">{row.employees?.full_name || <span className="text-gray-400">—</span>}</td>
                          <td className="table-td">
                            {row.projects
                              ? <span className="badge bg-blue-50 text-blue-700">{row.projects.code || row.projects.name}</span>
                              : <span className="text-gray-400">—</span>}
                          </td>
                          <td className="table-td">{row.hours_worked}h</td>
                          <td className="table-td text-gray-500">
                            {new Date(row.deleted_at).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </td>
                          <td className="table-td">
                            <button onClick={() => handleRestoreAtt(row.id)} className="btn btn-sm bg-green-500 hover:bg-green-600 text-white">↩ Restore</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Add Attendance Modal ─────────────────────────────────────── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-primary">+ Add Attendance</h2>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>

            <form onSubmit={handleAddAttendance} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

              {/* Date + Project */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Date *</label>
                  <input type="date" className="form-control" required
                    value={addForm.work_date}
                    onChange={e => setAddForm(f => ({ ...f, work_date: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Project</label>
                  <select className="form-control" value={addForm.project_id}
                    onChange={e => setAddForm(f => ({ ...f, project_id: e.target.value }))}>
                    <option value="">— No Project —</option>
                    {projList.map(p => <option key={p.id} value={p.id}>{p.code ? `${p.code} ${p.name}` : p.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Employees */}
              <div>
                <label className="form-label">
                  Employees *
                  <span className="ml-2 text-primary font-bold">{addSelectedIds.size} selected</span>
                  {addForm.project_id && addSelectedIds.size > 0 && (
                    <span className="ml-2 text-xs text-gray-400 font-normal">↩ auto-filled from last session</span>
                  )}
                </label>
                <input
                  className="form-control mb-2"
                  placeholder="Search employee…"
                  value={addEmpSearch}
                  onChange={e => setAddEmpSearch(e.target.value)}
                />
                <div className="border border-gray-200 rounded-lg max-h-44 overflow-y-auto divide-y divide-gray-100">
                  {empList
                    .filter(emp => emp.full_name.toLowerCase().includes(addEmpSearch.toLowerCase()))
                    .map(emp => (
                      <label key={emp.id}
                        className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors ${addSelectedIds.has(emp.id) ? 'bg-primary/5' : ''}`}>
                        <input type="checkbox"
                          checked={addSelectedIds.has(emp.id)}
                          onChange={e => {
                            const next = new Set(addSelectedIds);
                            e.target.checked ? next.add(emp.id) : next.delete(emp.id);
                            setAddSelectedIds(next);
                          }}
                          className="w-4 h-4 accent-primary" />
                        <span className="text-sm font-medium text-gray-800">{emp.full_name}</span>
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

              {/* Hours */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="form-label">Work Hours *</label>
                  <select className="form-control" value={addForm.work_hours}
                    onChange={e => setAddForm(f => ({ ...f, work_hours: Number(e.target.value) }))}>
                    {[1,2,3,4,5,6,7,8,9,10,11,12].map(h => <option key={h} value={h}>{h}h</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">OT Hours</label>
                  <select className="form-control" value={addForm.ot_hours}
                    onChange={e => setAddForm(f => ({ ...f, ot_hours: Number(e.target.value) }))}>
                    {[0,1,2,3,4,5,6,7,8].map(h => <option key={h} value={h}>+{h}h</option>)}
                  </select>
                </div>
                <div className="flex flex-col justify-end">
                  <p className="form-label">Total 工</p>
                  <div className="form-control bg-gray-50 font-bold text-primary text-center">
                    {((addForm.work_hours + addForm.ot_hours) / 8).toFixed(2)} 工
                  </div>
                </div>
                <div className="flex flex-col justify-end">
                  <label className="form-label">Status</label>
                  <select className="form-control" value={addForm.status}
                    onChange={e => setAddForm(f => ({ ...f, status: e.target.value }))}>
                    <option value="approved">✅ Approved</option>
                    <option value="pending">🟡 Pending</option>
                  </select>
                </div>
              </div>

              {/* Site Bonus */}
              <label className={`flex items-start gap-3 cursor-pointer rounded-xl border-2 p-3 transition-colors ${addForm.site_clean ? 'border-green-400 bg-green-50' : 'border-gray-200 bg-white'}`}>
                <input type="checkbox" className="mt-0.5 w-4 h-4 accent-green-600"
                  checked={addForm.site_clean}
                  onChange={e => setAddForm(f => ({ ...f, site_clean: e.target.checked }))} />
                <div>
                  <p className="text-sm font-semibold text-gray-800">🧹 Site was clean</p>
                  <p className="text-xs text-gray-500">+RM10 per worker if ≥ 8h worked</p>
                  {addForm.site_clean && addForm.work_hours + addForm.ot_hours >= 8 && (
                    <p className="text-xs text-green-700 font-semibold mt-0.5">
                      +RM10 × {addSelectedIds.size} = +RM{(addSelectedIds.size * 10).toFixed(2)}
                    </p>
                  )}
                </div>
              </label>

              {/* Notes */}
              <div>
                <label className="form-label">Notes <span className="text-gray-400 font-normal">(optional)</span></label>
                <textarea className="form-control" rows={2} placeholder="Remark, rework reason…"
                  value={addForm.notes}
                  onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </form>

            {/* Footer */}
            <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
              <button type="button" disabled={addSaving}
                onClick={handleAddAttendance}
                className="btn btn-primary flex-1">
                {addSaving ? 'Saving…' : `+ Add ${addSelectedIds.size > 0 ? addSelectedIds.size + ' ' : ''}Record${addSelectedIds.size !== 1 ? 's' : ''}`}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Advance Modal ──────────────────────────────────────────── */}
      {showAdvModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-primary">+ Add Advance</h2>
              <button onClick={() => setShowAdvModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>

            <form onSubmit={handleAddAdvance} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

              {/* Date + Salary Month */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Date *</label>
                  <input type="date" className="form-control" required
                    value={advForm.advance_date}
                    onChange={e => setAdvForm(f => ({ ...f, advance_date: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Deduct from Month *</label>
                  <input type="month" className="form-control" required
                    value={advForm.month}
                    onChange={e => setAdvForm(f => ({ ...f, month: e.target.value }))} />
                </div>
              </div>

              {/* Staff multi-select */}
              <div>
                <label className="form-label">
                  Staff *
                  <span className="ml-2 text-primary font-bold">{advSelectedIds.size} selected</span>
                </label>
                <input className="form-control mb-2" placeholder="Search staff…"
                  value={advEmpSearch} onChange={e => setAdvEmpSearch(e.target.value)} />
                <div className="border border-gray-200 rounded-lg max-h-40 overflow-y-auto divide-y divide-gray-100">
                  {empList
                    .filter(emp => emp.full_name.toLowerCase().includes(advEmpSearch.toLowerCase()))
                    .map(emp => (
                      <label key={emp.id}
                        className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50 ${advSelectedIds.has(emp.id) ? 'bg-primary/5' : ''}`}>
                        <input type="checkbox"
                          checked={advSelectedIds.has(emp.id)}
                          onChange={e => {
                            const next = new Set(advSelectedIds);
                            e.target.checked ? next.add(emp.id) : next.delete(emp.id);
                            setAdvSelectedIds(next);
                          }}
                          className="w-4 h-4 accent-primary" />
                        <span className="text-sm font-medium text-gray-800 flex-1">{emp.full_name}</span>
                        {emp.bank_name && <span className="text-xs text-gray-400">{emp.bank_name}</span>}
                      </label>
                    ))}
                </div>
                <div className="flex gap-2 mt-1.5">
                  <button type="button" className="text-xs text-primary underline"
                    onClick={() => setAdvSelectedIds(new Set(empList.map(e => e.id)))}>Select all</button>
                  <span className="text-gray-300">|</span>
                  <button type="button" className="text-xs text-gray-500 underline"
                    onClick={() => setAdvSelectedIds(new Set())}>Clear</button>
                </div>
              </div>

              {/* Amount */}
              <div>
                <label className="form-label">Amount (RM) *</label>
                <input type="number" className="form-control" min="0.01" step="0.01" placeholder="0.00" required
                  value={advForm.amount}
                  onChange={e => setAdvForm(f => ({ ...f, amount: e.target.value }))} />
              </div>

              {/* Detail type */}
              <div>
                <label className="form-label">Detail</label>
                <div className="grid grid-cols-3 gap-2">
                  {([['makan', '🍱', 'Makan'], ['pinjam', '💰', 'Pinjam'], ['other', '📝', 'Other']] as const).map(([val, icon, lbl]) => (
                    <label key={val} className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 cursor-pointer transition-colors
                      ${advForm.detail_type === val ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-gray-300'}`}>
                      <input type="radio" name="detail_type" value={val} className="sr-only"
                        checked={advForm.detail_type === val}
                        onChange={() => setAdvForm(f => ({ ...f, detail_type: val }))} />
                      <span>{icon}</span>
                      <span className="text-sm font-semibold">{lbl}</span>
                    </label>
                  ))}
                </div>
                {advForm.detail_type === 'other' && (
                  <input className="form-control mt-2" placeholder="Describe reason…"
                    value={advForm.detail_note}
                    onChange={e => setAdvForm(f => ({ ...f, detail_note: e.target.value }))} />
                )}
              </div>

              {/* Pay by */}
              <div>
                <label className="form-label">Pay By</label>
                <div className="grid grid-cols-2 gap-2">
                  {([['cash', '💵', 'Cash'], ['transfer', '🏦', 'Transfer']] as const).map(([val, icon, lbl]) => (
                    <label key={val} className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 cursor-pointer transition-colors
                      ${advForm.pay_by === val ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-gray-300'}`}>
                      <input type="radio" name="pay_by" value={val} className="sr-only"
                        checked={advForm.pay_by === val}
                        onChange={() => setAdvForm(f => ({ ...f, pay_by: val }))} />
                      <span>{icon}</span>
                      <span className="text-sm font-semibold">{lbl}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Bank details — only if transfer */}
              {advForm.pay_by === 'transfer' && (
                <div className="rounded-xl border border-gray-200 p-4 space-y-3">
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">🏦 Bank Details</p>

                  {/* Auto-fill from staff */}
                  <div>
                    <label className="form-label text-xs">Load from staff profile</label>
                    <select className="form-control"
                      value={advForm.bank_search_id}
                      onChange={e => {
                        const emp = empList.find(x => x.id === e.target.value);
                        setAdvForm(f => ({
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
                      <label className="form-label text-xs">Bank</label>
                      <input className="form-control" placeholder="e.g. Maybank"
                        value={advForm.bank_name}
                        onChange={e => setAdvForm(f => ({ ...f, bank_name: e.target.value, bank_search_id: '' }))} />
                    </div>
                    <div>
                      <label className="form-label text-xs">Account Name</label>
                      <input className="form-control" placeholder="Full name"
                        value={advForm.account_name}
                        onChange={e => setAdvForm(f => ({ ...f, account_name: e.target.value, bank_search_id: '' }))} />
                    </div>
                    <div>
                      <label className="form-label text-xs">Account No.</label>
                      <input className="form-control" placeholder="1234567890"
                        value={advForm.account_no}
                        onChange={e => setAdvForm(f => ({ ...f, account_no: e.target.value, bank_search_id: '' }))} />
                    </div>
                  </div>

                  {/* Bank slip upload */}
                  <div>
                    <label className="form-label text-xs">Bank Slip <span className="text-gray-400 font-normal">(PDF or photo)</span></label>
                    <input ref={advSlipRef} type="file" accept="image/*,.pdf" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) uploadAdvSlip(f); }} />
                    <div className="flex items-center gap-3">
                      <button type="button" disabled={advSlipUploading}
                        onClick={() => advSlipRef.current?.click()}
                        className={`btn btn-sm ${advForm.bank_slip_url ? 'btn-outline' : 'btn-primary'}`}>
                        {advSlipUploading ? '⏳ Uploading…' : advForm.bank_slip_url ? '↻ Replace Slip' : '📎 Upload Slip'}
                      </button>
                      {advForm.bank_slip_url && (
                        <a href={advForm.bank_slip_url} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline">
                          ✅ View uploaded slip →
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </form>

            {/* Footer */}
            <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
              <button type="button" disabled={advSaving}
                onClick={handleAddAdvance}
                className="btn btn-primary flex-1">
                {advSaving ? 'Saving…' : `+ Record Advance${advSelectedIds.size > 1 ? ` (${advSelectedIds.size})` : ''}`}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setShowAdvModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// ROOT
// ══════════════════════════════════════════════════════════════════════
export default function AttendancePage() {
  const { role, loaded } = useRole();
  if (!loaded) return <div className="p-8 text-center text-gray-400">Loading…</div>;
  if (role === 'viewer') return <WorkerView />;
  if (role === 'editor') return <LeaderView />;
  // approval, admin, owner all see the full admin view
  return <AdminView />;
}
