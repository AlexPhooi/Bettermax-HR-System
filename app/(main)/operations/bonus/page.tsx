'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRole } from '@/lib/role-context';
import { useRouter } from 'next/navigation';

interface BonusPool {
  id: string;
  project_id: string;
  milestone_id: string;
  milestone_contract_value: number;
  bonus_percent: number;
  total_bonus_pool: number;
  status: 'locked' | 'pending_approval' | 'approved' | 'distributed';
  completed_date: string | null;
  approved_at: string | null;
  projects: { name: string; code: string | null } | null;
  project_milestones: { name: string; sequence_order: number } | null;
  allocations: {
    count: number;
    workers: { full_name: string; share_amount: number; status: string }[];
  };
}

interface WorkerSummary {
  employee_id: string;
  full_name: string;
  rank: string;
  approved_total: number;
  distributed_total: number;
}

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  locked:           { bg: '#f3f4f6', text: '#6b7280',  label: 'Locked' },
  pending_approval: { bg: '#faeeda', text: '#633806',  label: 'Pending Approval' },
  approved:         { bg: '#dbeafe', text: '#1e40af',  label: 'Approved' },
  distributed:      { bg: '#eaf3de', text: '#166534',  label: 'Distributed ✓' },
};

const RANK_STYLE: Record<string, { bg: string; text: string }> = {
  Leader:  { bg: '#fef9c3', text: '#854d0e' },
  Core:    { bg: '#ffedd5', text: '#9a3412' },
  Pro:     { bg: '#f3e8ff', text: '#6b21a8' },
  Skilled: { bg: '#dcfce7', text: '#166534' },
  Support: { bg: '#dbeafe', text: '#1e40af' },
  Rookie:  { bg: '#f3f4f6', text: '#374151' },
};

