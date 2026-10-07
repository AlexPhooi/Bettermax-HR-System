// Time helpers for the one-tap attendance flow. The time of a photo is the moment it was
// uploaded (the upload route stamps the file name with Date.now()), expressed in Malaysia
// time — the server runs in UTC, so never use getHours() here.
export const MYT_TZ = 'Asia/Kuala_Lumpur';
export const ROUND_MINUTES = 15;

/** Upload time (ms since epoch) encoded in a storage URL, or null if it has none. */
export function photoTakenAtMs(url?: string | null): number | null {
  const m = url?.match(/_(\d{13})[._]/);
  return m ? Number(m[1]) : null;
}

/** "HH:MM" in Malaysia time for a timestamp. */
export function mytTime(ms: number): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: MYT_TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(ms);
  const h = parts.find(p => p.type === 'hour')?.value ?? '00';
  const m = parts.find(p => p.type === 'minute')?.value ?? '00';
  return `${h}:${m}`;
}

const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
const fromMin = (n: number) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;

/** Round "HH:MM" to the nearest step (default 15 min): 19:59 -> 20:00, 18:07 -> 18:00. */
export function roundTime(hhmm: string, step = ROUND_MINUTES): string {
  return fromMin(Math.min(Math.round(toMin(hhmm) / step) * step, 23 * 60 + 45));
}

/** Check-in time: rounded, and never earlier than the work start (arriving early earns nothing extra). */
export function roundCheckIn(hhmm: string, workStart = '08:00'): string {
  return fromMin(Math.max(toMin(roundTime(hhmm)), toMin(workStart)));
}
