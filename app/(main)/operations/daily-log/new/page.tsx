'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useRole } from '@/lib/role-context';

interface Project { id: string; name: string; code: string | null; }
interface Milestone { id: string; name: string; status: string; sequence_order: number; }

const WEATHER_OPTIONS = [
  { value: 'sunny',        label: '☀️ Sunny',        },
  { value: 'cloudy',       label: '⛅ Cloudy',       },
  { value: 'rainy',        label: '🌧️ Rainy',        },
  { value: 'stopped work', label: '⛔ Stopped Work', },
];

export default function NewDailyLogPage() {
  const { role, loaded } = useRole();
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedProject = searchParams.get('project_id');

  const [projects,   setProjects]   = useState<Project[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState('');
  const [success,    setSuccess]    = useState('');
  const [uploading,  setUploading]  = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const today = new Date().toISOString().split('T')[0];

  const [form, setForm] = useState({
    project_id:      preselectedProject || '',
    log_date:        today,
    weather:         'sunny',
    workers_present: '',
    milestone_id:    '',
    work_done:       '',
    issues_found:    '',
    materials_used:  '',
    photo_url:       '',
  });

  useEffect(() => {
    if (!loaded) return;
    if (role !== 'owner' && role !== 'admin' && role !== 'editor') {
      router.replace('/');
      return;
    }
    fetch('/api/operations/projects?active_only=1')
      .then(r => r.json())
      .then(d => { setProjects(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [loaded, role, router]);

  useEffect(() => {
    if (!form.project_id) { setMilestones([]); return; }
    fetch(`/api/operations/milestones?project_id=${form.project_id}`)
      .then(r => r.json())
      .then(d => setMilestones(Array.isArray(d) ? d.filter((m: Milestone) => m.status !== 'completed') : []))
      .catch(() => {});
  }, [form.project_id]);

  async function uploadPhoto(file: File) {
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    const res  = await fetch('/api/operations/upload-photo', { method: 'POST', body: fd });
    const data = await res.json();
    setUploading(false);
    if (res.ok) setForm(f => ({ ...f, photo_url: data.url }));
    else setError(data.error || 'Photo upload failed.');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.project_id)   { setError('Please select a project.'); return; }
    if (!form.work_done.trim()) { setError('Please describe the work done today.'); return; }

    setSaving(true);
    const res = await fetch('/api/operations/daily-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        workers_present: form.workers_present ? Number(form.workers_present) : null,
        milestone_id:    form.milestone_id || null,
        photo_url:       form.photo_url || null,
      }),
    });
    const data = await res.json();
    setSaving(false);

    if (!res.ok) { setError(data.error || 'Failed to submit log.'); return; }
    setSuccess('Daily log submitted successfully!');
    setTimeout(() => router.push('/operations'), 1500);
  }

  if (!loaded || loading) {
    return (
      <div className="max-w-lg mx-auto px-4 py-8">
        <div style={{ height: 24, background: '#E8D5A3', borderRadius: 4, marginBottom: 24, width: 200 }} />
        {[...Array(5)].map((_, i) => (
          <div key={i} style={{ height: 48, background: '#F5EDD6', borderRadius: 6, marginBottom: 12 }} />
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pb-20">
      <div className="mb-4">
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 22, fontWeight: 700, color: '#2C1A0E', marginBottom: 2 }}>
          Daily Site Log
        </h1>
        <p style={{ color: '#C49A6C', fontSize: 13 }}>Submit today&apos;s on-site progress report</p>
      </div>

      {success ? (
        <div className="alert alert-success" style={{ fontSize: 15, padding: '16px 20px' }}>
          ✅ {success}
        </div>
      ) : (
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {error && <div className="alert alert-danger">{error}</div>}

          {/* Project */}
          <div>
            <label className="form-label">Project *</label>
            <select
              className="form-control"
              style={{ fontSize: 16, padding: '12px 14px' }}
              value={form.project_id}
              onChange={e => setForm(f => ({ ...f, project_id: e.target.value, milestone_id: '' }))}>
              <option value="">— Select a project —</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}{p.code ? ` (${p.code})` : ''}</option>
              ))}
            </select>
          </div>

          {/* Date */}
          <div>
            <label className="form-label">Date *</label>
            <input
              type="date"
              className="form-control"
              style={{ fontSize: 16, padding: '12px 14px' }}
              value={form.log_date}
              max={today}
              onChange={e => setForm(f => ({ ...f, log_date: e.target.value }))}
              required
            />
          </div>

          {/* Weather */}
          <div>
            <label className="form-label">Weather *</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {WEATHER_OPTIONS.map(w => (
                <button type="button" key={w.value}
                  onClick={() => setForm(f => ({ ...f, weather: w.value }))}
                  style={{
                    padding: '12px 8px', borderRadius: 8, fontSize: 14, fontWeight: form.weather === w.value ? 700 : 400,
                    border: form.weather === w.value ? '2px solid #C9A84C' : '1px solid #C49A6C',
                    background: form.weather === w.value ? '#FAF5E9' : 'white',
                    color: form.weather === w.value ? '#2C1A0E' : '#6B4A00',
                    cursor: 'pointer', transition: 'all 0.1s',
                  }}>
                  {w.label}
                </button>
              ))}
            </div>
          </div>

          {/* Workers present */}
          <div>
            <label className="form-label">Workers Present</label>
            <input
              type="number" min="0"
              className="form-control"
              style={{ fontSize: 16, padding: '12px 14px' }}
              value={form.workers_present}
              onChange={e => setForm(f => ({ ...f, workers_present: e.target.value }))}
              placeholder="Number of workers on site"
            />
          </div>

          {/* Milestone */}
          {milestones.length > 0 && (
            <div>
              <label className="form-label">Milestone Working On</label>
              <select
                className="form-control"
                style={{ fontSize: 16, padding: '12px 14px' }}
                value={form.milestone_id}
                onChange={e => setForm(f => ({ ...f, milestone_id: e.target.value }))}>
                <option value="">— Not specified —</option>
                {milestones.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          )}

          {/* Work done */}
          <div>
            <label className="form-label">Work Done Today *</label>
            <textarea
              className="form-control"
              style={{ fontSize: 15, padding: '12px 14px', minHeight: 100, resize: 'vertical' }}
              value={form.work_done}
              onChange={e => setForm(f => ({ ...f, work_done: e.target.value }))}
              placeholder="Describe the work completed today…"
              required
            />
          </div>

          {/* Issues */}
          <div>
            <label className="form-label">Issues / Problems Found</label>
            <textarea
              className="form-control"
              style={{ fontSize: 15, padding: '12px 14px', minHeight: 80, resize: 'vertical' }}
              value={form.issues_found}
              onChange={e => setForm(f => ({ ...f, issues_found: e.target.value }))}
              placeholder="Any problems, blockers, or concerns…"
            />
          </div>

          {/* Materials */}
          <div>
            <label className="form-label">Materials Used Today</label>
            <textarea
              className="form-control"
              style={{ fontSize: 15, padding: '12px 14px', minHeight: 70, resize: 'vertical' }}
              value={form.materials_used}
              onChange={e => setForm(f => ({ ...f, materials_used: e.target.value }))}
              placeholder="Cement, bricks, rebar, tiles…"
            />
          </div>

          {/* Photo upload */}
          <div>
            <label className="form-label">Site Photo</label>
            {form.photo_url ? (
              <div style={{ position: 'relative', marginBottom: 8 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={form.photo_url} alt="Site" style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 8 }} />
                <button type="button"
                  onClick={() => setForm(f => ({ ...f, photo_url: '' }))}
                  style={{ position: 'absolute', top: 8, right: 8, background: '#791f1f', color: 'white', border: 'none', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', fontSize: 14 }}>
                  ×
                </button>
              </div>
            ) : (
              <button type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                style={{
                  width: '100%', padding: '20px 16px', border: '2px dashed #C49A6C', borderRadius: 8,
                  background: '#FAF5E9', color: '#6B4A00', fontSize: 15, cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                }}>
                <span style={{ fontSize: 28 }}>📷</span>
                <span>{uploading ? 'Uploading…' : 'Tap to take / upload photo'}</span>
                <span style={{ fontSize: 11, color: '#C49A6C' }}>Max 10MB · JPG, PNG, HEIC</span>
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) uploadPhoto(f);
                e.target.value = '';
              }}
            />
          </div>

          {/* Submit button */}
          <button
            type="submit"
            disabled={saving || uploading}
            className="btn btn-primary"
            style={{ fontSize: 16, padding: '14px 0', borderRadius: 8, marginTop: 8 }}>
            {saving ? 'Submitting…' : '✅ Submit Daily Log'}
          </button>
        </form>
      )}
    </div>
  );
}
