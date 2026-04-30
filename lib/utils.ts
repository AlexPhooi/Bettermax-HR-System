export function formatRM(n: number | string | null | undefined) {
  return 'RM\u00a0' + Number(n || 0).toLocaleString('en-MY', {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  });
}

export function formatDate(s: string | null | undefined) {
  if (!s) return '-';
  const d = new Date(s.length === 10 ? s + 'T00:00:00' : s);
  return d.toLocaleDateString('en-GB');
}

export function formatTime(s: string | null | undefined) {
  if (!s) return '-';
  return new Date(s).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function getCurrentMonth() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
}

export function getPermitStatus(d: string | null | undefined) {
  if (!d) return { cls: '', label: '-' };
  const days = Math.floor((new Date(d).getTime() - Date.now()) / 86400000);
  const label = formatDate(d);
  if (days < 0)  return { cls: 'text-danger font-semibold', label: `Expired (${label})` };
  if (days <= 30) return { cls: 'text-danger font-semibold', label };
  if (days <= 60) return { cls: 'text-warn font-semibold', label };
  return { cls: '', label };
}

export function calcHoursAndDays(workDate: string, clockIn: string, clockOut: string) {
  const inDt  = new Date(`${workDate}T${clockIn}:00`);
  const outDt = new Date(`${workDate}T${clockOut}:00`);
  if (outDt <= inDt) return null;
  let hours = (outDt.getTime() - inDt.getTime()) / 3600000;
  const inH  = inDt.getHours()  + inDt.getMinutes()  / 60;
  const outH = outDt.getHours() + outDt.getMinutes() / 60;
  const lunch = inH < 13 && outH > 12;
  if (lunch) hours -= 1;
  hours = Math.max(0, hours);
  const days = hours <= 8 ? hours / 8 : 1 + (hours - 8) / 8;
  return {
    hours:      Math.round(hours * 100) / 100,
    days:       Math.round(days * 10000) / 10000,
    clock_in:   inDt.toISOString(),
    clock_out:  outDt.toISOString(),
    lunchDeducted: lunch,
  };
}

export const RANK_RATES: Record<string, number> = {
  Rookie: 70, Support: 90, Skilled: 100, Pro: 120, Core: 130, Leader: 140,
};

export const RANK_COLORS: Record<string, string> = {
  Rookie:  'bg-green-100 text-green-700',
  Support: 'bg-blue-100 text-blue-700',
  Skilled: 'bg-yellow-100 text-yellow-700',
  Pro:     'bg-red-100 text-red-700',
  Core:    'bg-purple-100 text-purple-700',
  Leader:  'bg-orange-100 text-orange-700',
};
