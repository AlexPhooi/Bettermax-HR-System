'use client';
import { useMemo } from 'react';
import { getUpcomingHolidays, getHolidaysForMonth, Holiday } from '@/lib/holidays';

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

interface Props {
  mode?: 'upcoming' | 'month';
  month?: string; // YYYY-MM, for mode=month
  maxItems?: number;
}

export default function HolidayCalendar({ mode = 'upcoming', month, maxItems = 8 }: Props) {
  const holidays = useMemo<Holiday[]>(() => {
    if (mode === 'month' && month) return getHolidaysForMonth(month);
    return getUpcomingHolidays(30);
  }, [mode, month]);

  const shown = holidays.slice(0, maxItems);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <div className="card-title mb-0">
          🗓️ {mode === 'month' ? 'Holidays This Month' : 'Upcoming Public Holidays'}
        </div>
        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
          KL · No rate change
        </span>
      </div>
      {shown.length === 0 ? (
        <p className="text-sm text-gray-400 py-3 text-center">No public holidays in the next 30 days 🎉</p>
      ) : (
        <div className="space-y-2">
          {shown.map(h => <HolidayChip key={h.date + h.name} h={h} />)}
        </div>
      )}
      {holidays.length > maxItems && (
        <p className="text-xs text-gray-400 mt-3 text-center">+{holidays.length - maxItems} more this period</p>
      )}
    </div>
  );
}
