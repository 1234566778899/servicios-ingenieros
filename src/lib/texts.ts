import { siteAddress } from './format';
import type { Finding, ServiceEquipment, Site } from './types';

const num2 = (n: number) => String(n).padStart(2, '0');

/** "Mantenimiento preventivo" → "mantenimiento preventivo" */
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Sin guiones: «FO - SJL Mall Aventura» → «FO SJL Mall Aventura» */
export const noDashes = (s: string) => s.replace(/\s*-\s*/g, ' ').replace(/\s+/g, ' ').trim();

/** Tienda para el título de portada: código y nombre sin guiones, como la identifica el cliente («PE210 FO SJL MALL AVENTURA») */
export const storeTitle = (site?: Site | null) => noDashes([site?.code?.trim(), site?.name?.trim()].filter(Boolean).join(' ')).toUpperCase();

export function coverTitle(serviceType: string, specialty: string, site?: Site | null, withEquipment = true) {
  const what = withEquipment ? `DE EQUIPO DE ${specialty.toUpperCase()}` : `DE ${specialty.toUpperCase()}`;
  const store = storeTitle(site);
  return `SERVICIO DE ${serviceType.toUpperCase()} ${what} · TIENDA (${store.toUpperCase()})`;
}

export function memoria(serviceType: string, specialty: string, site?: Site | null, withEquipment = true) {
  const name = (site?.name ?? '').toUpperCase();
  const what = withEquipment ? `de equipos de ${lower(specialty)}` : `de ${lower(specialty)}`;
  return `El presente informe corresponde al servicio de ${lower(serviceType)} ${what} para la tienda ${name}, ubicado en ${siteAddress(site) || '—'}.`;
}

export function equipmentSummary(serviceType: string, equipment: ServiceEquipment[], typeName: (id?: string | null) => string) {
  if (!equipment.length) return '';
  const counts = new Map<string, number>();
  for (const e of equipment) {
    const t = typeName(e.equipment_type_id).toUpperCase();
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const parts = [...counts].map(([t, n]) => `${num2(n)} equipo${n === 1 ? '' : 's'} ${t}`);
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} y ${parts.at(-1)}` : parts[0];
  return `Se realizó el ${lower(serviceType)} a ${list}.`;
}

export function conclusionsFrom(findings: Finding[], codeOf: (seId: string) => string) {
  return findings
    .map((f, i) => {
      const cause = f.probable_cause ? ` La causa probable corresponde a ${lower(f.probable_cause.replace(/\.$/, ''))}.` : '';
      return `${i + 1}. En el equipo ${codeOf(f.service_equipment_id)} se evidenció ${lower(f.finding)}.${cause}`;
    })
    .join('\n');
}

export function recommendationsFrom(findings: Finding[], codeOf: (seId: string) => string) {
  return findings
    .map((f, i) => {
      const rec = f.recommendation ? lower(f.recommendation.replace(/\.$/, '')) : 'revisar el equipo';
      return `${i + 1}. Para el equipo ${codeOf(f.service_equipment_id)}, se recomienda ${rec}. Prioridad: ${f.priority}.`;
    })
    .join('\n');
}

export const DEFAULT_PREV_DETAILS = [
  'Acondicionamiento del área de trabajo',
  'Correcto uso de EPPs',
  'Señalización y delimitación del área',
  'Permiso de trabajo del centro comercial',
];

/** Cambia la tienda anterior por la nueva en un texto ya escrito (título o memoria editados a mano):
 *  «código nombre», nombre, dirección y código, sin distinguir mayúsculas. Si el texto estaba en
 *  mayúsculas, el reemplazo también. Lo demás se conserva tal cual. */
export function swapSite(text: string | null | undefined, from?: Site | null, to?: Site | null) {
  if (!text || !from || !to || from.id === to.id) return text ?? '';
  const t = (x?: string | null) => (x ?? '').trim();
  const join = (sep: string, a: string, b: string) => [a, b].filter(Boolean).join(sep);
  const pairs: [string, string][] = [
    // Como sale en el título de portada (sin guiones)
    [storeTitle(from), storeTitle(to)],
    ...(t(from.code) ? [
      [join(' - ', t(from.code), t(from.name)), join(' - ', t(to.code), t(to.name))],
      [join(' ', t(from.code), t(from.name)), join(' ', t(to.code), t(to.name))],
    ] as [string, string][] : []),
    [t(from.name), t(to.name)],
    [siteAddress(from), siteAddress(to)],
    [t(from.code), t(to.code)],
  ];
  const usable = pairs.filter(([a, b]) => a && b && a.toLowerCase() !== b.toLowerCase()).sort((x, y) => y[0].length - x[0].length);
  if (!usable.length) return text;
  // Una sola pasada (lo más largo primero): lo ya reemplazado no se vuelve a reemplazar
  const map = new Map(usable.map(([a, b]) => [a.toLowerCase(), b]));
  const re = new RegExp(usable.map(([a]) => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gi');
  return text.replace(re, (m) => {
    const b = map.get(m.toLowerCase()) ?? m;
    return m === m.toUpperCase() && m !== m.toLowerCase() ? b.toUpperCase() : b;
  });
}
