'use client';
// One-tap attendance for site editors: photo -> auto time -> confirm. Shown only to accounts
// listed in app_settings.quick_attendance_usernames (see AttendancePage root).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { calcHoursFromTimes, DEFAULT_SCHEDULE, WorkSchedule } from '@/lib/work-schedule';
import { mytTime, roundCheckIn, roundTime } from '@/lib/photo-time';

interface Emp  { id: string; full_name: string; status: string; }
interface Proj { id: string; name: string; code: string | null; status: string; }
interface Rec {
  id: string; employee_id: string; project_id: string | null; work_date: string; status: string;
  days_worked: number; site_bonus: number;
  check_in_time: string | null; check_out_time: string | null;
  check_in_photo_url: string | null; check_out_photo_url: string | null;
  site_photo_front_url: string | null; site_photo_back_url: string | null; site_photo_store_url: string | null;
  projects: { name: string; code: string | null } | null;
}
interface Photo { url: string; takenAt: number; }
interface Row  { employee_id: string; full_name: string; check_in_time: string; check_out_time: string; late?: boolean; }

const today = () => {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
};
const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : '');

// Shrink phone photos before upload — faster on mobile data and well under the 10 MB limit.
async function shrink(file: File, max = 1600): Promise<File> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>(r => c.toBlob(r, 'image/jpeg', 0.82));
    return blob ? new File([blob], 'photo.jpg', { type: 'image/jpeg' }) : file;
  } catch { return file; }
}

