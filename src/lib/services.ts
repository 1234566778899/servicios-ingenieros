import { supabase, must } from './supabase';
import type {
  ChecklistResult, ConceptKind, Finding, Photo, PhotoGroup, Report, Service, ServiceEquipment, SiteEquipment, TemplateItem,
} from './types';

export interface ServiceBundle {
  service: Service;
  equipment: ServiceEquipment[];
  items: Record<string, TemplateItem[]>; // por checklist_template_id
  results: ChecklistResult[];
  photos: Photo[];
  /** Secciones del registro fotográfico (servicios sin equipos) */
  photoGroups: PhotoGroup[];
  findings: Finding[];
  reports: Report[];
}

/** El servicio se trabaja por equipos si su especialidad los lleva o si ya tiene equipos registrados. */
export function usesEquipment(b: Pick<ServiceBundle, 'service' | 'equipment'>, hasEquipment: (specialty: string) => boolean) {
  return hasEquipment(b.service.specialty) || b.equipment.length > 0;
}

export async function loadServiceBundle(id: string): Promise<ServiceBundle> {
  const service = must(await supabase.from('services').select('*').eq('id', id).single()) as Service;
  const equipment = must(
    await supabase.from('service_equipment').select('*').eq('service_id', id).order('position'),
  ) as ServiceEquipment[];
  const seIds = equipment.map((e) => e.id);
  const tplIds = [...new Set(equipment.map((e) => e.checklist_template_id).filter(Boolean))] as string[];
  const [items, results, photos, photoGroups, findings, reports] = await Promise.all([
    tplIds.length
      ? supabase.from('checklist_template_items').select('*').in('template_id', tplIds).order('position')
      : Promise.resolve({ data: [], error: null }),
    seIds.length
      ? supabase.from('checklist_results').select('*').in('service_equipment_id', seIds)
      : Promise.resolve({ data: [], error: null }),
    supabase.from('photos').select('*').eq('service_id', id).order('position'),
    supabase.from('service_photo_groups').select('*').eq('service_id', id).order('position'),
    supabase.from('findings').select('*').eq('service_id', id).order('position'),
    supabase.from('reports').select('*').eq('service_id', id).order('generated_at', { ascending: false }),
  ]);
  const byTpl: Record<string, TemplateItem[]> = {};
  for (const it of must(items) as TemplateItem[]) (byTpl[it.template_id] ??= []).push(it);
  return {
    service,
    equipment,
    items: byTpl,
    results: must(results) as ChecklistResult[],
    photos: must(photos) as Photo[],
    photoGroups: must(photoGroups) as PhotoGroup[],
    findings: must(findings) as Finding[],
    reports: must(reports) as Report[],
  };
}

export async function logActivity(serviceId: string | null, action: string) {
  const { data } = await supabase.auth.getUser();
  await supabase.from('activity_log').insert({ service_id: serviceId, action, user_id: data.user?.id });
}

/** Plantilla de checklist vigente para un tipo de equipo. */
export async function currentTemplateId(equipmentTypeId: string | null) {
  if (!equipmentTypeId) return null;
  const { data } = await supabase
    .from('checklist_templates')
    .select('id')
    .eq('equipment_type_id', equipmentTypeId)
    .eq('is_current', true)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

export function finalStatusOf(items: TemplateItem[], results: ChecklistResult[]): ServiceEquipment['final_status'] {
  const required = items.filter((i) => i.required);
  const byItem = new Map(results.map((r) => [r.template_item_id, r.result]));
  if (items.some((i) => byItem.get(i.id) === 'NC')) return 'No conforme';
  if (required.length && required.every((i) => byItem.get(i.id))) return 'Conforme';
  return 'Pendiente';
}

export async function duplicateService(id: string) {
  const b = await loadServiceBundle(id);
  const s = b.service;
  const copy = must(
    await supabase
      .from('services')
      .insert({
        work_order: null, service_type: s.service_type, client_id: s.client_id, site_id: s.site_id,
        specialty: s.specialty, lead_tech_id: s.lead_tech_id, support_tech_ids: s.support_tech_ids,
        site_contact: s.site_contact, cover_title: s.cover_title, description: s.description,
        prev_details: s.prev_details, work_items: s.work_items, report_template_id: s.report_template_id,
      })
      .select('id, code')
      .single(),
  ) as { id: string; code: string };
  if (b.equipment.length) {
    must(
      await supabase.from('service_equipment').insert(
        b.equipment.map((e) => ({
          service_id: copy.id, site_equipment_id: e.site_equipment_id, checklist_template_id: e.checklist_template_id, position: e.position,
          code: e.code, equipment_type_id: e.equipment_type_id, capacity: e.capacity, unit: e.unit,
          brand: e.brand, model: e.model, serial: e.serial, observation: null,
        })),
      ),
    );
  }
  // Las secciones de fotos se copian vacías (títulos y descripciones), sin las fotos
  if (b.photoGroups.length) {
    must(await supabase.from('service_photo_groups').insert(
      b.photoGroups.map((g) => ({ service_id: copy.id, position: g.position, title: g.title, description: g.description })),
    ));
  }
  await logActivity(copy.id, `duplicó ${s.code} como ${copy.code}`);
  return copy.id;
}

const urlCache = new Map<string, { url: string; exp: number }>();

/** URL firmada (1 h) para mostrar un archivo privado del bucket. */
export async function signedUrl(bucket: 'photos' | 'reports', path: string) {
  const key = `${bucket}/${path}`;
  const hit = urlCache.get(key);
  if (hit && hit.exp > Date.now()) return hit.url;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
  if (error) throw new Error(error.message);
  urlCache.set(key, { url: data.signedUrl, exp: Date.now() + 50 * 60_000 });
  return data.signedUrl;
}

export async function downloadBytes(bucket: 'photos' | 'reports', path: string) {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error) throw new Error(error.message);
  return new Uint8Array(await data.arrayBuffer());
}

