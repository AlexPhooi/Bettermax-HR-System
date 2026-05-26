'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRole } from '@/lib/role-context';
import { useRouter } from 'next/navigation';

interface ProjectCard {
  id: string;
  name: string;
  code: string | null;
  location: string | null;
  progress_percent: number;
  contract_value: number | null;
  gp_percent: number | null;
  target_completion: string | null;
  days_remaining: number | null;
  foreman_name: string | null;
  latest_log_date: string | null;
  days_since_log: number | null;
  no_log_alert: boolean;
  workers_allocated: number;
  current_milestone: string | null;
  material_alert: boolean;
}

interface DashData {
  total_active_projects: number;
  workers_on_site_today: number;
  available_workers: number;
  allocated_workers: number;
  total_workers: number;
  projects_on_schedule: number;
  projects_delayed: number;
  total_contract_value: number;
  capacity_status: 'available' | 'limited' | 'full';
  projects: ProjectCard[];
}

function fmt(n: number | null | undefined) {
  if (n == null) return '—';
  return 'RM ' + Number(n).toLocaleString('en-MY', { minimumFractionDigits: 0 });
}

function gpColor(gp: number | null) {
  if (gp == null) return { bg: '#f3f4f6', text: '#6b7280' };
  if (gp >= 20)   return { bg: '#eaf3de', text: '#27500A' };
  if (gp >= 10)   return { bg: '#faeeda', text: '#633806' };
  return { bg: '#fcebeb', text: '#791f1f' };
}

function SkeletonCard() {
  return (
    <div className="card" style={{ marginBottom: 0 }}>
      <div style={{ height: 16, background: '#E8D5A3', borderRadius: 4, marginBottom: 12, width: '60%' }} />
      <div style={{ height: 12, background: '#F5EDD6', borderRadius: 4, marginBottom: 8, width: '40%' }} />
      <div style={{ height: 8, background: '#F5EDD6', borderRadius: 4, marginBottom: 16 }} />
      <div style={{ height: 12, background: '#E8D5A3', borderRadius: 4, width: '30%' }} />
    </div>
  );
}