// ── Camera tile: opens the phone camera, uploads, returns url + the moment it was taken ──
function CameraTile({ label, type, photoLabel, value, onChange, big }: {
  label: string; type: string; photoLabel?: string; big?: boolean;
  value: Photo | null; onChange: (p: Photo | null) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState('');

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true); setErr('');
    try {
      const small = await shrink(f);
      const fd = new FormData();
      fd.append('file', small); fd.append('type', type);
      if (photoLabel) fd.append('label', photoLabel);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || 'Upload failed');
      onChange({ url: data.url, takenAt: Number(data.taken_at) || Date.now() });
    } catch { setErr('Photo failed. Tap to try again.'); }
    finally { setBusy(false); if (ref.current) ref.current.value = ''; }
  }

  const size = big ? 'h-56' : 'h-28';
  return (
    <div className="flex-1 min-w-[96px]">
      <p className="text-sm font-semibold text-gray-700 mb-1.5 text-center">{label}</p>
      <input ref={ref} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
      <button type="button" disabled={busy} onClick={() => ref.current?.click()}
        className={`w-full ${size} rounded-xl border-2 overflow-hidden flex items-center justify-center transition
          ${value ? 'border-green-500' : err ? 'border-red-400 bg-red-50' : 'border-dashed border-primary bg-white'}`}>
        {busy ? <span className="text-3xl animate-pulse">⏳</span>
          : value ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={value.url.replace(/\.jpg$/i, '_thumb.jpg')} onError={e => { (e.target as HTMLImageElement).src = value.url; }} alt={label} className="w-full h-full object-cover" />
          : <span className={big ? 'text-7xl' : 'text-4xl'}>📷</span>}
      </button>
      {value && <p className="text-center text-xs text-green-700 font-semibold mt-1">✓ {mytTime(value.takenAt)}</p>}
      {err && <p className="text-center text-xs text-red-600 mt-1">{err}</p>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
export default function QuickAttendance() {
  const [emps, setEmps]       = useState<Emp[]>([]);
  const [projs, setProjs]     = useState<Proj[]>([]);
  const [recs, setRecs]       = useState<Rec[]>([]);      // everything this editor ever submitted
  const [schedule, setSchedule] = useState<WorkSchedule>(DEFAULT_SCHEDULE);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg]         = useState<{ text: string; type: 'ok' | 'err' } | null>(null);
  const [mode, setMode]       = useState<'home' | 'in' | 'out'>('home');
  const [outProject, setOutProject] = useState<string>('none');

  const flash = (text: string, type: 'ok' | 'err' = 'ok') => { setMsg({ text, type }); setTimeout(() => setMsg(null), 6000); };

  const load = useCallback(async () => {
    const [e, p, r, s] = await Promise.all([
      fetch('/api/employees').then(x => x.json()),
      fetch('/api/projects').then(x => x.json()),
      fetch('/api/attendance?limit=400').then(x => x.json()),
      fetch('/api/settings/app').then(x => x.json()).catch(() => ({})),
    ]);
    setEmps(Array.isArray(e) ? e.filter((x: Emp) => x.status === 'active') : []);
    setProjs(Array.isArray(p) ? p : []);
    setRecs(Array.isArray(r) ? r : []);
    if (s?.work_schedule) { try { setSchedule(JSON.parse(s.work_schedule)); } catch { /* default */ } }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const empName = (id: string) => emps.find(e => e.id === id)?.full_name || '—';
  const todayRecs = useMemo(() => recs.filter(r => r.work_date === today()), [recs]);

  const group = (list: Rec[]) => {
    const m: Record<string, Rec[]> = {};
    for (const r of list) (m[r.project_id || 'none'] ||= []).push(r);
    return Object.entries(m);
  };
  const draftSessions = useMemo(() => group(todayRecs.filter(r => r.status === 'draft')), [todayRecs]);
  const doneSessions  = useMemo(() => group(todayRecs.filter(r => r.status !== 'draft')), [todayRecs]);
  const projName = (id: string) => id === 'none' ? 'No project' : (projs.find(p => p.id === id)?.name || 'Site');

  if (loading) return <div className="p-8 text-center text-gray-400">Loading…</div>;

  return (
    <div className="p-4 max-w-xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-primary">Attendance</h1>
        <p className="text-sm text-gray-500">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      </div>
      {msg && <div className={`alert ${msg.type === 'ok' ? 'alert-success' : 'alert-danger'}`}>{msg.text}</div>}

      {mode === 'home' && (
        <>
          {/* Submitted today — summary */}
          {doneSessions.map(([pid, list]) => <Summary key={pid} title={projName(pid)} list={list} empName={empName} />)}

          {/* Big actions */}
          {draftSessions.map(([pid, list]) => (
            <button key={pid} onClick={() => { setOutProject(pid); setMode('out'); }}
              className="w-full rounded-2xl bg-primary text-white py-6 px-4 text-left shadow">
              <span className="block text-2xl font-bold">🌇 Check out</span>
              <span className="block text-sm opacity-90 mt-1">{projName(pid)} · {list.length} workers checked in</span>
            </button>
          ))}
          <button onClick={() => setMode('in')}
            className={`w-full rounded-2xl py-6 px-4 text-left shadow ${draftSessions.length ? 'bg-white border-2 border-primary text-primary' : 'bg-green-600 text-white'}`}>
            <span className="block text-2xl font-bold">🌅 {draftSessions.length ? 'Check in another site' : 'Check in'}</span>
            <span className="block text-sm opacity-90 mt-1">Take the group photo</span>
          </button>
        </>
      )}

      {mode === 'in' && (
        <CheckIn emps={emps} projs={projs} recs={recs} schedule={schedule}
          taken={new Set(draftSessions.map(([pid]) => pid))}
          onCancel={() => setMode('home')}
          onDone={(n) => { flash(`Checked in ${n} workers ✅`); setMode('home'); load(); }}
          onError={m => flash(m, 'err')} />
      )}

      {mode === 'out' && (
        <CheckOut emps={emps} schedule={schedule} project={outProject} projName={projName(outProject)}
          drafts={draftSessions.find(([pid]) => pid === outProject)?.[1] || []}
          onCancel={() => setMode('home')}
          onDone={(n) => { flash(`Submitted ${n} workers for approval ✅`); setMode('home'); load(); }}
          onError={m => flash(m, 'err')} />
      )}
    </div>
  );
}

// ── Morning ─────────────────────────────────────────────────────────────
function CheckIn({ emps, projs, recs, schedule, taken, onCancel, onDone, onError }: {
  emps: Emp[]; projs: Proj[]; recs: Rec[]; schedule: WorkSchedule; taken: Set<string>;
  onCancel: () => void; onDone: (n: number) => void; onError: (m: string) => void;
}) {
  const active = projs.filter(p => p.status === 'active' && !taken.has(p.id));
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [projectId, setProjectId] = useState('');
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const activeIds = useMemo(() => new Set(emps.map(e => e.id)), [emps]);

  // Most recent earlier working day that has records for a project (or any project if none given).
  const lastDayFor = useCallback((pid: string | null) => {
    const past = recs.filter(r => r.work_date < today() && (pid === null || (r.project_id || '') === pid));
    const d = past.map(r => r.work_date).sort().pop();
    return { date: d || null, list: d ? past.filter(r => r.work_date === d) : [] };
  }, [recs]);

  function applyDefaults(pid: string) {
    const { list } = lastDayFor(pid);
    const ids = list.map(r => r.employee_id).filter(id => activeIds.has(id));
    setChecked(new Set(ids));
    setNote(ids.length ? `Same workers as ${lastDayFor(pid).date}. Untick anyone absent.` : 'No earlier record for this site. Tick the workers.');
  }

  // Default site = where this editor submitted most recently (yesterday / last working day).
  const initialised = useRef(false);
  useEffect(() => {
    if (initialised.current || !emps.length) return;
    initialised.current = true;
    const { list } = lastDayFor(null);
    const counts: Record<string, number> = {};
    for (const r of list) counts[r.project_id || ''] = (counts[r.project_id || ''] || 0) + 1;
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k]) => k).find(k => k === '' || !taken.has(k)) ?? '';
    setProjectId(best);
    applyDefaults(best);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emps.length]);

  const inTime = photo ? roundCheckIn(mytTime(photo.takenAt), schedule.default_start) : null;

  async function confirm() {
    if (!photo) return;
    if (checked.size === 0) { onError('Tick at least one worker.'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/attendance', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'draft', auto_time: true, project_id: projectId || null, work_date: today(),
          employee_ids: Array.from(checked), check_in_photo_url: photo.url,
        }),
      });
      const data = await res.json();
      if (!res.ok) { onError(data.error || 'Could not check in.'); return; }
      onDone(data.inserted?.length || 0);
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <p className="text-lg font-bold text-gray-800">1. Group photo</p>
        <CameraTile big label="Everyone together" type="check_in_photo" value={photo} onChange={setPhoto} />
        {inTime && (
          <p className="text-center text-lg">Check-in time <strong className="text-primary text-2xl">{inTime}</strong></p>
        )}
      </div>

      {photo && (
        <div className="card space-y-3">
          <p className="text-lg font-bold text-gray-800">2. Site and workers</p>
          <select className="form-control text-base" value={projectId}
            onChange={e => { setProjectId(e.target.value); applyDefaults(e.target.value); }}>
            <option value="">No project</option>
            {active.map(p => <option key={p.id} value={p.id}>{p.name}{p.code ? ` (${p.code})` : ''}</option>)}
          </select>
          {note && <p className="text-sm text-blue-700 bg-blue-50 rounded-lg px-3 py-2">{note}</p>}
          <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 max-h-80 overflow-y-auto">
            {emps.map(e => (
              <label key={e.id} className={`flex items-center gap-3 px-4 py-3 cursor-pointer ${checked.has(e.id) ? 'bg-green-50' : ''}`}>
                <input type="checkbox" className="w-6 h-6 accent-green-600" checked={checked.has(e.id)}
                  onChange={() => setChecked(prev => { const n = new Set(prev); n.has(e.id) ? n.delete(e.id) : n.add(e.id); return n; })} />
                <span className="text-base">{e.full_name}</span>
              </label>
            ))}
          </div>
          <button disabled={saving} onClick={confirm} className="w-full rounded-2xl bg-green-600 text-white text-xl font-bold py-4">
            {saving ? 'Saving…' : `✓ Confirm ${checked.size} workers`}
          </button>
        </div>
      )}
      <button onClick={onCancel} className="w-full text-sm text-gray-500 py-2">← Back</button>
    </div>
  );
}

