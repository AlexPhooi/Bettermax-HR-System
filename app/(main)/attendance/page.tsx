'use client';
import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { formatDate, formatRM, getCurrentMonth } from '@/lib/utils';
import { useRole } from '@/lib/role-context';

// ── Types ─────────────────────────────────────────────────────────────
interface AttRecord {
  id: string;
  employee_id: string;
  project_id: string | null;
  work_date: string;
  hours_worked: number;
  days_worked: number;
  ot_hours: number;
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

interface Employee { id: string; full_name: string; status: string; }
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
      <input ref={ref} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
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
      <input ref={ref} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
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

  // Complete form
  const [workHours,  setWorkHours]  = useState(8);
  const [otHours,    setOtHours]    = useState(0);
  const [coPhoto,    setCoPhoto]    = useState<string | null>(null);
  const [frontPhoto, setFrontPhoto] = useState<string | null>(null);
  const [backPhoto,  setBackPhoto]  = useState<string | null>(null);
  const [storePhoto, setStorePhoto] = useState<string | null>(null);

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

  const draftRecs    = todayRecs.filter(r => r.status === 'draft');
  const nonDraftRecs = todayRecs.filter(r => r.status !== 'draft');
  const hasDraft     = draftRecs.length > 0;
  const hasSubmitted = nonDraftRecs.length > 0 && !hasDraft;

  const sessionProject = hasDraft ? projList.find(p => p.id === draftRecs[0].project_id) : null;
  const sessionCheckInPhoto = hasDraft ? draftRecs[0].check_in_photo_url : null;

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

