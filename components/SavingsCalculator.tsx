'use client';
import { useState, useMemo } from 'react';

interface Props {
  /** Default monthly contribution (site bonus this month) */
  defaultMonthly?: number;
  /** Current accumulated balance */
  currentBalance?: number;
}

function fmtK(v: number) {
  if (v >= 1000) return `RM${(v / 1000).toFixed(1)}k`;
  return `RM${v.toFixed(0)}`;
}

function fmtRM(v: number) {
  return 'RM ' + v.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function SavingsCalculator({ defaultMonthly = 10, currentBalance = 0 }: Props) {
  const [monthly, setMonthly] = useState(Math.max(defaultMonthly, 10));
  const [rate,    setRate]    = useState(2.0);
  const [months,  setMonths]  = useState(12);

  const { balances, totalContributed, interestEarned, finalBalance } = useMemo(() => {
    const bals: number[] = [];
    let bal = currentBalance;
    for (let i = 0; i < months; i++) {
      bal = (bal + monthly) * (1 + rate / 100);
      bals.push(Math.round(bal * 100) / 100);
    }
    const totalContributed = Math.round((monthly * months + currentBalance) * 100) / 100;
    const fin = bals[bals.length - 1] ?? 0;
    const interest = Math.round((fin - totalContributed) * 100) / 100;
    return { balances: bals, totalContributed, interestEarned: Math.max(interest, 0), finalBalance: fin };
  }, [monthly, rate, months, currentBalance]);

  // ── SVG chart constants ────────────────────────────────────────────────
  const CW = 560; const CH = 160;
  const PL = 46;  const PR = 8; const PT = 8; const PB = 28;
  const plotW = CW - PL - PR;
  const plotH = CH - PT - PB;
  const maxBal = Math.max(...balances, 1);
  const gap  = plotW / months;
  const barW = Math.min(gap * 0.55, 32);

  const yTicks = 4;
  const rawStep = maxBal / yTicks;
  // Round yStep to a nice number
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const niceStep  = Math.ceil(rawStep / magnitude) * magnitude;
  const yMax      = niceStep * yTicks;

  const trendPoints = balances.map((b, i) => {
    const x = PL + i * gap + gap / 2;
    const y = PT + plotH - (b / yMax) * plotH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return (
    <div style={{
      background: '#111827', borderRadius: 12, padding: '18px 16px',
      color: '#f9fafb', fontSize: 13,
    }}>

      {/* ── Sliders ─────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px', marginBottom: 14 }}>

        {/* Monthly bonus */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#9ca3af', marginBottom: 4 }}>
            <span>Monthly bonus</span>
            <strong style={{ color: '#f9fafb' }}>RM {monthly}</strong>
          </div>
          <input type="range" min={10} max={500} step={10} value={monthly}
            onChange={e => setMonthly(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#3b82f6' }} />
        </div>

        {/* Interest rate */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#9ca3af', marginBottom: 4 }}>
            <span>Interest rate</span>
            <strong style={{ color: '#f9fafb' }}>{rate.toFixed(1)}% / mo</strong>
          </div>
          <input type="range" min={0} max={5} step={0.1} value={rate}
            onChange={e => setRate(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#3b82f6' }} />
        </div>

        {/* Months */}
        <div style={{ gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#9ca3af', marginBottom: 4 }}>
            <span>Months</span>
            <strong style={{ color: '#f9fafb' }}>{months} mo</strong>
          </div>
          <input type="range" min={1} max={60} step={1} value={months}
            onChange={e => setMonths(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#3b82f6' }} />
        </div>
      </div>

      {/* ── Summary stats ───────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
        <div style={{ background: '#1f2937', borderRadius: 8, padding: '10px 12px' }}>
          <div style={{ color: '#9ca3af', fontSize: 11, marginBottom: 4 }}>Total contributed</div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{fmtRM(totalContributed)}</div>
        </div>
        <div style={{ background: '#1f2937', borderRadius: 8, padding: '10px 12px' }}>
          <div style={{ color: '#9ca3af', fontSize: 11, marginBottom: 4 }}>Interest earned</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#4ade80' }}>{fmtRM(interestEarned)}</div>
        </div>
        <div style={{ background: '#1f2937', borderRadius: 8, padding: '10px 12px' }}>
          <div style={{ color: '#9ca3af', fontSize: 11, marginBottom: 4 }}>Final balance</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#60a5fa' }}>{fmtRM(finalBalance)}</div>
        </div>
      </div>

      {/* ── Bar chart ───────────────────────────────────────────────── */}
      <svg viewBox={`0 0 ${CW} ${CH}`} style={{ width: '100%', display: 'block', overflow: 'visible' }}>

        {/* Y-axis grid lines + labels */}
        {Array.from({ length: yTicks + 1 }, (_, i) => {
          const val = niceStep * i;
          const y   = PT + plotH - (val / yMax) * plotH;
          return (
            <g key={i}>
              <line x1={PL} y1={y} x2={PL + plotW} y2={y}
                stroke="#374151" strokeWidth={0.6} />
              <text x={PL - 5} y={y + 3.5} textAnchor="end"
                fill="#6b7280" fontSize={9}>{fmtK(val)}</text>
            </g>
          );
        })}

        {/* Bars */}
        {balances.map((b, i) => {
          const bh = Math.max((b / yMax) * plotH, 1);
          const bx = PL + i * gap + (gap - barW) / 2;
          const by = PT + plotH - bh;
          return (
            <rect key={i} x={bx} y={by} width={barW} height={bh}
              fill="#3b82f6" rx={2} opacity={0.9} />
          );
        })}

        {/* Dashed trend line */}
        {balances.length > 1 && (
          <polyline points={trendPoints} fill="none"
            stroke="#4ade80" strokeWidth={1.5} strokeDasharray="5 4" />
        )}

        {/* X-axis labels — only show every nth to avoid crowding */}
        {balances.map((_, i) => {
          const step = months <= 12 ? 1 : months <= 24 ? 2 : months <= 36 ? 3 : 6;
          if ((i + 1) % step !== 0 && i !== 0) return null;
          return (
            <text key={i}
              x={PL + i * gap + gap / 2}
              y={PT + plotH + 18}
              textAnchor="middle" fill="#6b7280" fontSize={9}>
              M{i + 1}
            </text>
          );
        })}
      </svg>

      {currentBalance > 0 && (
        <div style={{ marginTop: 8, fontSize: 11, color: '#6b7280', textAlign: 'center' }}>
          Starting from current balance {fmtRM(currentBalance)}
        </div>
      )}
    </div>
  );
}
