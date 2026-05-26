'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRole } from '@/lib/role-context';
import { useRouter } from 'next/navigation';

interface Worker {
  id: string;
  full_name: string;
  rank: string;
  daily_rate: number;
  is_allocated: boolean;
  allocation: {
    alloc_id: string;
    project_id: string;
    project_name: string;
    allocated_date: string;
  } | null;
}

// Rank badge colors matching HR app
const RANK_STYLE: Record<string, { bg: string; text: string }> = {
  Leader:  { bg: '#fef9c3', text: '#854d0e' },
  Core:    { bg: '#ffedd5', text: '#9a3412' },
  Pro:     { bg: '#f3e8ff', text: '#6b21a8' },
  Skilled: { bg: '#dcfce7', text: '#166534' },
  Support: { bg: '#dbeafe', text: '#1e40af' },
  Rookie:  { bg: '#f3f4f6', text: '#374151' },
};

function rankStyle(rank: string) {
  return RANK_STYLE[rank] || RANK_STYLE.Rookie;
}

export default function ManpowerPage() {
  const { role, loaded } = useRole();
  const router = useRouter();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!loaded) return;
    if (role !== 'owner' && role !== 'admin') { router.replace('/operations'); return; }
    fetch('/api/operations/manpower')
      .then(r => r.json())
      .then(d => { setWorkers(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [loaded, role, router]);

  async function releaseWorker(alloc_id: string) {
    if (!confirm('Release this worker from their current project?')) return;
    const res = await fetch(`/api/operations/manpower/${alloc_id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ released_date: new Date().toISOString().split('T')[0] }),
    });
    if (res.ok) {
      setWorkers(ws => ws.map(w =>
        w.allocation?.alloc_id === alloc_id
          ? { ...w, is_allocated: false, allocation: null }
          : w
      ));
    }
  }

  const allocated  = workers.filter(w => w.is_allocated);
  const available  = workers.filter(w => !w.is_allocated);

  // Group allocated workers by project
  const byProject: Record<string, { project_name: string; workers: Worker[] }> = {};
  for (const w of allocated) {
    const pid = w.allocation!.project_id;
    if (!byProject[pid]) byProject[pid] = { project_name: w.allocation!.project_name, workers: [] };
    byProject[pid].workers.push(w);
  }

  const capacityStatus = available.length === 0 ? 'full'
    : available.length < 4 ? 'limited' : 'available';
  const bannerColor = { available: '#27500A', limited: '#633806', full: '#791f1f' }[capacityStatus];
  const bannerBg    = { available: '#eaf3de', limited: '#faeeda', full: '#fcebeb' }[capacityStatus];
  const bannerIcon  = { available: '✅', limited: '⚠️', full: '🔴' }[capacityStatus];

  if (!loaded || loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div style={{ height: 24, background: '#E8D5A3', borderRadius: 4, marginBottom: 24, width: 240 }} />
        <div className="grid md:grid-cols-2 gap-6">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="card">
              {[...Array(5)].map((_, j) => (
                <div key={j} style={{ height: 36, background: j % 2 === 0 ? '#F5EDD6' : 'white', marginBottom: 4, borderRadius: 4 }} />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 22, fontWeight: 700, color: '#2C1A0E' }}>Manpower Overview</h1>
          <p style={{ color: '#C49A6C', fontSize: 13 }}>Worker allocation across all projects</p>
        </div>
        <Link href="/operations" className="btn btn-outline btn-sm">← Dashboard</Link>
      </div>

      {/* Capacity summary banner */}
      <div style={{ background: bannerBg, border: `1.5px solid ${bannerColor}`, borderRadius: 8, padding: '12px 18px', marginBottom: 20 }}>
        <div style={{ fontWeight: 700, color: bannerColor, fontSize: 15 }}>
          {bannerIcon} {workers.length > 0
            ? `${allocated.length} / ${workers.length} workers allocated — ${available.length} available`
            : 'No workers found'}
        </div>
        <div style={{ color: bannerColor, fontSize: 12, marginTop: 2, opacity: 0.85 }}>
          {capacityStatus === 'available' && 'Capacity available — you can take a new project.'}
          {capacityStatus === 'limited'   && 'Limited capacity — assign carefully before taking new projects.'}
          {capacityStatus === 'full'      && 'All workers are allocated — cannot take a new project.'}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* ── Allocated workers by project ─────────────────────────── */}
        <div>
          <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 16, fontWeight: 700, color: '#2C1A0E', marginBottom: 12 }}>
            Allocated ({allocated.length})
          </h2>
          {Object.entries(byProject).length === 0 ? (
            <div className="card" style={{ padding: '24px 16px', textAlign: 'center', color: '#C49A6C' }}>
              No workers currently allocated.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {Object.entries(byProject).map(([pid, group]) => (
                <div key={pid} className="card" style={{ marginBottom: 0 }}>
                  <div className="flex items-center justify-between mb-2">
                    <Link href={`/operations/projects/${pid}`}
                      style={{ fontFamily: 'Georgia, serif', fontSize: 13, fontWeight: 700, color: '#2C1A0E', textDecoration: 'none' }}>
                      🏗️ {group.project_name}
                    </Link>
                    <span style={{ fontSize: 11, color: '#C49A6C' }}>{group.workers.length} workers</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {group.workers.map(w => {
                      const rs = rankStyle(w.rank);
                      return (
                        <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: '#FAF5E9', borderRadius: 6 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 9999, background: rs.bg, color: rs.text, flexShrink: 0 }}>
                            {w.rank}
                          </span>
                          <span style={{ flex: 1, fontSize: 13, color: '#2C1A0E', fontWeight: 500 }}>{w.full_name}</span>
                          <span style={{ fontSize: 11, color: '#C49A6C' }}>RM{w.daily_rate}/d</span>
                          {role === 'owner' && (
                            <button onClick={() => releaseWorker(w.allocation!.alloc_id)}
                              style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'transparent', border: '1px solid #C49A6C', color: '#6B4A00', cursor: 'pointer' }}>
                              Release
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Available workers ─────────────────────────────────────── */}
        <div>
          <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 16, fontWeight: 700, color: '#2C1A0E', marginBottom: 12 }}>
            Available ({available.length})
          </h2>
          {available.length === 0 ? (
            <div className="card" style={{ padding: '24px 16px', textAlign: 'center', color: '#791f1f', background: '#fcebeb' }}>
              🔴 All workers are currently allocated.
            </div>
          ) : (
            <div className="card" style={{ marginBottom: 0, padding: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {available.map(w => {
                  const rs = rankStyle(w.rank);
                  return (
                    <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: '#eaf3de', borderRadius: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 9999, background: rs.bg, color: rs.text, flexShrink: 0 }}>
                        {w.rank}
                      </span>
                      <span style={{ flex: 1, fontSize: 13, color: '#2C1A0E', fontWeight: 500 }}>{w.full_name}</span>
                      <span style={{ fontSize: 11, color: '#C49A6C' }}>RM{w.daily_rate}/d</span>
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 9999, background: '#dcfce7', color: '#166534', fontWeight: 600 }}>Free</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
