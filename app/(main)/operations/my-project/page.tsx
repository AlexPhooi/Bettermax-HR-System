'use client';
import { useEffect, useState } from 'react';
import { useRole } from '@/lib/role-context';
import { useRouter } from 'next/navigation';

interface Project {
  id: string; name: string; code: string | null; location: string | null;
  progress_percent: number; target_completion: string | null; start_date: string | null;
}
interface Allocation {
  allocated_date: string;
  project: Project;
}
interface Milestone { id: string; name: string; status: string; sequence_order: number; }
interface BonusAlloc { share_amount: number; status: string; project_bonus_pool: { total_bonus_pool: number; status: string } | null; }

export default function MyProjectPage() {
  const { role, loaded, employee_id } = useRole();
  const router = useRouter();
  const [allocation, setAllocation]   = useState<Allocation | null>(null);
  const [milestones, setMilestones]   = useState<Milestone[]>([]);
  const [bonuses,    setBonuses]      = useState<BonusAlloc[]>([]);
  const [loading,    setLoading]      = useState(true);
  const [noProject,  setNoProject]    = useState(false);

  useEffect(() => {
    if (!loaded) return;
    if (role !== 'viewer') { router.replace('/'); return; }

    fetch('/api/operations/projects?active_only=1')
      .then(r => r.json())
      .then(async (projects) => {
        if (!Array.isArray(projects) || projects.length === 0) {
          setNoProject(true); setLoading(false); return;
        }
        const proj = projects[0];
        setAllocation({ allocated_date: '', project: proj });

        // Fetch milestones
        const ms = await fetch(`/api/operations/milestones?project_id=${proj.id}`).then(r => r.json());
        setMilestones(Array.isArray(ms) ? ms : []);
        setLoading(false);
      })
      .catch(() => { setNoProject(true); setLoading(false); });
  }, [loaded, role, employee_id, router]);

  if (!loaded || loading) {
    return (
      <div className="max-w-lg mx-auto px-4 py-8">
        {[...Array(4)].map((_, i) => (
          <div key={i} style={{ height: 48, background: '#F5EDD6', borderRadius: 6, marginBottom: 12 }} />
        ))}
      </div>
    );
  }

  if (noProject || !allocation) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 text-center">
        <div style={{ fontSize: 40, marginBottom: 12 }}>🏗️</div>
        <h2 style={{ fontFamily: 'Georgia, serif', color: '#2C1A0E' }}>Not Assigned to a Project</h2>
        <p style={{ color: '#C49A6C', fontSize: 14 }}>You have not been allocated to any active project yet. Check with your supervisor.</p>
      </div>
    );
  }

  const { project } = allocation;
  const progress = Math.min(100, Math.max(0, project.progress_percent || 0));
  const currentMS = milestones.find(m => m.status === 'in_progress');
  const daysLeft  = project.target_completion
    ? Math.ceil((new Date(project.target_completion).getTime() - Date.now()) / 86400000) : null;

  const pendingBonus = bonuses
    .filter(b => b.status === 'approved')
    .reduce((s, b) => s + Number(b.share_amount), 0);
  const earnedBonus = bonuses
    .filter(b => b.status === 'distributed')
    .reduce((s, b) => s + Number(b.share_amount), 0);

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 22, fontWeight: 700, color: '#2C1A0E', marginBottom: 4 }}>
        My Project
      </h1>
      <p style={{ color: '#C49A6C', fontSize: 13, marginBottom: 20 }}>Your current site assignment</p>

      {/* Project card */}
      <div className="card">
        <div style={{ fontFamily: 'Georgia, serif', fontSize: 18, fontWeight: 700, color: '#2C1A0E', marginBottom: 4 }}>
          {project.name}
        </div>
        {project.code && <div style={{ fontSize: 12, color: '#C49A6C', marginBottom: 4 }}>{project.code}</div>}
        {project.location && <div style={{ fontSize: 13, color: '#6B4A00', marginBottom: 12 }}>📍 {project.location}</div>}

        {/* Progress */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: '#C49A6C' }}>Overall Progress</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#2C1A0E' }}>{progress}%</span>
          </div>
          <div style={{ height: 8, background: '#F5EDD6', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progress}%`, background: progress >= 80 ? '#27500A' : '#C9962E', borderRadius: 4 }} />
          </div>
        </div>

        {/* Current milestone */}
        {currentMS && (
          <div style={{ background: '#dbeafe', padding: '10px 14px', borderRadius: 6, marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Current Milestone</div>
            <div style={{ fontWeight: 600, color: '#1e40af' }}>{currentMS.sequence_order}. {currentMS.name}</div>
          </div>
        )}

        {daysLeft != null && (
          <div style={{ fontSize: 13, color: daysLeft <= 0 ? '#791f1f' : daysLeft <= 14 ? '#633806' : '#27500A', fontWeight: 600, marginBottom: 8 }}>
            {daysLeft > 0 ? `⏳ ${daysLeft} days until target completion` : `🔴 ${Math.abs(daysLeft)} days overdue`}
          </div>
        )}
      </div>

      {/* Milestone list */}
      {milestones.length > 0 && (
        <div className="card">
          <h3 style={{ fontFamily: 'Georgia, serif', fontSize: 15, fontWeight: 700, color: '#2C1A0E', marginBottom: 12 }}>Construction Stages</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {milestones.map(m => {
              const statusStyle = {
                completed:   { bg: '#eaf3de', text: '#27500A', icon: '✅' },
                in_progress: { bg: '#dbeafe', text: '#1e40af', icon: '🔨' },
                delayed:     { bg: '#fcebeb', text: '#791f1f', icon: '⚠️' },
                pending:     { bg: '#f3f4f6', text: '#6b7280', icon: '⬜' },
              }[m.status] || { bg: '#f3f4f6', text: '#6b7280', icon: '⬜' };
              return (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: statusStyle.bg, borderRadius: 6 }}>
                  <span style={{ fontSize: 14 }}>{statusStyle.icon}</span>
                  <span style={{ fontSize: 13, fontWeight: m.status === 'in_progress' ? 700 : 400, color: statusStyle.text }}>
                    {m.sequence_order}. {m.name}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Bonus summary */}
      {(pendingBonus > 0 || earnedBonus > 0) && (
        <div className="card">
          <h3 style={{ fontFamily: 'Georgia, serif', fontSize: 15, fontWeight: 700, color: '#2C1A0E', marginBottom: 12 }}>My Bonus</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {pendingBonus > 0 && (
              <div style={{ background: '#dbeafe', padding: '10px 14px', borderRadius: 6 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#1e40af' }}>
                  RM {Number(pendingBonus).toFixed(2)}
                </div>
                <div style={{ fontSize: 11, color: '#1e40af', marginTop: 2 }}>Approved (pending payout)</div>
              </div>
            )}
            {earnedBonus > 0 && (
              <div style={{ background: '#eaf3de', padding: '10px 14px', borderRadius: 6 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#27500A' }}>
                  RM {Number(earnedBonus).toFixed(2)}
                </div>
                <div style={{ fontSize: 11, color: '#27500A', marginTop: 2 }}>Total Earned</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
