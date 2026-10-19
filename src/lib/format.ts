export function fmtDate(d?: string | null) {
  if (!d) return '—';
  const [y, m, day] = d.slice(0, 10).split('-');
  return `${day}/${m}/${y}`;
}

export function fmtDateTime(d?: string | null) {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

export function fmtTime(d: Date) {
  return d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function timeAgo(d?: string | null) {
  if (!d) return '—';
  const mins = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  if (mins < 2) return 'Ahora';
  if (mins < 60) return `hace ${mins} min`;
  const h = Math.round(mins / 60);
  if (h < 24) return `hace ${h} h`;
  const days = Math.round(h / 24);
  return days === 1 ? 'Ayer' : `hace ${days} días`;
}

export function fmtSize(bytes?: number | null) {
  if (!bytes) return '—';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

export const today = () => new Date().toISOString().slice(0, 10);

export function pad2(n: number) {
  return String(n).padStart(2, '0');
}

/** "Mantenimiento preventivo" → "Preventivo" para las tablas compactas */
export function shortType(t: string) {
  return t.replace(/^Mantenimiento /, '').replace(/ de equipos$/, '').replace(/ técnica$/, '').replace(/^./, (c) => c.toUpperCase());
}
