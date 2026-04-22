'use client';
import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { formatDate, getCurrentMonth } from '@/lib/utils';
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
  projects: { name: string; code: string | null } | null;
}
interface Employee { id: string; full_name: string; status: string; }
interface Project  { id: string; name: string; code: string | null; status: string; }

const today = () => new Date().toISOString().split('T')[0];

// ── Shared helpers ─────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    draft:    'bg-gray-100 text-gray-500',
    pending:  'bg-yellow-100 text-yellow-700',
    approved: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
  };
  const icons: Record<string, string> = { draft: '📝', pending: '🟡', approved: '✅', rejected: '❌' };
  return (
    <span className={`badge text-xs ${cfg[status] || 'bg-gray-100 text-gray-500'}`}>
      {icons[status] || '?'} {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function Thumb({ url, alt }: { url: string | null; alt: string }) {
  if (!url) return <span className="text-gray-300 text-xs">—</span>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={alt} className="w-14 h-14 object-cover rounded border border-gray-200 hover:opacity-75 transition" />
    </a>
  );
}

// Photo upload button (uploads immediately, returns URL via callback)
function PhotoBtn({ label, url, onUrl, type, photoLabel }: {
  label: string; url: string | null;
  onUrl: (url: string) => void;
  type: string; photoLabel?: string;
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
    } finally {
      setUploading(false);
      if (ref.current) ref.current.value = '';
    }
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

// Hours & OT picker (button grid)
function HourPicker({ value, onChange, max, label, prefix = '' }: {
  value: number; onChange: (v: number) => void; max: number; label: string; prefix?: string;
}) {
  return (
    <div>
      <p className="form-label">{label}</p>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: max + 1 }, (_, i) => i).map(h => (
          <button
            key={h}
            type="button"
            onClick={() => onChange(h)}
            className={`min-w-[44px] h-10 rounded-lg border text-sm font-semibold transition-all
              ${value === h
                ? 'bg-primary text-white border-primary shadow-sm scale-105'
                : 'bg-white text-gray-600 border-gray-200 hover:border-primary hover:text-primary'}`}>
            {prefix}{h}h
          </button>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// WORKER VIEW — own records only
// ══════════════════════════════════════════════════════════════════════
function WorkerView() {
  const [records, setRecords]   = useState<AttRecord[]>([]);
  const [loading, setLoading]   = useState(true);
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
                    <td className="table-td text-gray-500">
                      {Number(r.ot_hours) > 0 ? `+${Number(r.ot_hours)}h` : '—'}
                    </td>
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
  const [saving, setSaving]     = useState(false);

  // Check-in form state
  const [ciProject,  setCiProject]  = useState('');
  const [ciDate,     setCiDate]     = useState(today());
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [empSearch,  setEmpSearch]  = useState('');
  const [autoLoading, setAutoLoading] = useState(false);
  const [autoCount,   setAutoCount]   = useState<number | null>(null);
  const [ciPhoto,    setCiPhoto]    = useState<string | null>(null);

  // Complete form state
  const [workHours,    setWorkHours]    = useState(8);
  const [otHours,      setOtHours]      = useState(0);
  const [coPhoto,      setCoPhoto]      = useState<string | null>(null);
  const [frontPhoto,   setFrontPhoto]   = useState<string | null>(null);
  const [backPhoto,    setBackPhoto]    = useState<string | null>(null);
  const [storePhoto,   setStorePhoto]   = useState<string | null>(null);

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

  // Auto-select workers from yesterday when date changes
  useEffect(() => {
    if (empList.length === 0) return;
    async function autoSelect() {
      setAutoLoading(true);
      setAutoCount(null);
      const d = new Date(ciDate + 'T00:00:00');
      d.setDate(d.getDate() - 1);
      const prev = d.toISOString().split('T')[0];
      const res = await fetch(`/api/attendance?date=${prev}`).then(r => r.json());
      if (Array.isArray(res)) {
        const activeIds = new Set(empList.map(e => e.id));
        const ids = new Set<string>(res.map((r: AttRecord) => r.employee_id).filter(id => activeIds.has(id)));
        setCheckedIds(ids);
        setAutoCount(ids.size);
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

  function toggleEmp(id: string) {
    setCheckedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  const allSelected = filteredEmps.length > 0 && filteredEmps.every(e => checkedIds.has(e.id));
  const activeProjects = projList.filter(p => p.status === 'active');

  // Determine today's state
  const draftRecs   = todayRecs.filter(r => r.status === 'draft');
  const pendingRecs = todayRecs.filter(r => r.status === 'pending');
  const approvedRecs = todayRecs.filter(r => r.status === 'approved');
  const hasDraft    = draftRecs.length > 0;
  const hasSubmitted = pendingRecs.length > 0 || approvedRecs.length > 0;

  // Session info from draft records
  const sessionProject = hasDraft ? projList.find(p => p.id === draftRecs[0].project_id) : null;
  const sessionWorkers  = hasDraft ? draftRecs.length : 0;
  const sessionCheckInPhoto = hasDraft ? draftRecs[0].check_in_photo_url : null;

  // ── Check-In Submit ──────────────────────────────────────────────
  async function handleCheckIn() {
    if (checkedIds.size === 0) { showAlert('Select at least one worker.', 'danger'); return; }
    if (!ciPhoto) { showAlert('Check-in group photo is required.', 'danger'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'draft',
          project_id: ciProject || null,
          work_date: ciDate,
          employee_ids: Array.from(checkedIds),
          check_in_photo_url: ciPhoto,
        }),
      });
      const data = await res.json();
      if (!res.ok) { showAlert(data.error, 'danger'); return; }
      const saved = data.inserted?.length || 0;
      const skipped = data.skipped?.length || 0;
      showAlert(`Checked in ${saved} worker${saved !== 1 ? 's' : ''}${skipped ? ` (${skipped} skipped)` : ''}.`);
      setCiPhoto(null);
      loadAll();
    } finally { setSaving(false); }
  }

  // ── Complete Submit ──────────────────────────────────────────────
  async function handleComplete() {
    if (!coPhoto) { showAlert('Check-out group photo is required.', 'danger'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/attendance/complete', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id:           draftRecs[0]?.project_id || null,
          work_date:            today(),
          work_hours:           workHours,
          ot_hours:             otHours,
          check_out_photo_url:  coPhoto,
          site_photo_front_url: frontPhoto,
          site_photo_back_url:  backPhoto,
          site_photo_store_url: storePhoto,
        }),
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

      {/* ── Today Section ─── */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-3">
          📅 Today — {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
        </h2>

        {/* SUBMITTED STATE */}
        {hasSubmitted && !hasDraft && (
          <div className="card border-l-4 border-yellow-400 bg-yellow-50">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🟡</span>
              <div>
                <p className="font-semibold text-yellow-800">Today's attendance submitted — awaiting approval</p>
                <p className="text-sm text-yellow-700 mt-0.5">
                  {pendingRecs.length > 0 ? `${pendingRecs.length} records pending` : `${approvedRecs.length} records approved`}
                  {sessionProject ? ` · ${sessionProject.name}` : ''}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* COMPLETE STATE — draft exists */}
        {hasDraft && (
          <div className="card space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-gray-800">Complete Today&apos;s Attendance</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  {sessionWorkers} worker{sessionWorkers !== 1 ? 's' : ''} checked in
                  {sessionProject ? ` · ${sessionProject.name}` : ''}
                </p>
              </div>
              {sessionCheckInPhoto && (
                <a href={sessionCheckInPhoto} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={sessionCheckInPhoto} alt="check-in" className="w-14 h-14 object-cover rounded-lg border-2 border-green-400 hover:opacity-80" />
                </a>
              )}
            </div>

            {/* Hours picker */}
            <HourPicker label="Working Hours" value={workHours} max={8} onChange={setWorkHours} />
            <HourPicker label="OT Hours" value={otHours} max={8} onChange={setOtHours} prefix="+" />

            <div className="rounded-lg bg-primary/5 px-4 py-3 text-center">
              <span className="text-3xl font-bold text-primary">{totalGong} 工</span>
              <p className="text-xs text-gray-500 mt-1">{workHours}h work + {otHours}h OT = {workHours + otHours}h total</p>
            </div>

            {/* Check-out photo */}
            <div>
              <p className="form-label mb-3">Group Photos</p>
              <div className="flex gap-6 flex-wrap">
                <PhotoBtn label="Check-Out Photo *" url={coPhoto} onUrl={setCoPhoto} type="check_out_photo" />
              </div>
            </div>

            {/* Site photos */}
            <div>
              <p className="form-label mb-3">Site Photos (for bonus review)</p>
              <div className="flex gap-6 flex-wrap">
                <PhotoBtn label="Front" url={frontPhoto} onUrl={setFrontPhoto} type="site_front" photoLabel="front" />
                <PhotoBtn label="Back"  url={backPhoto}  onUrl={setBackPhoto}  type="site_back"  photoLabel="back"  />
                <PhotoBtn label="Store" url={storePhoto} onUrl={setStorePhoto} type="site_store" photoLabel="store" />
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Site photos allow the boss to review and grant <strong>+RM10</strong> site bonus for workers who worked ≥8h.
              </p>
            </div>

            <button
              type="button" disabled={saving}
              onClick={handleComplete}
              className="btn btn-primary w-full">
              {saving ? 'Submitting…' : '📤 Submit for Approval'}
            </button>
          </div>
        )}

        {/* CHECK-IN STATE — no records yet today */}
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

            {/* Check-in photo */}
            <div className="flex items-start gap-5">
              <PhotoBtn label="Check-In Group Photo *" url={ciPhoto} onUrl={setCiPhoto} type="check_in_photo" />
              {ciPhoto && <p className="text-xs text-green-600 mt-10">✅ Photo ready</p>}
            </div>

            {/* Employee multi-select */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="form-label mb-0">
                  Workers *{' '}
                  {checkedIds.size > 0 && <span className="badge bg-primary text-white ml-1">{checkedIds.size} selected</span>}
                </label>
                <button type="button" className="text-xs text-primary underline"
                  onClick={() => allSelected ? setCheckedIds(new Set()) : setCheckedIds(new Set(filteredEmps.map(e => e.id)))}>
                  {allSelected ? 'Deselect All' : 'Select All'}
                </button>
              </div>

              {autoLoading && (
                <div className="mb-2 text-xs text-gray-400 flex items-center gap-1">⏳ Auto-selecting from yesterday…</div>
              )}
              {!autoLoading && autoCount !== null && (
                <div className={`mb-2 text-xs px-3 py-2 rounded border ${autoCount > 0 ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>
                  {autoCount > 0
                    ? <>📋 <strong>{autoCount}</strong> workers auto-selected from yesterday. Untick anyone absent.</>
                    : <>ℹ️ No yesterday records — select manually.</>}
                </div>
              )}
              <input className="form-control mb-2" placeholder="Search worker…"
                value={empSearch} onChange={e => setEmpSearch(e.target.value)} />
              <div className="border border-gray-200 rounded max-h-52 overflow-y-auto">
                {filteredEmps.map(emp => (
                  <label key={emp.id}
                    className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50 border-b border-gray-50 last:border-0 transition-colors ${checkedIds.has(emp.id) ? 'bg-blue-50' : ''}`}>
                    <input type="checkbox" className="accent-primary"
                      checked={checkedIds.has(emp.id)} onChange={() => toggleEmp(emp.id)} />
                    <span className="text-sm">{emp.full_name}</span>
                    {emp.id === myEmpId && <span className="text-xs text-primary font-medium">(me)</span>}
                  </label>
                ))}
              </div>
            </div>

            <button
              type="button" disabled={saving}
              onClick={handleCheckIn}
              className="btn btn-primary w-full">
              {saving ? 'Checking in…' : '✓ Check In'}
            </button>
          </div>
        )}
      </div>

      {/* ── My History ─── */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">My Attendance History</h2>
          <input type="month" className="form-control w-40" value={historyMonth}
            onChange={e => setHistoryMonth(e.target.value)} />
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
                        <td className="table-td">
                          {r.projects ? <span className="badge bg-blue-100 text-blue-700">{r.projects.code || r.projects.name}</span> : <span className="text-gray-400">—</span>}
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
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// ADMIN VIEW — photo review + approval + full records
// ══════════════════════════════════════════════════════════════════════
function AdminView() {
  const [records,  setRecords]  = useState<AttRecord[]>([]);
  const [empList,  setEmpList]  = useState<Employee[]>([]);
  const [projList, setProjList] = useState<Project[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [alertMsg, setAlertMsg] = useState('');
  const [alertType, setAlertType] = useState<'success' | 'danger' | 'info'>('success');
  const [filterMonth,   setFilterMonth]   = useState(getCurrentMonth());
  const [filterEmp,     setFilterEmp]     = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [filterStatus,  setFilterStatus]  = useState('');
  const [approving, setApproving] = useState<string | null>(null);

  // Per-group edit state: groupKey → { workHours, otHours, siteClean }
  const [groupEdits, setGroupEdits] = useState<Record<string, { workHours: number; otHours: number; siteClean: boolean }>>({});

  function showAlert(msg: string, type: 'success' | 'danger' | 'info' = 'success') {
    setAlertMsg(msg); setAlertType(type); setTimeout(() => setAlertMsg(''), 5000);
  }

  const loadData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterMonth)   params.set('month',       filterMonth);
    if (filterEmp)     params.set('employee_id', filterEmp);
    if (filterProject) params.set('project_id',  filterProject);
    if (filterStatus)  params.set('status',      filterStatus);
    const [recRes, empRes, projRes] = await Promise.all([
      fetch(`/api/attendance?${params}`).then(r => r.json()),
      fetch('/api/employees').then(r => r.json()),
      fetch('/api/projects').then(r => r.json()),
    ]);
    setRecords(Array.isArray(recRes)  ? recRes  : []);
    setEmpList(Array.isArray(empRes)  ? empRes.filter((e: Employee) => e.status === 'active') : []);
    setProjList(Array.isArray(projRes) ? projRes : []);
    setLoading(false);
  }, [filterMonth, filterEmp, filterProject, filterStatus]);

  useEffect(() => { loadData(); }, [loadData]);

  // Group pending records by date + project + submitted_by (a "session")
  const pendingGroups = useMemo(() => {
    const pending = records.filter(r => r.status === 'pending');
    const groups: Record<string, AttRecord[]> = {};
    for (const r of pending) {
      const key = `${r.work_date}__${r.project_id || 'none'}__${r.submitted_by || 'unknown'}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    }
    return groups;
  }, [records]);

  // Init group edits when pending groups change
  useEffect(() => {
    const init: typeof groupEdits = {};
    for (const [key, recs] of Object.entries(pendingGroups)) {
      if (!groupEdits[key]) {
        init[key] = {
          workHours: Math.min(8, Math.max(1, Math.round(Number(recs[0].hours_worked) - Number(recs[0].ot_hours)))),
          otHours:   Math.round(Number(recs[0].ot_hours)),
          siteClean: recs[0].site_clean,
        };
      }
    }
    if (Object.keys(init).length > 0) setGroupEdits(prev => ({ ...prev, ...init }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingGroups]);

  async function approveGroup(key: string, status: 'approved' | 'rejected') {
    const recs  = pendingGroups[key];
    const ids   = recs.map(r => r.id);
    const edits = groupEdits[key] || { workHours: 8, otHours: 0, siteClean: false };
    setApproving(key + status);
    try {
      const res = await fetch('/api/attendance/group', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids, status,
          site_clean: edits.siteClean,
          work_hours: edits.workHours,
          ot_hours:   edits.otHours,
        }),
      });
      if (!res.ok) { const d = await res.json(); showAlert(d.error, 'danger'); return; }
      showAlert(status === 'approved' ? `✅ ${ids.length} record${ids.length !== 1 ? 's' : ''} approved!` : `❌ ${ids.length} record${ids.length !== 1 ? 's' : ''} rejected.`, status === 'approved' ? 'success' : 'info');
      loadData();
    } finally { setApproving(null); }
  }

  const displayRecords = filterStatus
    ? records.filter(r => r.status === filterStatus)
    : records.filter(r => r.status !== 'pending');

  const hasPending = Object.keys(pendingGroups).length > 0;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-primary">Attendance</h1>

      {alertMsg && <div className={`alert alert-${alertType}`}>{alertMsg}</div>}

      {/* ── Pending Approvals ── */}
      {hasPending && (
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-yellow-600 mb-3 flex items-center gap-2">
            🟡 Pending Approvals
            <span className="badge bg-yellow-100 text-yellow-700">{Object.keys(pendingGroups).length} session{Object.keys(pendingGroups).length !== 1 ? 's' : ''}</span>
          </h2>

          <div className="space-y-4">
            {Object.entries(pendingGroups).map(([key, recs]) => {
              const proj = projList.find(p => p.id === recs[0].project_id);
              const edits = groupEdits[key] || { workHours: 8, otHours: 0, siteClean: false };
              const totalGong = ((edits.workHours + edits.otHours) / 8).toFixed(2);
              const sample = recs[0];

              return (
                <div key={key} className="card p-0 overflow-hidden border-l-4 border-yellow-400">
                  {/* Header */}
                  <div className="px-5 py-4 bg-yellow-50 border-b border-yellow-100 flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <p className="font-semibold text-gray-800">
                        {formatDate(sample.work_date)}
                        {proj ? <span className="ml-2 badge bg-blue-100 text-blue-700">{proj.name}{proj.code ? ` (${proj.code})` : ''}</span> : ''}
                      </p>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {recs.length} worker{recs.length !== 1 ? 's' : ''}
                        {sample.is_rework && <span className="ml-2 badge bg-orange-100 text-orange-700 text-xs">🔄 Rework</span>}
                      </p>
                    </div>
                    <div className="text-2xl font-bold text-primary">{totalGong} 工</div>
                  </div>

                  <div className="p-5 space-y-5">
                    {/* Workers list */}
                    <div>
                      <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-2">Workers</p>
                      <div className="flex flex-wrap gap-1.5">
                        {recs.map(r => (
                          <span key={r.id} className="badge bg-gray-100 text-gray-600 text-xs">
                            {r.employees?.full_name || r.employee_id}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Photos */}
                    <div>
                      <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-3">Photos</p>
                      <div className="flex gap-5 flex-wrap">
                        <div className="flex flex-col items-center gap-1">
                          <p className="text-xs text-gray-500">Check-In</p>
                          <Thumb url={sample.check_in_photo_url} alt="check-in" />
                        </div>
                        <div className="flex flex-col items-center gap-1">
                          <p className="text-xs text-gray-500">Check-Out</p>
                          <Thumb url={sample.check_out_photo_url} alt="check-out" />
                        </div>
                        <div className="w-px bg-gray-200" />
                        <div className="flex flex-col items-center gap-1">
                          <p className="text-xs text-gray-500">Site Front</p>
                          <Thumb url={sample.site_photo_front_url} alt="front" />
                        </div>
                        <div className="flex flex-col items-center gap-1">
                          <p className="text-xs text-gray-500">Site Back</p>
                          <Thumb url={sample.site_photo_back_url} alt="back" />
                        </div>
                        <div className="flex flex-col items-center gap-1">
                          <p className="text-xs text-gray-500">Site Store</p>
                          <Thumb url={sample.site_photo_store_url} alt="store" />
                        </div>
                      </div>
                    </div>

                    {/* Edit hours + site bonus */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-3">
                        <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Adjust Hours (optional)</p>
                        <div className="flex items-center gap-3">
                          <div>
                            <label className="form-label text-xs">Work</label>
                            <select className="form-control w-24"
                              value={edits.workHours}
                              onChange={e => setGroupEdits(g => ({ ...g, [key]: { ...edits, workHours: Number(e.target.value) } }))}>
                              {[1,2,3,4,5,6,7,8].map(h => <option key={h} value={h}>{h}h</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="form-label text-xs">OT</label>
                            <select className="form-control w-24"
                              value={edits.otHours}
                              onChange={e => setGroupEdits(g => ({ ...g, [key]: { ...edits, otHours: Number(e.target.value) } }))}>
                              {[0,1,2,3,4,5,6,7,8].map(h => <option key={h} value={h}>+{h}h</option>)}
                            </select>
                          </div>
                          <div className="pt-5 font-bold text-primary">{((edits.workHours + edits.otHours) / 8).toFixed(2)} 工</div>
                        </div>
                      </div>

                      <div>
                        <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-2">Site Bonus</p>
                        <label className={`flex items-start gap-3 cursor-pointer rounded-lg border p-3 transition-colors ${edits.siteClean ? 'bg-green-50 border-green-300' : 'bg-gray-50 border-gray-200'}`}>
                          <input type="checkbox" className="mt-0.5 w-4 h-4 accent-green-600"
                            checked={edits.siteClean}
                            onChange={e => setGroupEdits(g => ({ ...g, [key]: { ...edits, siteClean: e.target.checked } }))} />
                          <div>
                            <p className="text-sm font-medium text-gray-800">🧹 Site was clean</p>
                            <p className="text-xs text-gray-500">Grant +RM10 to workers ≥8h</p>
                            {edits.siteClean && (
                              <p className="text-xs text-green-700 font-semibold mt-1">
                                +RM10 × {recs.filter(r => (edits.workHours + edits.otHours) >= 8).length} workers
                              </p>
                            )}
                          </div>
                        </label>
                      </div>
                    </div>

                    {/* Approve / Reject */}
                    <div className="flex gap-3 pt-1">
                      <button
                        className="btn bg-green-500 hover:bg-green-600 text-white flex-1"
                        disabled={approving !== null}
                        onClick={() => approveGroup(key, 'approved')}>
                        {approving === key + 'approved' ? '…' : `✓ Approve ${recs.length} Records`}
                      </button>
                      <button
                        className="btn btn-danger"
                        disabled={approving !== null}
                        onClick={() => approveGroup(key, 'rejected')}>
                        {approving === key + 'rejected' ? '…' : '✗ Reject'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Filters ── */}
      <div className="card p-4">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div>
            <label className="form-label">Month</label>
            <input type="month" className="form-control" value={filterMonth} onChange={e => setFilterMonth(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Employee</label>
            <select className="form-control" value={filterEmp} onChange={e => setFilterEmp(e.target.value)}>
              <option value="">All</option>
              {empList.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Project</label>
            <select className="form-control" value={filterProject} onChange={e => setFilterProject(e.target.value)}>
              <option value="">All</option>
              {projList.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Status</label>
            <select className="form-control" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">All (excl. pending)</option>
              <option value="draft">Draft</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          <div><button className="btn btn-outline w-full" onClick={loadData}>Refresh</button></div>
        </div>
      </div>

      {/* ── Records Table ── */}
      <div className="card p-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-bg text-sm font-semibold text-primary">
          {displayRecords.length} record{displayRecords.length !== 1 ? 's' : ''}
          {!filterStatus && hasPending && <span className="ml-2 text-yellow-600 text-xs">(+ pending above)</span>}
        </div>
        <div className="overflow-x-auto">
          {loading ? <div className="p-8 text-center text-gray-400">Loading…</div>
          : displayRecords.length === 0 ? <div className="p-8 text-center text-gray-400">No records found.</div>
          : (
            <table className="w-full">
              <thead><tr>
                <th className="table-th">Date</th>
                <th className="table-th">Name</th>
                <th className="table-th">Project</th>
                <th className="table-th">Gong 工</th>
                <th className="table-th">OT</th>
                <th className="table-th">Site Bonus</th>
                <th className="table-th">Photos</th>
                <th className="table-th">Status</th>
                <th className="table-th">Actions</th>
              </tr></thead>
              <tbody>
                {displayRecords.map(rec => (
                  <tr key={rec.id} className={`table-tr ${rec.is_rework ? 'bg-orange-50' : ''}`}>
                    <td className="table-td whitespace-nowrap text-sm">{formatDate(rec.work_date)}</td>
                    <td className="table-td font-medium">{rec.employees?.full_name || '—'}</td>
                    <td className="table-td">
                      {rec.projects
                        ? <span className="badge bg-blue-100 text-blue-700">{rec.projects.code || rec.projects.name}</span>
                        : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="table-td font-semibold">{Number(rec.days_worked).toFixed(2)} 工</td>
                    <td className="table-td text-gray-500">{Number(rec.ot_hours) > 0 ? `+${Number(rec.ot_hours)}h` : '—'}</td>
                    <td className="table-td">
                      {Number(rec.site_bonus) > 0
                        ? <span className="badge bg-green-100 text-green-700">+RM{Number(rec.site_bonus).toFixed(2)}</span>
                        : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="table-td">
                      <div className="flex gap-1">
                        <Thumb url={rec.check_in_photo_url}  alt="in" />
                        <Thumb url={rec.check_out_photo_url} alt="out" />
                      </div>
                    </td>
                    <td className="table-td"><StatusBadge status={rec.status} /></td>
                    <td className="table-td">
                      <button className="btn btn-danger btn-sm"
                        onClick={async () => {
                          if (!confirm('Delete this record?')) return;
                          await fetch(`/api/attendance/${rec.id}`, { method: 'DELETE' });
                          loadData();
                        }}>Del</button>
                    </td>
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
// ROOT — route to correct view
// ══════════════════════════════════════════════════════════════════════
export default function AttendancePage() {
  const { role, loaded } = useRole();
  if (!loaded) return <div className="p-8 text-center text-gray-400">Loading…</div>;
  if (role === 'worker') return <WorkerView />;
  if (role === 'leader') return <LeaderView />;
  return <AdminView />;
}
