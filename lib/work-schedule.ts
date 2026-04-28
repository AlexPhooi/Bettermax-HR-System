export interface WorkSection  { start: string; end: string; }
export interface WorkSchedule {
  sections:      WorkSection[];
  work_end:      string;
  default_start: string;
}

export const DEFAULT_SCHEDULE: WorkSchedule = {
  sections: [
    { start: '08:00', end: '10:00' },
    { start: '10:30', end: '12:30' },
    { start: '13:30', end: '15:30' },
    { start: '16:00', end: '18:00' },
  ],
  work_end:      '18:00',
  default_start: '08:00',
};

function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function calcHoursFromTimes(
  checkIn:  string,
  checkOut: string,
  schedule: WorkSchedule,
): { work_hours: number; ot_hours: number; days_worked: number } {
  const cin  = toMinutes(checkIn);
  const cout = toMinutes(checkOut);
  const end  = toMinutes(schedule.work_end);

  let workMins = 0;
  for (const s of schedule.sections) {
    const ss      = toMinutes(s.start);
    const se      = toMinutes(s.end);
    const overlap = Math.min(cout, se) - Math.max(cin, ss);
    if (overlap > 0) workMins += overlap;
  }

  const otMins  = Math.max(0, cout - end);
  const workHrs = workMins / 60;
  const otHrs   = otMins  / 60;
  return {
    work_hours:  workHrs,
    ot_hours:    otHrs,
    days_worked: (workHrs + otHrs) / 8,
  };
}