function fmt(n: number) { return 'RM ' + Number(n).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtDate(s: string | null) { return s ? new Date(s).toLocaleDateString('en-GB') : '—'; }

export default function BonusPage() {
  const { role, loaded } = useRole();
  const router = useRouter();
  const [pools,   setPools]   = useState<BonusPool[]>([]);
  const [summary, setSummary] = useState<WorkerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const isOwner = role === 'owner';

  useEffect(() => {
    if (!loaded) return;
    if (role !== 'owner' && role !== 'admin') { router.replace('/operations'); return; }
    fetch('/api/operations/bonus')
      .then(r => r.json())
      .then(d => {
        setPools(d.pools || []);
        setSummary(d.worker_summary || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [loaded, role, router]);

  async function doAction(id: string, action: 'approve' | 'distribute') {
    if (!confirm(action === 'approve' ? 'Approve this bonus pool and allocate to workers?' : 'Mark as distributed (paid out)?')) return;
    setSaving(id);
    const res = await fetch(`/api/operations/bonus/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
    });
    const data = await res.json();
    if (res.ok) {
      setPools(ps => ps.map(p => p.id === id ? { ...p, ...data } : p));
      // Refresh to get updated allocations
      fetch('/api/operations/bonus').then(r => r.json()).then(d => {
        setPools(d.pools || []); setSummary(d.worker_summary || []);
      });
    }
    setSaving(null);
  }

  const pendingCount = pools.filter(p => p.status === 'pending_approval').length;
  const totalApproved = pools.filter(p => p.status === 'approved').reduce((s, p) => s + Number(p.total_bonus_pool), 0);

  if (!loaded || loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div style={{ height: 24, background: '#E8D5A3', borderRadius: 4, marginBottom: 24, width: 200 }} />
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card" style={{ marginBottom: 12, height: 60 }}>
            <div style={{ height: '100%', background: '#F5EDD6', borderRadius: 4 }} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 22, fontWeight: 700, color: '#2C1A0E' }}>Project Bonus Overview</h1>
          <p style={{ color: '#C49A6C', fontSize: 13 }}>Milestone bonus pools across all projects</p>
        </div>
        <Link href="/operations" className="btn btn-outline btn-sm">← Dashboard</Link>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="card" style={{ marginBottom: 0, padding: '14px 16px' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#633806' }}>{pendingCount}</div>
          <div style={{ fontSize: 10, color: '#C49A6C', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 2 }}>Pending Approval</div>
        </div>
        <div className="card" style={{ marginBottom: 0, padding: '14px 16px' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#1e40af' }}>{fmt(totalApproved)}</div>
          <div style={{ fontSize: 10, color: '#C49A6C', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 2 }}>Approved (unpaid)</div>
        </div>
        <div className="card" style={{ marginBottom: 0, padding: '14px 16px' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#27500A' }}>{pools.filter(p => p.status === 'distributed').length}</div>
          <div style={{ fontSize: 10, color: '#C49A6C', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 2 }}>Distributed</div>
        </div>
      </div>

      {/* Bonus pools */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 24 }}>
        <div style={{ background: '#1E1400', padding: '10px 20px' }}>
          <h2 style={{ color: '#C9A84C', fontFamily: 'Georgia, serif', fontSize: 15, fontWeight: 700, margin: 0 }}>Bonus Pools by Milestone</h2>
        </div>

        {pools.length === 0 ? (
          <div style={{ padding: '32px 24px', textAlign: 'center', color: '#C49A6C' }}>
            No bonus pools yet. Mark milestones complete to create pools.
          </div>
        ) : (
          <div className="divide-y divide-[#F5EDD6]">
            {pools.map(pool => {
              const ss = STATUS_STYLE[pool.status] || STATUS_STYLE.locked;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const project = pool.projects as any;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const milestone = pool.project_milestones as any;
              return (
                <div key={pool.id}>
                  <div
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[#FAF5E9] transition-colors"
                    onClick={() => setExpanded(expanded === pool.id ? null : pool.id)}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: '#2C1A0E', fontSize: 14 }}>
                        {project?.name || '—'}
                      </div>
                      <div style={{ fontSize: 12, color: '#6B4A00' }}>
                        Milestone {milestone?.sequence_order}: {milestone?.name || '—'}
                        {pool.completed_date && ` · Completed ${fmtDate(pool.completed_date)}`}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontWeight: 700, color: '#2C1A0E', fontSize: 13 }}>{fmt(pool.total_bonus_pool)}</div>
                      <div style={{ fontSize: 10, color: '#C49A6C' }}>{pool.bonus_percent}% of {fmt(pool.milestone_contract_value)}</div>
                    </div>
                    <span style={{ background: ss.bg, color: ss.text, fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 9999, flexShrink: 0 }}>
                      {ss.label}
                    </span>
                    {isOwner && pool.status === 'pending_approval' && (
                      <button onClick={e => { e.stopPropagation(); doAction(pool.id, 'approve'); }}
                        disabled={saving === pool.id}
                        className="btn btn-success btn-sm" style={{ flexShrink: 0 }}>
                        {saving === pool.id ? '…' : 'Approve'}
                      </button>
                    )}
                    {isOwner && pool.status === 'approved' && (
                      <button onClick={e => { e.stopPropagation(); doAction(pool.id, 'distribute'); }}
                        disabled={saving === pool.id}
                        className="btn btn-primary btn-sm" style={{ flexShrink: 0 }}>
                        {saving === pool.id ? '…' : 'Distribute'}
                      </button>
                    )}
                    <span style={{ color: '#C49A6C', fontSize: 14 }}>{expanded === pool.id ? '▲' : '▼'}</span>
                  </div>

                  {expanded === pool.id && (
                    <div style={{ padding: '12px 20px', background: '#FAF5E9', borderTop: '1px solid #F5EDD6' }}>
                      {pool.allocations.workers.length === 0 ? (
                        <p style={{ color: '#C49A6C', fontSize: 13, margin: 0 }}>
                          {pool.status === 'locked'
                            ? 'Bonus pool locked. Approve to allocate to workers.'
                            : 'No worker allocations yet.'}
                        </p>
                      ) : (
                        <div>
                          <p style={{ fontSize: 11, color: '#C49A6C', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                            Worker Allocations ({pool.allocations.count} workers)
                          </p>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {pool.allocations.workers.map((w, i) => (
                              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#2C1A0E', padding: '4px 0' }}>
                                <span>{w.full_name}</span>
                                <span style={{ fontWeight: 600 }}>{fmt(w.share_amount)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Worker bonus summary */}
      {summary.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ background: '#1E1400', padding: '10px 20px' }}>
            <h2 style={{ color: '#C9A84C', fontFamily: 'Georgia, serif', fontSize: 15, fontWeight: 700, margin: 0 }}>Worker Bonus Summary</h2>
          </div>
          <div className="overflow-x-auto">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th className="table-th">Worker</th>
                  <th className="table-th">Rank</th>
                  <th className="table-th">Approved (unpaid)</th>
                  <th className="table-th">Distributed</th>
                </tr>
              </thead>
              <tbody>
                {summary.map(w => {
                  const rs = RANK_STYLE[w.rank] || RANK_STYLE.Rookie;
                  return (
                    <tr key={w.employee_id} className="table-tr">
                      <td className="table-td" style={{ fontWeight: 500 }}>{w.full_name}</td>
                      <td className="table-td">
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 9999, background: rs.bg, color: rs.text }}>
                          {w.rank}
                        </span>
                      </td>
                      <td className="table-td" style={{ color: '#1e40af', fontWeight: 600 }}>
                        {w.approved_total > 0 ? fmt(w.approved_total) : '—'}
                      </td>
                      <td className="table-td" style={{ color: '#27500A', fontWeight: 600 }}>
                        {w.distributed_total > 0 ? fmt(w.distributed_total) : '—'}
                      </td>
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
