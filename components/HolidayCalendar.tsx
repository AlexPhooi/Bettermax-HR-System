'use client';
import { useMemo, useState } from 'react';
import { getUpcomingHolidays, getHolidaysForMonth, MY_HOLIDAYS, Holiday } from '@/lib/holidays';

const TYPE_CFG: Record<string, { bg: string; text: string; icon: string }> = {
  national:  { bg: 'bg-blue-50',   text: 'text-blue-700',   icon: '🇲🇾' },
  kl:        { bg: 'bg-purple-50', text: 'text-purple-700', icon: '🏙️' },
  religious: { bg: 'bg-amber-50',  text: 'text-amber-700',  icon: '☪️' },
};

function HolidayChip({ h }: { h: Holiday }) {
  const cfg = TYPE_CFG[h.type] || TYPE_CFG.national;
  const date = new Date(h.date + 'T00:00:00');
  const label = date.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', weekday: 'short' });
  const today = new Date(); today.setHours(0,0,0,0);
  const diffDays = Math.round((date.getTime() - today.getTime()) / 86400000);
  const isToday = diffDays === 0;
  const isSoon  = diffDays > 0 && diffDays <= 7;
  return (
    <div className={`flex items-center gap-3 rounded-lg px-3 py-2 ${cfg.bg} ${isToday ? 'ring-2 ring-offset-1 ring-blue-400' : ''}`}>
      <span className="text-lg leading-none shrink-0">{cfg.icon}</span>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${cfg.text}`}>{h.name}</p>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
      {isToday && <span className="text-xs font-bold text-blue-600 shrink-0">Today</span>}
      {isSoon  && <span className="text-xs text-orange-500 shrink-0">In {diffDays}d</span>}
    </div>
  );
}

// Get YYYY-MM string for month offset from today
function monthOffset(offset: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return d.toISOString().slice(0, 7);
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-');
  return new Date(Number(y), Number(m) - 1).toLocaleString('en-MY', { month: 'long', year: 'numeric' });
}

// Find min/max months available in holiday data
const ALL_MONTHS = Array.from(new Set(MY_HOLIDAYS.map(h => h.date.slice(0, 7)))).sort();
const MIN_MONTH  = ALL_MONTHS[0] ?? '2025-01';
const MAX_MONTH  = ALL_MONTHS[ALL_MONTHS.length - 1] ?? '2026-12';

interface Props {
  mode?: 'upcoming' | 'month';
  maxItems?: number;
}

export default function HolidayCalendar({ mode = 'upcoming', maxItems = 5 }: Props) {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [viewMonth, setViewMonth]     = useState(currentMonth);
  const [browsing,  setBrowsing]      = useState(mode === 'month');

  const upcomingHolidays = useMemo(() => getUpcomingHolidays(30), []);
  const monthHolidays    = useMemo(() => getHolidaysForMonth(viewMonth), [viewMonth]);

  function prevMonth() {
    const d = new Date(viewMonth + '-01');
    d.setMonth(d.getMonth() - 1);
    const nm = d.toISOString().slice(0, 7);
    if (nm >= MIN_MONTH) setViewMonth(nm);
  }
  function nextMonth() {
    const d = new Date(viewMonth + '-01');
    d.setMonth(d.getMonth() + 1);
    const nm = d.toISOString().slice(0, 7);
    if (nm <= MAX_MONTH) setViewMonth(nm);
  }

  const shown = browsing ? monthHolidays : upcomingHolidays.slice(0, maxItems);
  const canPrev = viewMonth > MIN_MONTH;
  const canNext = viewMonth < MAX_MONTH;

  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="card-title mb-0">
          🗓️ {browsing ? `Holidays — ${monthLabel(viewMonth)}` : 'Upcoming Public Holidays'}
        </div>
        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded shrink-0">
          KL · No rate change
        </span>
      </div>

      {/* Month navigation (shown in browse mode) */}
      {browsing && (
        <div className="flex items-center justify-between mb-3 bg-gray-50 rounded-lg px-3 py-1.5">
          <button
            onClick={prevMonth}
            disabled={!canPrev}
            className="p-1 rounded hover:bg-gray-200 transition disabled:opacity-30 disabled:cursor-not-allowed text-gray-600">
            ‹
          </button>
          <button
            onClick={() => { setViewMonth(currentMonth); }}
            className="text-xs font-medium text-gray-600 hover:text-primary transition">
            {monthLabel(viewMonth)}
          </button>
          <button
            onClick={nextMonth}
            disabled={!canNext}
            className="p-1 rounded hover:bg-gray-200 transition disabled:opacity-30 disabled:cursor-not-allowed text-gray-600">
            ›
          </button>
        </div>
      )}

      {/* Holiday list */}
      {shown.length === 0 ? (
        <p className="text-sm text-gray-400 py-3 text-center">
          {browsing ? `No public holidays in ${monthLabel(viewMonth)} 🎉` : 'No public holidays in the next 30 days 🎉'}
        </p>
      ) : (
        <div className="space-y-2">
          {shown.map(h => <HolidayChip key={h.date + h.name} h={h} />)}
        </div>
      )}

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between">
        {!browsing && upcomingHolidays.length > maxItems && (
          <p className="text-xs text-gray-400">+{upcomingHolidays.length - maxItems} more this period</p>
        )}
        <button
          onClick={() => { setBrowsing(b => !b); if (!browsing) setViewMonth(currentMonth); }}
          className="ml-auto text-xs font-medium text-primary hover:underline transition">
          {browsing ? '← Upcoming view' : 'Browse by month →'}
        </button>
      </div>
    </div>
  );
}