export default function OperationsDashboard() {
  const { role, loaded } = useRole();
  const router = useRouter();
  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!loaded) return;
    if (role !== 'owner' && role !== 'admin' && role !== 'editor') {
      router.replace('/');
      return;
    }
    fetch('/api/operations/dashboard')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [loaded, role, router]);

  const isManager = role === 'owner' || role === 'admin';

  if (!loaded || loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div style={{ height: 24, background: '#E8D5A3', borderRadius: 4, marginBottom: 24, width: 280 }} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card" style={{ marginBottom: 0 }}>
              <div style={{ height: 28, background: '#E8D5A3', borderRadius: 4, marginBottom: 8 }} />
              <div style={{ height: 12, background: '#F5EDD6', borderRadius: 4, width: '60%' }} />
            </div>
          ))}
        </div>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  if (!data) {
    return <div className="max-w-6xl mx-auto px-4 py-12 text-center" style={{ color: '#C49A6C' }}>Failed to load dashboard.</div>;
  }

  // Capacity banner
  const capacityBanner = {
    available: { bg: '#eaf3de', border: '#27500A', text: '#27500A', icon: '✅', msg: `${data.available_workers} free workers available — can take a new project` },
    limited:   { bg: '#faeeda', border: '#C9A84C', text: '#633806', icon: '⚠️', msg: `${data.available_workers} free workers — limited capacity` },
    full:      { bg: '#fcebeb', border: '#A32D2D', text: '#791f1f', icon: '🔴', msg: 'All workers allocated — cannot take new project' },
  }[data.capacity_status];

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 22, fontWeight: 700, color: '#2C1A0E' }}>Operations Dashboard</h1>
          <p style={{ color: '#C49A6C', fontSize: 13 }}>Live overview of all active projects</p>
        </div>
        {isManager && (
          <Link href="/operations/projects" className="btn btn-primary btn-sm">+ New Project</Link>
        )}
      </div>

      {/* Capacity indicator */}
      {isManager && (
        <div style={{ background: capacityBanner.bg, border: `1.5px solid ${capacityBanner.border}`, borderRadius: 8, padding: '12px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>{capacityBanner.icon}</span>
          <div>
            <span style={{ fontWeight: 700, color: capacityBanner.text, fontSize: 14 }}>{capacityBanner.msg}</span>
            <span style={{ color: capacityBanner.text, fontSize: 12, marginLeft: 8, opacity: 0.8 }}>
              ({data.allocated_workers} of {data.total_workers} workers on active projects)
            </span>
          </div>
          <Link href="/operations/manpower" style={{ marginLeft: 'auto', fontSize: 12, color: capacityBanner.text, fontWeight: 600, textDecoration: 'underline' }}>
            View Manpower →
          </Link>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        {[
          { label: 'Active Projects',   value: data.total_active_projects,   icon: '🏗️' },
          { label: 'Workers Today',     value: data.workers_on_site_today,   icon: '👷' },
          { label: 'On Schedule',       value: data.projects_on_schedule,    icon: '✅' },
          { label: 'Delayed',           value: data.projects_delayed,        icon: '⚠️' },
        ].map(s => (
          <div key={s.label} className="card" style={{ marginBottom: 0, padding: '16px 20px' }}>
            <div style={{ fontSize: 22, marginBottom: 4 }}>{s.icon}</div>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: 26, fontWeight: 700, color: '#2C1A0E', lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: 11, color: '#C49A6C', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {isManager && data.total_contract_value > 0 && (
        <div className="alert alert-info mb-5" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>💰</span>
          <span>Total active contract value: <strong>{fmt(data.total_contract_value)}</strong></span>
        </div>
      )}

      {/* Project cards */}
      {data.projects.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏗️</div>
          <p style={{ color: '#C49A6C', fontSize: 15 }}>No active projects yet.</p>
          {isManager && (
            <Link href="/operations/projects" className="btn btn-primary btn-sm" style={{ marginTop: 12, display: 'inline-flex' }}>
              Create First Project
            </Link>
          )}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {data.projects.map(p => {
            const gp = gpColor(p.gp_percent);
            const progress = Math.min(100, Math.max(0, p.progress_percent));
            return (
              <Link key={p.id} href={`/operations/projects/${p.id}`}
                className="card block transition-shadow hover:shadow-md" style={{ marginBottom: 0, textDecoration: 'none' }}>

                <div className="flex items-start justify-between gap-2 mb-2">
                  <div style={{ minWidth: 0 }}>
                    <h3 style={{ fontFamily: 'Georgia, serif', fontSize: 14, fontWeight: 700, color: '#2C1A0E', margin: 0, lineHeight: 1.3 }}>
                      {p.name}
                    </h3>
                    {p.code && <span style={{ fontSize: 11, color: '#C49A6C' }}>{p.code}</span>}
                  </div>
                  {p.gp_percent != null && (
                    <span style={{ background: gp.bg, color: gp.text, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 9999, flexShrink: 0 }}>
                      GP {p.gp_percent}%
                    </span>
                  )}
                </div>

                {p.location && <p style={{ fontSize: 12, color: '#6B4A00', marginBottom: 8 }}>📍 {p.location}</p>}

                {/* Progress bar */}
                <div style={{ marginBottom: 10 }}>
                  <div className="flex justify-between mb-1">
                    <span style={{ fontSize: 11, color: '#C49A6C' }}>{p.current_milestone || 'Progress'}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#2C1A0E' }}>{progress}%</span>
                  </div>
                  <div style={{ height: 6, background: '#F5EDD6', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 3, width: `${progress}%`, background: progress >= 80 ? '#27500A' : progress >= 50 ? '#C9A84C' : '#C49A6C' }} />
                  </div>
                </div>

                {/* Alerts */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                  {p.material_alert && (
                    <span style={{ background: '#faeeda', color: '#633806', fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 9999 }}>
                      ⚠ Order materials soon
                    </span>
                  )}
                  {p.no_log_alert && (
                    <span style={{ background: '#fcebeb', color: '#791f1f', fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 9999 }}>
                      ⚠ {p.latest_log_date ? `No log ${p.days_since_log}d` : 'No logs yet'}
                    </span>
                  )}
                </div>

                {/* Footer */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: 11 }}>
                  {p.foreman_name && <span style={{ color: '#6B4A00' }}>👷 {p.foreman_name}</span>}
                  <span style={{ color: '#6B4A00' }}>🔧 {p.workers_allocated} workers</span>
                  {p.days_remaining != null && (
                    <span style={{ color: p.days_remaining <= 7 ? '#791f1f' : p.days_remaining <= 30 ? '#633806' : '#27500A', fontWeight: 600 }}>
                      {p.days_remaining > 0 ? `⏳ ${p.days_remaining}d left` : `🔴 ${Math.abs(p.days_remaining)}d overdue`}
                    </span>
                  )}
                  {!p.no_log_alert && (
                    <span style={{ color: '#27500A' }}>✅ Log {p.days_since_log === 0 ? 'today' : `${p.days_since_log}d ago`}</span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {role === 'editor' && (
        <div className="mt-8">
          <Link href="/operations/daily-log/new" className="btn btn-primary" style={{ fontSize: 15, padding: '12px 24px' }}>
            📝 Submit Today&apos;s Log
          </Link>
        </div>
      )}
    </div>
  );
}