/** Reduce la foto a 1600 px de lado mayor en JPEG para no subir archivos de 10 MB. */
export async function compressImage(file: File, maxSide = 1600, quality = 0.82): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const canvas = new OffscreenCanvas(Math.round(bmp.width * scale), Math.round(bmp.height * scale));
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return canvas.convertToBlob({ type: 'image/jpeg', quality });
}

export function equipmentLabel(e: Pick<ServiceEquipment, 'capacity' | 'unit'>) {
  return [e.capacity, e.unit].filter(Boolean).join(' ');
}

/** Un equipo tiene el registro fotográfico completo cuando cada etapa (antes/durante/después) tiene al menos 1 foto. */
export function photoStagesDone(photos: Pick<Photo, 'service_equipment_id' | 'stage'>[], seId: string) {
  return new Set(photos.filter((p) => p.service_equipment_id === seId).map((p) => p.stage)).size;
}

/** "Fotos pendientes" si algún equipo no tiene fotos en las 3 etapas (o el servicio sin equipos no tiene fotos); no toca servicios ya informados. */
export async function syncPhotoStatus(serviceId: string) {
  const { data: svc } = await supabase.from('services').select('status').eq('id', serviceId).single();
  if (!svc || svc.status === 'Informe generado') return;
  const { data: eqs } = await supabase.from('service_equipment').select('id, photos(stage)').eq('service_id', serviceId);
  // Sin equipos basta con que el registro fotográfico tenga alguna foto
  const incomplete = eqs?.length
    ? eqs.some((e: any) => new Set((e.photos ?? []).map((p: any) => p.stage)).size < 3)
    : !(await supabase.from('photos').select('id', { count: 'exact', head: true }).eq('service_id', serviceId)).count;
  const status = incomplete ? 'Fotos pendientes' : 'En registro';
  if (status !== svc.status) await supabase.from('services').update({ status }).eq('id', serviceId);
}

/** Inventario activo de la sede, en el orden del cliente. */
export async function loadSiteInventory(siteId: string) {
  return must(
    await supabase.from('site_equipment').select('*').eq('site_id', siteId).eq('active', true).order('position').order('code'),
  ) as SiteEquipment[];
}

/** Copia equipos del inventario al servicio (con su checklist vigente), al final de la lista. */
export async function addInventoryToService(serviceId: string, list: SiteEquipment[], startPosition = 0) {
  if (!list.length) return;
  const tpl = new Map<string, string | null>();
  for (const t of new Set(list.map((e) => e.equipment_type_id).filter(Boolean) as string[])) tpl.set(t, await currentTemplateId(t));
  must(
    await supabase.from('service_equipment').insert(
      list.map((e, i) => ({
        service_id: serviceId, site_equipment_id: e.id, position: startPosition + i + 1,
        checklist_template_id: e.equipment_type_id ? tpl.get(e.equipment_type_id) ?? null : null,
        code: e.code, equipment_type_id: e.equipment_type_id, capacity: e.capacity, unit: e.unit,
        brand: e.brand, model: e.model, serial: e.serial, observation: e.location,
      })),
    ),
  );
}

/** Siguiente código libre de la sede siguiendo el formato de sus códigos: "MSMG - 20" → "MSMG - 21". */
export async function nextEquipmentCode(siteId: string | undefined, prefix?: string | null) {
  const { data } = siteId ? await supabase.from('site_equipment').select('code').eq('site_id', siteId) : { data: [] };
  let best: { head: string; n: number; width: number } | null = null;
  for (const { code } of data ?? []) {
    const m = /^(.*?)(\d+)$/.exec(code);
    if (m && (!best || Number(m[2]) > best.n)) best = { head: m[1], n: Number(m[2]), width: m[2].length };
  }
  if (best) return `${best.head}${String(best.n + 1).padStart(Math.max(2, best.width), '0')}`;
  return `${prefix || 'EQ'}-01`;
}

/** Guarda los textos usados como conceptos reutilizables (los repetidos suman un uso). */
export async function rememberConcepts(kind: ConceptKind, specialty: string, texts: (string | null | undefined)[]) {
  const list = texts.map((t) => t?.trim()).filter(Boolean) as string[];
  if (list.length) await supabase.rpc('remember_concepts', { p_kind: kind, p_specialty: specialty, p_texts: list });
}

/** Separa un texto guardado con un elemento por línea ("1. …", "• …") en sus elementos. */
export const splitLines = (text: string | null | undefined) =>
  (text ?? '').split('\n').map((l) => l.replace(/^\s*(\d+[.)]|[•\-✓])\s*/, '').trim()).filter(Boolean);