  async function handleComplete() {
    if (!coPhoto) { showAlert('Check-out group photo is required.', 'danger'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/attendance/complete', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: draftRecs[0]?.project_id || null, work_date: today(),
          work_hours: workHours, ot_hours: otHours,
          check_out_photo_url: coPhoto, site_photo_front_url: frontPhoto,
          site_photo_back_url: backPhoto, site_photo_store_url: storePhoto }),
      });
      const data = await res.json();
      if (!res.ok) { showAlert(data.error, 'danger'); return; }
      showAlert(`Submitted ${data.updated} record${data.updated !== 1 ? 's' : ''} for approval ✅`);
      setCoPhoto(null); setFrontPhoto(null); setBackPhoto(null); setStorePhoto(null);
      loadAll();
    } finally { setSaving(false); }
  }

  const totalGong = ((workHours + otHours) / 8).toFixed(2);

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

        {hasSubmitted && (
          <div className="card border-l-4 border-yellow-400 bg-yellow-50">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🟡</span>
              <div>
                <p className="font-semibold text-yellow-800">Today&apos;s attendance submitted — awaiting approval</p>
                <p className="text-sm text-yellow-700 mt-0.5">{nonDraftRecs.length} record{nonDraftRecs.length !== 1 ? 's' : ''}</p>
              </div>
            </div>
          </div>
        )}

        {hasDraft && (
          <div className="card space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-gray-800">Complete Today&apos;s Attendance</h3>
                <p className="text-sm text-gray-500 mt-0.5">{draftRecs.length} worker{draftRecs.length !== 1 ? 's' : ''} checked in{sessionProject ? ` · ${sessionProject.name}` : ''}</p>
              </div>
              {sessionCheckInPhoto && (
                <a href={sessionCheckInPhoto} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={sessionCheckInPhoto} alt="check-in" className="w-14 h-14 object-cover rounded-lg border-2 border-green-400 hover:opacity-80" />
                </a>
              )}
            </div>
            <HourPicker label="Working Hours" value={workHours} max={8} onChange={setWorkHours} />
            <HourPicker label="OT Hours" value={otHours} max={8} onChange={setOtHours} prefix="+" />
            <div className="rounded-lg bg-primary/5 px-4 py-3 text-center">
              <span className="text-3xl font-bold text-primary">{totalGong} 工</span>
              <p className="text-xs text-gray-500 mt-1">{workHours}h work + {otHours}h OT = {workHours + otHours}h total</p>
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
        )}

        {!hasDraft && !hasSubmitted && (
          <div className="card space-y-5">
            <h3 className="font-semibold text-gray-800">Morning Check-In</h3>
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
                  {activeProjects.map(p => <option key={p.id} value={p.id}>{p.name}{p.code ? ` (${p.code})` : ''}</option>)}
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
        )}
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
function AdminView() {
  const [records,  setRecords]  = useState<AttRecord[]>([]);
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [projList, setProjList] = useState<Project[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [alertMsg, setAlertMsg] = useState('');
  const [alertType, setAlertType] = useState<'success' | 'danger' | 'info'>('success');
  const [filterMonth,   setFilterMonth]   = useState(getCurrentMonth());
  const [filterProject, setFilterProject] = useState('');
  const [filterStatus,  setFilterStatus]  = useState('');
  const [approving, setApproving] = useState<string | null>(null);
  const [expanded,  setExpanded] = useState<Set<string>>(new Set());

  // Per-group edit state: groupKey → { workHours, otHours, siteClean }
  const [groupEdits, setGroupEdits] = useState<Record<string, { workHours: number; otHours: number; siteClean: boolean }>>({});

  function showAlert(msg: string, type: 'success' | 'danger' | 'info' = 'success') {
    setAlertMsg(msg); setAlertType(type); setTimeout(() => setAlertMsg(''), 5000);
  }

  const loadData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterMonth)   params.set('month',      filterMonth);
    if (filterProject) params.set('project_id', filterProject);
    if (filterStatus)  params.set('status',     filterStatus);
    const [recRes, projRes, advRes] = await Promise.all([
      fetch(`/api/attendance?${params}`).then(r => r.json()),
      fetch('/api/projects').then(r => r.json()),
      fetch(`/api/advances?month=${filterMonth}`).then(r => r.json()),
    ]);
    setRecords(Array.isArray(recRes)  ? recRes  : []);
    setProjList(Array.isArray(projRes) ? projRes : []);
    setAdvances(Array.isArray(advRes) ? advRes  : []);
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

  // Init group edits for pending groups
  useEffect(() => {
    const init: typeof groupEdits = {};
    for (const grp of groups) {
      if (grp.status === 'pending' && !groupEdits[grp.key]) {
        const r = grp.records[0];
        const ot = Math.round(Number(r.ot_hours));
        const wk = Math.max(1, Math.min(8, Math.round(Number(r.hours_worked) - ot)));
        init[grp.key] = { workHours: wk, otHours: ot, siteClean: r.site_clean };
      }
    }
    if (Object.keys(init).length) setGroupEdits(prev => ({ ...prev, ...init }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups]);

  function toggleExpand(key: string) {
    setExpanded(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  async function approveGroup(grp: AttGroup, status: 'approved' | 'rejected') {
    const ids   = grp.records.map(r => r.id);
    const edits = groupEdits[grp.key] || { workHours: 8, otHours: 0, siteClean: false };
    setApproving(grp.key + status);
    try {
      const res = await fetch('/api/attendance/group', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, status, site_clean: edits.siteClean, work_hours: edits.workHours, ot_hours: edits.otHours }),
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

  const pendingCount = groups.filter(g => g.status === 'pending').length;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-primary">Attendance</h1>
        {pendingCount > 0 && (
          <span className="badge bg-yellow-100 text-yellow-700 text-sm px-3 py-1">
            🟡 {pendingCount} session{pendingCount !== 1 ? 's' : ''} pending approval
          </span>
        )}
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
                  const edits  = groupEdits[grp.key] || { workHours: 8, otHours: 0, siteClean: false };
                  const isPending = grp.status === 'pending';

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

                            {/* Pending approval controls */}
                            {isPending && (
                              <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 space-y-4">
                                <p className="text-sm font-semibold text-yellow-800">🟡 Awaiting Approval</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                  {/* Hours adjustment */}
                                  <div className="space-y-2">
                                    <p className="text-xs text-gray-500 font-medium uppercase">Adjust Hours</p>
                                    <div className="flex items-center gap-2">
                                      <div>
                                        <label className="form-label text-xs">Work</label>
                                        <select className="form-control w-24"
                                          value={edits.workHours}
                                          onChange={e => setGroupEdits(g => ({ ...g, [grp.key]: { ...edits, workHours: Number(e.target.value) } }))}>
                                          {[1,2,3,4,5,6,7,8].map(h => <option key={h} value={h}>{h}h</option>)}
                                        </select>
                                      </div>
                                      <div>
                                        <label className="form-label text-xs">OT</label>
                                        <select className="form-control w-24"
                                          value={edits.otHours}
                                          onChange={e => setGroupEdits(g => ({ ...g, [grp.key]: { ...edits, otHours: Number(e.target.value) } }))}>
                                          {[0,1,2,3,4,5,6,7,8].map(h => <option key={h} value={h}>+{h}h</option>)}
                                        </select>
                                      </div>
                                      <div className="pt-5 font-bold text-primary text-lg">
                                        {((edits.workHours + edits.otHours) / 8).toFixed(2)} 工
                                      </div>
                                    </div>
                                  </div>
                                  {/* Site bonus */}
                                  <div>
                                    <p className="text-xs text-gray-500 font-medium uppercase mb-2">Site Bonus</p>
                                    <label className={`flex items-start gap-3 cursor-pointer rounded-lg border p-3 transition-colors ${edits.siteClean ? 'bg-green-50 border-green-300' : 'bg-white border-gray-200'}`}>
                                      <input type="checkbox" className="mt-0.5 w-4 h-4 accent-green-600"
                                        checked={edits.siteClean}
                                        onChange={e => setGroupEdits(g => ({ ...g, [grp.key]: { ...edits, siteClean: e.target.checked } }))} />
                                      <div>
                                        <p className="text-sm font-medium text-gray-800">🧹 Site was clean</p>
                                        <p className="text-xs text-gray-500">+RM10 per worker ≥8h</p>
                                        {edits.siteClean && (
                                          <p className="text-xs text-green-700 font-semibold mt-0.5">
                                            +RM10 × {grp.records.filter(() => (edits.workHours + edits.otHours) >= 8).length} workers = +RM{(grp.records.filter(() => (edits.workHours + edits.otHours) >= 8).length * 10).toFixed(2)}
                                          </p>
                                        )}
                                      </div>
                                    </label>
                                  </div>
                                </div>
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
                              </div>
                            )}

                            {/* Individual workers table */}
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
                                Workers ({grp.workerCount})
                              </p>
                              <div className="rounded-lg border border-gray-200 overflow-hidden">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="bg-gray-100">
                                      <th className="table-th text-xs">Name</th>
                                      <th className="table-th text-xs text-right">Gong 工</th>
                                      <th className="table-th text-xs text-right">OT</th>
                                      <th className="table-th text-xs text-right">Salary</th>
                                      <th className="table-th text-xs text-right">Site Bonus</th>
                                      <th className="table-th text-xs text-right">Advance</th>
                                      <th className="table-th text-xs">Status</th>
                                      <th className="table-th text-xs"></th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {grp.records.map(rec => {
                                      const adv = advanceMap[`${rec.employee_id}_${rec.work_date}`] || 0;
                                      const sal = Number(rec.days_worked) * Number(rec.employees?.daily_rate || 0);
                                      return (
                                        <tr key={rec.id} className="border-t border-gray-100 hover:bg-white transition-colors">
                                          <td className="table-td font-medium">{rec.employees?.full_name || '—'}</td>
                                          <td className="table-td text-right font-semibold">{Number(rec.days_worked).toFixed(2)} 工</td>
                                          <td className="table-td text-right text-gray-500">{Number(rec.ot_hours) > 0 ? `+${Number(rec.ot_hours)}h` : '—'}</td>
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
                                            <button className="btn btn-danger btn-sm text-xs" onClick={() => deleteRecord(rec.id)}>Del</button>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                  {/* Group totals row */}
                                  <tfoot>
                                    <tr className="bg-gray-100 border-t-2 border-gray-200 font-semibold">
                                      <td className="table-td text-gray-600">Total</td>
                                      <td className="table-td text-right text-primary">{grp.totalGong.toFixed(2)} 工</td>
                                      <td className="table-td"></td>
                                      <td className="table-td text-right text-accent">{formatRM(grp.totalSalary)}</td>
                                      <td className="table-td text-right text-green-700">{grp.totalSiteBonus > 0 ? `+${formatRM(grp.totalSiteBonus)}` : '—'}</td>
                                      <td className="table-td text-right text-red-600">{grp.totalAdvance > 0 ? `-${formatRM(grp.totalAdvance)}` : '—'}</td>
                                      <td className="table-td" colSpan={2}></td>
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>
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
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// ROOT
// ══════════════════════════════════════════════════════════════════════
export default function AttendancePage() {
  const { role, loaded } = useRole();
  if (!loaded) return <div className="p-8 text-center text-gray-400">Loading…</div>;
  if (role === 'worker') return <WorkerView />;
  if (role === 'leader') return <LeaderView />;
  return <AdminView />;
}
