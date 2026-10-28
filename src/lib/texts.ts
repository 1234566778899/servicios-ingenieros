import { siteAddress } from './format';
import type { Finding, ServiceEquipment, Site } from './types';

const num2 = (n: number) => String(n).padStart(2, '0');

/** "Mantenimiento preventivo" → "mantenimiento preventivo" */
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export function coverTitle(serviceType: string, specialty: string, site?: Site | null, withEquipment = true) {
  const what = withEquipment ? `DE EQUIPO DE ${specialty.toUpperCase()}` : `DE ${specialty.toUpperCase()}`;
  return `SERVICIO DE ${serviceType.toUpperCase()} ${what} · TIENDA (${(site?.name ?? '').toUpperCase()})`;
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
