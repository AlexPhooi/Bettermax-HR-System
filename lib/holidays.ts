export interface Holiday {
  date: string; // YYYY-MM-DD
  name: string;
  type: 'national' | 'kl' | 'religious';
}

// Malaysia / Kuala Lumpur Public Holidays 2025–2026
// Note: Islamic & lunar holidays shift yearly by moon sighting — dates are estimates
export const MY_HOLIDAYS: Holiday[] = [
  // ── 2025 ──
  { date: '2025-01-01', name: "New Year's Day",              type: 'national' },
  { date: '2025-01-27', name: 'Hari Raya Thaipusam',        type: 'religious' },
  { date: '2025-01-29', name: 'Chinese New Year (Day 1)',    type: 'national' },
  { date: '2025-01-30', name: 'Chinese New Year (Day 2)',    type: 'national' },
  { date: '2025-02-01', name: "Federal Territory Day (KL)",  type: 'kl' },
  { date: '2025-03-31', name: 'Nuzul Al-Quran',             type: 'religious' },
  { date: '2025-03-30', name: 'Hari Raya Aidilfitri (Day 1)',type: 'religious' },
  { date: '2025-03-31', name: 'Hari Raya Aidilfitri (Day 2)',type: 'religious' },
  { date: '2025-05-01', name: "Workers' Day",                type: 'national' },
  { date: '2025-05-12', name: 'Wesak Day',                  type: 'national' },
  { date: '2025-06-02', name: "Yang di-Pertuan Agong's Birthday", type: 'national' },
  { date: '2025-06-06', name: 'Hari Raya Aidiladha',        type: 'religious' },
  { date: '2025-06-26', name: 'Awal Muharram (Islamic New Year)', type: 'religious' },
  { date: '2025-08-31', name: 'National Day (Merdeka)',      type: 'national' },
  { date: '2025-09-05', name: "Prophet Muhammad's Birthday", type: 'religious' },
  { date: '2025-09-16', name: 'Malaysia Day',               type: 'national' },
  { date: '2025-10-20', name: 'Deepavali',                  type: 'national' },
  { date: '2025-11-05', name: 'KL City Day',                type: 'kl' },
  { date: '2025-12-25', name: 'Christmas Day',              type: 'national' },

  // ── 2026 ──
  { date: '2026-01-01', name: "New Year's Day",              type: 'national' },
  { date: '2026-02-01', name: "Federal Territory Day (KL)",  type: 'kl' },
  { date: '2026-02-17', name: 'Chinese New Year (Day 1)',    type: 'national' },
  { date: '2026-02-18', name: 'Chinese New Year (Day 2)',    type: 'national' },
  { date: '2026-03-20', name: 'Hari Raya Aidilfitri (Day 1)',type: 'religious' },
  { date: '2026-03-21', name: 'Hari Raya Aidilfitri (Day 2)',type: 'religious' },
  { date: '2026-04-16', name: 'Nuzul Al-Quran',             type: 'religious' },
  { date: '2026-05-01', name: "Workers' Day",                type: 'national' },
  { date: '2026-05-26', name: 'Hari Raya Aidiladha',        type: 'religious' },
  { date: '2026-06-01', name: "Yang di-Pertuan Agong's Birthday", type: 'national' },
  { date: '2026-06-16', name: 'Awal Muharram (Islamic New Year)', type: 'religious' },
  { date: '2026-06-19', name: 'Thaipusam',                  type: 'religious' },
  { date: '2026-08-01', name: 'Wesak Day',                  type: 'national' },
  { date: '2026-08-25', name: "Prophet Muhammad's Birthday", type: 'religious' },
  { date: '2026-08-31', name: 'National Day (Merdeka)',      type: 'national' },
  { date: '2026-09-16', name: 'Malaysia Day',               type: 'national' },
  { date: '2026-11-08', name: 'Deepavali',                  type: 'national' },
  { date: '2026-11-05', name: 'KL City Day',                type: 'kl' },
  { date: '2026-12-25', name: 'Christmas Day',              type: 'national' },
];

export function getUpcomingHolidays(daysAhead = 30): Holiday[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cutoff = new Date(today.getTime() + daysAhead * 86400000);
  return MY_HOLIDAYS.filter(h => {
    const d = new Date(h.date + 'T00:00:00');
    return d >= today && d <= cutoff;
  }).sort((a, b) => a.date.localeCompare(b.date));
}

export function getHolidaysForMonth(month: string): Holiday[] {
  return MY_HOLIDAYS.filter(h => h.date.startsWith(month))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function isHoliday(date: string): Holiday | undefined {
  return MY_HOLIDAYS.find(h => h.date === date);
}
