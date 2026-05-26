'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRole } from '@/lib/role-context';
import { useRouter } from 'next/navigation';

interface Log {
  id: string;
  log_date: string;
  weather: string;
  workers_present: number | null;
  work_done: string;
  issues_found: string | null;
  materials_used: string | null;
  photo_url: string | null;
  projects: { name: string; code: string | null } | null;
  users: { username: string } | null;
}
interface Project { id: string; name: string; code: string | null; }

const WEATHER_ICONS: Record<string, string> = {
  sunny: '☀️', cloudy: '⛅', rainy: '🌧️', 'stopped work': '⛔',
};

function fmtDate(s: string) { return new Date(s).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }); }

export default function DailyLogHistoryPage() {
  const { role, loaded } = useRole();
  const router = useRouter();

  const [logs,     setLogs]     = useState<Log[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Filters
  const [filterProject, setFilterProject] = useState('');
  const [filterFrom,    setFilterFrom]    = useState('');
  const [filterTo,      setFilterTo]      = useState('');

  const isManager = role === 'owner' || role === 'admin';

  useEffect(() => {
    if (!loaded) return;
    if (role !== 'owner' && role !== 'admin' && role !== 'editor') { router.replace('/operations'); return; }
    // Fetch projects for filter (admin/owner only)
    if (isManager) {
      fetch('/api/operations/projects')
        .then(r => r.json())
        .then(d => setProjects(Array.isArray(d) ? d : []))
        .catch(() => {});
    }
    fetchLogs();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, role]);

  function fetchLogs() {
    setLoading(true);
    const params = new URLSearchParams({ limit: '200' });
    if (filterProject) params.set('project_id', filterProject);
    if (filterFrom)    params.set('from', filterFrom);
    if (filterTo)      params.set('to', filterTo);

    fetch(`/api/operations/daily-logs?${params}`)
      .then(r => r.json())
      .then(d => { setLogs(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }

  function applyFilters(e: React.FormEvent) {
    e.preventDefault();
    fetchLogs();
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 22, fontWeight: 700, color: '#2C1A0E' }}>Daily Log History</h1>
          <p style={{ color: '#C49A6C', fontSize: 13 }}>{logs.length} log{logs.length !== 1 ? 's' : ''} found</p>
        </div>
        <Link href="/operations/daily-log/new" className="btn btn-primary">+ Submit Log</Link>
      </div>

      {/* Filters */}
      <form onSubmit={applyFilters} className="card" style={{ padding: '16px 20px', marginBottom: 20 }}>
        <div className="flex flex-wrap gap-3 items-end">
          {isManager && (
            <div style={{ flex: '1 1 180px' }}>
              <label className="form-label">Project</label>
              <select className="form-control" value={filterProject} onChange={e => setFilterProject(e.target.value)}>
                <option value="">All Projects</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}
          <div style={{ flex: '1 1 140px' }}>
            <label className="form-label">From Date</label>
            <input type="date" className="form-control" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} />
          </div>
          <div style={{ flex: '1 1 140px' }}>
            <label className="form-label">To Date</label>
            <input type="date" className="form-control" value={filterTo} onChange={e => setFilterTo(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn btn-primary btn-sm">Search</button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => {
              setFilterProject(''); setFilterFrom(''); setFilterTo('');
              setTimeout(fetchLogs, 50);
            }}>Clear</button>
          </div>
        </div>
      </form>

      {/* Logs list */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[...Array(5)].map((_, i) => (
            <div key={i} className="card" style={{ marginBottom: 0, height: 70, background: i % 2 === 0 ? '#F5EDD6' : 'white' }} />
          ))}
        </div>
      ) : logs.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px', color: '#C49A6C' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
          <p>No logs found{filterProject || filterFrom || filterTo ? ' for the selected filters.' : ' yet.'}</p>
          <Link href="/operations/daily-log/new" className="btn btn-primary btn-sm" style={{ marginTop: 12, display: 'inline-flex' }}>Submit First Log</Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {logs.map(log => (
            <div key={log.id} className="card" style={{ marginBottom: 0 }}>
              {/* Summary row — click to expand */}
              <div
                className="flex items-center gap-3 cursor-pointer"
                onClick={() => setExpanded(expanded === log.id ? null : log.id)}>
                <span style={{ fontSize: 22, flexShrink: 0 }}>{WEATHER_ICONS[log.weather] || '☀️'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: '#2C1A0E', fontSize: 14 }}>
                    {fmtDate(log.log_date)}
                  </div>
                  <div style={{ fontSize: 12, color: '#6B4A00', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {log.projects?.name || 'Unknown project'} · {log.users?.username || '—'} · {log.workers_present ?? '?'} workers
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {log.issues_found && (
                    <span className="badge" style={{ background: '#fcebeb', color: '#791f1f', fontSize: 10 }}>⚠️ Issue</span>
                  )}
                  {log.photo_url && (
                    <span className="badge" style={{ background: '#dbeafe', color: '#1d4ed8', fontSize: 10 }}>📷</span>
                  )}
                  <span style={{ color: '#C49A6C', fontSize: 16 }}>{expanded === log.id ? '▲' : '▼'}</span>
                </div>
              </div>

              {/* Expanded detail */}
              {expanded === log.id && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #F5EDD6', display: 'grid', gap: 10 }}>
                  {log.projects?.name && (
                    <div>
                      <span style={{ fontSize: 10, color: '#C49A6C', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Project</span>
                      <p style={{ margin: '2px 0 0', color: '#2C1A0E', fontWeight: 500 }}>{log.projects.name}</p>
                    </div>
                  )}
                  <div>
                    <span style={{ fontSize: 10, color: '#C49A6C', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Work Done Today</span>
                    <p style={{ margin: '2px 0 0', color: '#2C1A0E', whiteSpace: 'pre-wrap' }}>{log.work_done}</p>
                  </div>
                  {log.issues_found && (
                    <div style={{ background: '#fcebeb', padding: '8px 12px', borderRadius: 6 }}>
                      <span style={{ fontSize: 10, color: '#791f1f', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Issues Found</span>
                      <p style={{ margin: '2px 0 0', color: '#791f1f', whiteSpace: 'pre-wrap' }}>{log.issues_found}</p>
                    </div>
                  )}
                  {log.materials_used && (
                    <div>
                      <span style={{ fontSize: 10, color: '#C49A6C', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Materials Used</span>
                      <p style={{ margin: '2px 0 0', color: '#2C1A0E' }}>{log.materials_used}</p>
                    </div>
                  )}
                  {log.photo_url && (
                    <div>
                      <span style={{ fontSize: 10, color: '#C49A6C', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>Site Photo</span>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={log.photo_url} alt="Site photo" style={{ maxWidth: '100%', maxHeight: 240, borderRadius: 8, objectFit: 'cover' }} />
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
