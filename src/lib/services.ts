import { supabase, must } from './supabase';
import type {
  ChecklistResult, Finding, Photo, Report, Service, ServiceEquipment, TemplateItem,
} from './types';

export interface ServiceBundle {
  service: Service;
  equipment: ServiceEquipment[];
  items: Record<string, TemplateItem[]>; // por checklist_template_id
  results: ChecklistResult[];
  photos: Photo[];
  findings: Finding[];
  reports: Report[];
}

export async function loadServiceBundle(id: string): Promise<ServiceBundle> {
  const service = must(await supabase.from('services').select('*').eq('id', id).single()) as Service;
  const equipment = must(
    await supabase.from('service_equipment').select('*').eq('service_id', id).order('position'),
  ) as ServiceEquipment[];
  const seIds = equipment.map((e) => e.id);
  const tplIds = [...new Set(equipment.map((e) => e.checklist_template_id).filter(Boolean))] as string[];
  const [items, results, photos, findings, reports] = await Promise.all([
    tplIds.length
      ? supabase.from('checklist_template_items').select('*').in('template_id', tplIds).order('position')
      : Promise.resolve({ data: [], error: null }),
    seIds.length
      ? supabase.from('checklist_results').select('*').in('service_equipment_id', seIds)
      : Promise.resolve({ data: [], error: null }),
    seIds.length
      ? supabase.from('photos').select('*').in('service_equipment_id', seIds).order('position')
      : Promise.resolve({ data: [], error: null }),
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
        prev_details: s.prev_details, report_template_id: s.report_template_id,
      })
      .select('id, code')
      .single(),
  ) as { id: string; code: string };
  if (b.equipment.length) {
    must(
      await supabase.from('service_equipment').insert(
        b.equipment.map((e) => ({
          service_id: copy.id, checklist_template_id: e.checklist_template_id, position: e.position,
          code: e.code, equipment_type_id: e.equipment_type_id, capacity: e.capacity, unit: e.unit,
          brand: e.brand, model: e.model, serial: e.serial, observation: null,
        })),
      ),
    );
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

/** "Fotos pendientes" si algún equipo no tiene fotos en las 3 etapas; no toca servicios ya informados. */
export async function syncPhotoStatus(serviceId: string) {
  const { data: svc } = await supabase.from('services').select('status').eq('id', serviceId).single();
  if (!svc || svc.status === 'Informe generado') return;
  const { data: eqs } = await supabase.from('service_equipment').select('id, photos(stage)').eq('service_id', serviceId);
  const incomplete = (eqs ?? []).some((e: any) => new Set((e.photos ?? []).map((p: any) => p.stage)).size < 3);
  const status = incomplete ? 'Fotos pendientes' : 'En registro';
  if (status !== svc.status) await supabase.from('services').update({ status }).eq('id', serviceId);
}