// ── Afternoon ───────────────────────────────────────────────────────────
function CheckOut({ emps, schedule, project, projName, drafts, onCancel, onDone, onError }: {
  emps: Emp[]; schedule: WorkSchedule; project: string; projName: string; drafts: Rec[];
  onCancel: () => void; onDone: (n: number) => void; onError: (m: string) => void;
}) {
  const [co, setCo] = useState<Photo | null>(null);
  const [front, setFront] = useState<Photo | null>(null);
  const [back, setBack]   = useState<Photo | null>(null);
  const [store, setStore] = useState<Photo | null>(null);
  const [rows, setRows]   = useState<Row[]>([]);
  const [late, setLate]   = useState<Row[]>([]);
  const [addId, setAddId] = useState('');
  const [saving, setSaving] = useState(false);

  const outTime = co ? roundTime(mytTime(co.takenAt)) : schedule.work_end;
  const photosDone = !!(co && front && back && store);

  // Pre-fill every worker: in = the morning check-in time, out = the check-out photo time.
  useEffect(() => {
    if (!photosDone) return;
    setRows(drafts.map(d => ({
      employee_id: d.employee_id,
      full_name: emps.find(e => e.id === d.employee_id)?.full_name || d.employee_id,
      check_in_time: hhmm(d.check_in_time) || schedule.default_start,
      check_out_time: outTime,
    })));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photosDone, outTime]);

  const set = (list: 'rows' | 'late', i: number, f: 'check_in_time' | 'check_out_time', v: string) =>
    (list === 'rows' ? setRows : setLate)(rs => rs.map((r, idx) => idx === i ? { ...r, [f]: v } : r));

  const draftedIds = new Set(drafts.map(d => d.employee_id));
  const addable = emps.filter(e => !draftedIds.has(e.id) && !late.some(l => l.employee_id === e.id));

  async function submit() {
    const all = [...rows, ...late];
    const bad = all.find(r => !r.check_in_time || !r.check_out_time || r.check_out_time <= r.check_in_time);
    if (bad) { onError(`${bad.full_name}: out time must be after in time.`); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/attendance/complete', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: project === 'none' ? null : project,
          work_date: drafts[0]?.work_date || today(),
          workers: rows.map(r => ({ employee_id: r.employee_id, check_in_time: r.check_in_time, check_out_time: r.check_out_time })),
          new_workers: late.map(r => ({ employee_id: r.employee_id, check_in_time: r.check_in_time, check_out_time: r.check_out_time })),
          check_out_photo_url: co!.url, site_photo_front_url: front!.url,
          site_photo_back_url: back!.url, site_photo_store_url: store!.url,
        }),
      });
      const data = await res.json();
      if (!res.ok) { onError(data.error || 'Could not submit.'); return; }
      onDone(data.updated || 0);
    } finally { setSaving(false); }
  }

  const gong = (r: Row) => calcHoursFromTimes(r.check_in_time, r.check_out_time, schedule).days_worked;
  const timeInput = 'w-[86px] text-base border border-gray-300 rounded-lg px-1.5 py-1.5 bg-white';

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">{projName} · {drafts.length} workers checked in</p>
      <div className="card space-y-3">
        <p className="text-lg font-bold text-gray-800">1. Check-out photo</p>
        <CameraTile big label="Everyone together" type="check_out_photo" value={co} onChange={setCo} />
        {co && <p className="text-center text-lg">Check-out time <strong className="text-primary text-2xl">{outTime}</strong></p>}
      </div>

      {co && (
        <div className="card space-y-3">
          <p className="text-lg font-bold text-gray-800">2. Site photos <span className="text-sm font-normal text-gray-500">(for site bonus)</span></p>
          <div className="flex gap-3">
            <CameraTile label="Front" type="site_front" photoLabel="front" value={front} onChange={setFront} />
            <CameraTile label="Back"  type="site_back"  photoLabel="back"  value={back}  onChange={setBack} />
            <CameraTile label="Store" type="site_store" photoLabel="store" value={store} onChange={setStore} />
          </div>
        </div>
      )}

      {photosDone && (
        <div className="card space-y-3">
          <p className="text-lg font-bold text-gray-800">3. Check the times</p>
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-3 py-2 bg-gray-50 text-xs font-semibold text-gray-500 uppercase">
              <span>Worker</span><span className="w-[86px] text-center">In</span><span className="w-[86px] text-center">Out</span><span className="w-10 text-right">工</span>
            </div>
            {[...rows.map((r, i) => ({ r, i, l: false })), ...late.map((r, i) => ({ r, i, l: true }))].map(({ r, i, l }) => (
              <div key={r.employee_id} className={`grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 px-3 py-2.5 border-t border-gray-100 ${l ? 'bg-blue-50' : ''}`}>
                <span className="text-sm leading-tight break-words">
                  {r.full_name}{l && <span className="text-xs text-blue-500"> (late)</span>}
                </span>
                <input type="time" className={timeInput} value={r.check_in_time} onChange={e => set(l ? 'late' : 'rows', i, 'check_in_time', e.target.value)} />
                <input type="time" className={timeInput} value={r.check_out_time} onChange={e => set(l ? 'late' : 'rows', i, 'check_out_time', e.target.value)} />
                <span className="w-10 text-right text-sm font-bold text-primary">{gong(r).toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <select className="form-control flex-1" value={addId} onChange={e => setAddId(e.target.value)}>
              <option value="">+ Add a worker who joined late…</option>
              {addable.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
            </select>
            <button disabled={!addId} className="btn btn-primary" onClick={() => {
              const e = emps.find(x => x.id === addId); if (!e) return;
              setLate(l => [...l, { employee_id: e.id, full_name: e.full_name, check_in_time: schedule.default_start, check_out_time: outTime, late: true }]);
              setAddId('');
            }}>Add</button>
          </div>
          <button disabled={saving} onClick={submit} className="w-full rounded-2xl bg-primary text-white text-xl font-bold py-4">
            {saving ? 'Submitting…' : '✓ Confirm and submit'}
          </button>
        </div>
      )}
      <button onClick={onCancel} className="w-full text-sm text-gray-500 py-2">← Back</button>
    </div>
  );
}

// ── Summary of a submitted session ──────────────────────────────────────
function Summary({ title, list, empName }: { title: string; list: Rec[]; empName: (id: string) => string }) {
  const first = list[0];
  const status = list.some(r => r.status === 'rejected') ? 'rejected' : list.some(r => r.status === 'pending') ? 'pending' : 'approved';
  const ins  = list.map(r => hhmm(r.check_in_time)).filter(Boolean).sort();
  const outs = list.map(r => hhmm(r.check_out_time)).filter(Boolean).sort();
  const total = list.reduce((s, r) => s + Number(r.days_worked || 0), 0);
  const tone = status === 'approved' ? 'border-green-400 bg-green-50 text-green-800'
    : status === 'rejected' ? 'border-red-400 bg-red-50 text-red-800' : 'border-yellow-400 bg-yellow-50 text-yellow-800';
  const photos: [string, string | null][] = [
    ['Check-in', first.check_in_photo_url], ['Check-out', first.check_out_photo_url],
    ['Front', first.site_photo_front_url], ['Back', first.site_photo_back_url], ['Store', first.site_photo_store_url],
  ];
  return (
    <div className={`card border-l-4 space-y-3 ${tone}`}>
      <div>
        <p className="font-bold text-lg">{status === 'approved' ? '✅' : status === 'rejected' ? '❌' : '🟡'} {title}</p>
        <p className="text-sm">{status === 'approved' ? 'Approved' : status === 'rejected' ? 'Rejected — contact admin' : 'Submitted, waiting for approval'}
          {' · '}{list.length} workers · {total.toFixed(2)} 工 · {ins[0] || '—'} to {outs[outs.length - 1] || '—'}</p>
      </div>
      <div className="flex gap-2 flex-wrap">
        {photos.filter(([, u]) => u).map(([l, u]) => (
          <a key={l} href={u!} target="_blank" rel="noopener noreferrer" className="text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={u!.replace(/\.jpg$/i, '_thumb.jpg')} onError={e => { (e.target as HTMLImageElement).src = u!; }} alt={l} className="w-16 h-16 object-cover rounded-lg border border-black/10" />
            <span className="text-xs">{l}</span>
          </a>
        ))}
      </div>
      <div className="bg-white/70 rounded-lg overflow-hidden text-gray-800">
        {list.map(r => (
          <div key={r.id} className="grid grid-cols-[1fr_auto_auto] gap-3 px-3 py-2 text-sm border-t border-black/5 first:border-0">
            <span>{empName(r.employee_id)}</span>
            <span className="font-mono text-xs self-center">{hhmm(r.check_in_time) || '—'} – {hhmm(r.check_out_time) || '—'}</span>
            <span className="font-bold text-right w-10">{Number(r.days_worked || 0).toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
