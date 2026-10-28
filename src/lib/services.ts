import { supabase, must, fetchAll } from './supabase';
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
  // Dos vueltas al servidor como máximo (cada una son ~0,15 s): el checklist y los resultados necesitan los ids
  // de los equipos, pero el resto se pide a la vez. (Filtrarlos con un join por el servicio es más lento:
  // los permisos se evalúan fila por fila.)
  // Todo en bloques: un servicio grande (p. ej. 70 equipos × 15 ítems) supera las 1000 filas por consulta
  // y un checklist cortado saldría incompleto en el informe sin ningún error
  const byEquipment = fetchAll<ServiceEquipment>((a, b) =>
    supabase.from('service_equipment').select('*').eq('service_id', id).order('position').order('id').range(a, b))
    .then(async (equipment) => {
      const seIds = equipment.map((e) => e.id);
      const tplIds = [...new Set(equipment.map((e) => e.checklist_template_id).filter(Boolean))] as string[];
      const [items, results] = await Promise.all([
        tplIds.length
          ? fetchAll<TemplateItem>((a, b) => supabase.from('checklist_template_items').select('*').in('template_id', tplIds).order('position').order('id').range(a, b))
          : [],
        // Por grupos de equipos para no armar una URL enorme con cientos de ids
        Promise.all(chunk(seIds, 100).map((ids) =>
          fetchAll<ChecklistResult>((a, b) => supabase.from('checklist_results').select('*').in('service_equipment_id', ids).order('id').range(a, b))))
          .then((parts) => parts.flat()),
      ]);
      return { equipment, items, results };
    });
  const [service, { equipment, items, results }, photos, photoGroups, findings, reports] = await Promise.all([
    supabase.from('services').select('*').eq('id', id).single().then((r) => must(r) as Service),
    byEquipment,
    fetchAll<Photo>((a, b) => supabase.from('photos').select('*').eq('service_id', id).order('position').order('id').range(a, b)),
    fetchAll<PhotoGroup>((a, b) => supabase.from('service_photo_groups').select('*').eq('service_id', id).order('position').order('id').range(a, b)),
    fetchAll<Finding>((a, b) => supabase.from('findings').select('*').eq('service_id', id).order('position').order('id').range(a, b)),
    fetchAll<Report>((a, b) => supabase.from('reports').select('*').eq('service_id', id).order('generated_at', { ascending: false }).order('id').range(a, b)),
  ]);
  const byTpl: Record<string, TemplateItem[]> = {};
  for (const it of items) (byTpl[it.template_id] ??= []).push(it);
  return { service, equipment, items: byTpl, results, photos, photoGroups, findings, reports };
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export async function logActivity(serviceId: string | null, action: string) {
  // La sesión local basta (getUser consulta al servidor de Auth: una vuelta más en cada acción)
  const { data } = await supabase.auth.getSession();
  await supabase.from('activity_log').insert({ service_id: serviceId, action, user_id: data.session?.user.id });
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

type Bucket = 'photos' | 'reports';
const urlCache = new Map<string, { url: string; exp: number }>();
// Pedidos de URL acumulados en el mismo instante: se resuelven con una sola llamada por bucket
const pending = new Map<Bucket, Map<string, ((url: string | null) => void)[]>>();

/** URL firmada (1 h) o null si el archivo no existe; agrupa las de toda una galería en una sola llamada. */
export function signedUrlOrNull(bucket: Bucket, path: string): Promise<string | null> {
  const hit = urlCache.get(`${bucket}/${path}`);
  if (hit && hit.exp > Date.now()) return Promise.resolve(hit.url);
  let queue = pending.get(bucket);
  if (!queue) {
    queue = new Map();
    pending.set(bucket, queue);
    setTimeout(() => flushSignedUrls(bucket), 0);
  }
  const waiting = queue.get(path) ?? [];
  queue.set(path, waiting);
  return new Promise((resolve) => waiting.push(resolve));
}

async function flushSignedUrls(bucket: Bucket) {
  const queue = pending.get(bucket)!;
  pending.delete(bucket);
  for (const paths of chunk([...queue.keys()], 100)) {
    const { data } = await supabase.storage.from(bucket).createSignedUrls(paths, 3600);
    for (const path of paths) {
      const url = data?.find((d) => d.path === path && !d.error)?.signedUrl ?? null;
      if (url) urlCache.set(`${bucket}/${path}`, { url, exp: Date.now() + 50 * 60_000 });
      for (const resolve of queue.get(path)!) resolve(url);
    }
  }
}

/** URL firmada (1 h) para mostrar un archivo privado del bucket. */
export async function signedUrl(bucket: Bucket, path: string) {
  const url = await signedUrlOrNull(bucket, path);
  if (!url) throw new Error('No se encontró el archivo.');
  return url;
}

/** Miniatura (~320 px) que se guarda junto a cada foto para mostrar en listas sin bajar la foto completa. */
export const thumbPath = (path: string) => `thumbs/${path}`;

/** Sube la foto comprimida y su miniatura. Si la miniatura falla la foto queda igual (se muestra la completa). */
export async function uploadPhoto(path: string, file: File) {
  const full = await compressImage(file);
  const up = await supabase.storage.from('photos').upload(path, full, { contentType: 'image/jpeg' });
  if (up.error) throw new Error(up.error.message);
  try {
    await supabase.storage.from('photos').upload(thumbPath(path), await compressImage(full, 320, 0.7), { contentType: 'image/jpeg' });
  } catch { /* sin miniatura */ }
}

/**
 * Ejecuta fn sobre la lista con a lo sumo `limit` a la vez, como Promise.allSettled.
 * Subir 30 fotos en paralelo descomprime 30 imágenes de 12 MP a la vez y agota la memoria del celular.
 */
export async function settleLimited<T, R>(list: T[], limit: number, fn: (x: T, i: number) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = new Array(list.length);
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const i = next++;
      try {
        out[i] = { status: 'fulfilled', value: await fn(list[i], i) };
      } catch (reason) {
        out[i] = { status: 'rejected', reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, worker));
  return out;
}

/** Guarda posición y sección/etapa solo de las fotos que cambiaron respecto de `before` (normalmente 2 al mover una). */
export async function savePhotoOrder(before: Photo[], changes: Photo[]) {
  const old = new Map(before.map((p) => [p.id, p]));
  const changed = changes.filter((c) => {
    const o = old.get(c.id);
    return !o || o.position !== c.position || o.stage !== c.stage || o.group_id !== c.group_id;
  });
  const res = await Promise.all(changed.map((c) =>
    supabase.from('photos').update({ position: c.position, stage: c.stage, group_id: c.group_id }).eq('id', c.id)));
  const error = res.find((r) => r.error)?.error;
  if (error) throw new Error(error.message);
}

/** Borra fotos del bucket junto con sus miniaturas. */
export async function removePhotoFiles(paths: string[]) {
  if (paths.length) await supabase.storage.from('photos').remove([...paths, ...paths.map(thumbPath)]);
}

export async function downloadBytes(bucket: 'photos' | 'reports', path: string) {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error) throw new Error(error.message);
  return new Uint8Array(await data.arrayBuffer());
}

/** Reduce la foto a 1600 px de lado mayor en JPEG para no subir archivos de 10 MB. */
export async function compressImage(file: Blob, maxSide = 1600, quality = 0.82): Promise<Blob> {
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
export async function addInventoryToService(serviceId: string, list: SiteEquipment[], startPosition = 0): Promise<ServiceEquipment[]> {
  if (!list.length) return [];
  const tpl = new Map<string, string | null>();
  for (const t of new Set(list.map((e) => e.equipment_type_id).filter(Boolean) as string[])) tpl.set(t, await currentTemplateId(t));
  return must(
    await supabase.from('service_equipment').insert(
      list.map((e, i) => ({
        service_id: serviceId, site_equipment_id: e.id, position: startPosition + i + 1,
        checklist_template_id: e.equipment_type_id ? tpl.get(e.equipment_type_id) ?? null : null,
        code: e.code, equipment_type_id: e.equipment_type_id, capacity: e.capacity, unit: e.unit,
        brand: e.brand, model: e.model, serial: e.serial, observation: e.location,
      })),
    ).select('*').order('position'),
  ) as ServiceEquipment[];
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
