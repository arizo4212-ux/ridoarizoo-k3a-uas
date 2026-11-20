export function formatRupiah(amount: number): string {
  const safe = Number.isFinite(amount) ? Math.round(amount) : 0;
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(safe);
}

export function getLocalDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getCurrentMonthKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function getMonthRange(monthKey: string): {
  periodKey: string;
  periodLabel: string;
  startDate: string;
  endDate: string;
} {
  const [yearStr, monthStr] = monthKey.split('-');
  const year = Number(yearStr) || new Date().getFullYear();
  const month = Number(monthStr) || new Date().getMonth() + 1;
  const lastDay = new Date(year, month, 0).getDate();
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  const label = new Intl.DateTimeFormat('id-ID', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month - 1, 1));
  return {
    periodKey: `${year}-${String(month).padStart(2, '0')}`,
    periodLabel: label,
    startDate,
    endDate,
  };
}

export function formatIndonesianDate(dateStr: string): string {
  if (!dateStr) return '-';
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return dateStr;
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

export function formatTimeOnly(isoStr: string): string {
  if (!isoStr) return '--:--';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return '--:--';
  return d.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function calculateWorkMinutes(clockInIso: string, clockOutIso: string): number {
  if (!clockInIso || !clockOutIso) return 0;
  const start = new Date(clockInIso).getTime();
  const end = new Date(clockOutIso).getTime();
  if (isNaN(start) || isNaN(end) || end <= start) return 0;
  return Math.min(1440, Math.round((end - start) / 60000));
}

export function formatDuration(minutes: number): string {
  if (!minutes || minutes <= 0) return '-';
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs === 0) return `${mins}m`;
  return `${hrs}j ${mins}m`;
}

export function sanitizeId(raw: string): string {
  return raw
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 120);
}

export function emailToInviteId(email: string): string {
  return email.trim().toLowerCase().replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function isLateClockIn(
  clockInDate: Date,
  scheduleStart: string,
  graceMinutes: number
): boolean {
  const [hh, mm] = scheduleStart.split(':').map(Number);
  if (isNaN(hh) || isNaN(mm)) return false;
  const scheduled = new Date(clockInDate);
  scheduled.setHours(hh, mm + graceMinutes, 0, 0);
  return clockInDate.getTime() > scheduled.getTime();
}

export function exportRowsToCSV(filename: string, headers: string[], rows: (string | number)[][]): void {
  const escapeCell = (val: string | number) => {
    const str = String(val ?? '');
    if (/[",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const csvContent = [
    headers.map(escapeCell).join(','),
    ...rows.map((r) => r.map(escapeCell).join(',')),
  ].join('\n');

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function calculateInclusiveDays(startDate: string, endDate: string): number {
  if (!startDate || !endDate) return 0;
  const sParts = startDate.split('-').map(Number);
  const eParts = endDate.split('-').map(Number);
  if (sParts.length !== 3 || eParts.length !== 3 || sParts.some(isNaN) || eParts.some(isNaN)) {
    return 0;
  }
  const s = new Date(sParts[0], sParts[1] - 1, sParts[2]);
  const e = new Date(eParts[0], eParts[1] - 1, eParts[2]);
  const diff = Math.round((e.getTime() - s.getTime()) / 86400000);
  if (diff < 0) return 0;
  return Math.min(90, diff + 1);
}

export function enumerateDateRange(startDate: string, endDate: string): string[] {
  const days = calculateInclusiveDays(startDate, endDate);
  if (days <= 0) return [];
  const [y, m, d] = startDate.split('-').map(Number);
  const result: string[] = [];
  for (let i = 0; i < days; i++) {
    const dt = new Date(y, m - 1, d + i);
    result.push(getLocalDateKey(dt));
  }
  return result;
}

