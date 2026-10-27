import type { ServiceBundle } from '../lib/services';
import { downloadBytes, equipmentLabel, splitLines, usesEquipment } from '../lib/services';
import { equipmentSummary, conclusionsFrom, recommendationsFrom } from '../lib/texts';
import { fmtDate } from '../lib/format';
import { STAGES, type Photo, type ReportTemplate, type Site } from '../lib/types';
import { renderAnnotated, type Annotation } from '../lib/annotations';

/** caption = comentario del usuario (vacío si no escribió nada) */
export interface ReportImage { bytes: Uint8Array; dataUrl: string; width: number; height: number; caption: string }

export interface ReportModel {
  /** false: servicio sin equipos (trabajos realizados + fotos por sección + observaciones) */
  withEquipment: boolean;
  template: { code: string; name: string; version: string; issueDate: string };
  coverTitle: string;
  serviceType: string;
  serviceCode: string;
  clientName: string;
  site: Site | undefined;
  executionDate: string;
  workOrder: string;
  leadTech: string;
  supportTechs: string;
  description: string;
  prevDetails: string[];
  equipmentSummary: string;
  equipment: {
    n: number; code: string; type: string; capacity: string; brandModel: string; serial: string; status: string; observation: string;
    checklist: { n: number; category: string; activity: string; result: string; value: string }[];
    /** Solo las etapas con fotos, en filas de 3 (la última se completa con null) */
    photos: { stage: string; rows: (ReportImage | null)[][] }[];
    /** Fotos registradas del equipo (0: no sale en el registro fotográfico) */
    photoCount: number;
  }[];
  findings: { n: number; code: string; finding: string; cause: string; action: string; recommendation: string; priority: string }[];
  workItems: string[];
  /** Secciones del registro fotográfico, en filas de 2 fotos */
  photoGroups: { title: string; description: string; rows: (ReportImage | null)[][] }[];
  conclusions: string[];
  observations: string[];
  recommendations: string[];
  sections: string[];
  /** Fotos que no se pudieron descargar (saldrían como recuadro vacío en el informe) */
  failedPhotos: number;
  baseName: string;
}

type Loaded = Omit<ReportImage, 'caption'>;
// Las fotos ya descargadas se reutilizan: cambiar la fecha o la plantilla, o recargar tras generar, vuelve a armar el modelo
const imageCache = new Map<string, Promise<Loaded>>();
// Pocas descargas a la vez: un servicio con 100 fotos no las pide (ni decodifica) todas juntas
let active = 0;
const queue: (() => void)[] = [];
async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= 6) await new Promise<void>((res) => queue.push(res));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    queue.shift()?.();
  }
}

async function fetchImage(path: string): Promise<Loaded> {
  const bytes = await downloadBytes('photos', path);
  const blob = new Blob([bytes as BlobPart], { type: 'image/jpeg' });
  const bmp = await createImageBitmap(blob);
  const { width, height } = bmp;
  bmp.close();
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
  return { bytes, dataUrl, width, height };
}

/** Dibuja las figuras sobre una copia de la foto: la original no cambia */
async function withAnnotations(img: Loaded, annotations: Annotation[]): Promise<Loaded> {
  const bmp = await createImageBitmap(new Blob([img.bytes as BlobPart], { type: 'image/jpeg' }));
  const canvas = renderAnnotated(bmp, annotations, Infinity, 1200);
  bmp.close();
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob'))), 'image/jpeg', 0.9));
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
  return { bytes: new Uint8Array(await blob.arrayBuffer()), dataUrl, width: canvas.width, height: canvas.height };
}

async function loadImage(path: string, caption: string, annotations: Annotation[]): Promise<ReportImage | null> {
  let hit = imageCache.get(path);
  if (!hit) {
    hit = limited(() => fetchImage(path));
    imageCache.set(path, hit);
    // Tope de memoria (~150 fotos ≈ 100 MB): se descartan las más antiguas, de otros servicios
    while (imageCache.size > 150) imageCache.delete(imageCache.keys().next().value!);
    // Un fallo (p. ej. sin señal) no queda guardado: el próximo intento vuelve a descargar
    hit.catch(() => imageCache.delete(path));
  }
  try {
    const img = await hit;
    return { ...(annotations.length ? await withAnnotations(img, annotations) : img), caption };
  } catch {
    return null;
  }
}

const RESULT: Record<string, string> = { C: 'Conforme', NC: 'No conforme', NA: 'N.A.' };

export async function buildReportModel(
  b: ServiceBundle,
  tpl: ReportTemplate,
  issueDate: string,
  names: {
    clientName: (id?: string | null) => string; typeName: (id?: string | null) => string;
    userName: (id?: string | null) => string; hasEquipment: (specialty: string) => boolean; site?: Site;
  },
  onProgress?: (done: number, total: number) => void,
): Promise<ReportModel> {
  const s = b.service;
  const codeOf = (id: string) => b.equipment.find((e) => e.id === id)?.code ?? '—';
  let done = 0;
  let failedPhotos = 0;
  const total = b.photos.length;
  const withEquipment = usesEquipment(b, names.hasEquipment);
  const image = async (p: Photo) => {
    const img = await loadImage(p.storage_path, p.caption?.trim() ?? '', p.annotations ?? []);
    if (!img) failedPhotos++;
    onProgress?.(++done, total);
    return img;
  };
  /** Descarga las fotos (sin las que fallen: se avisa con failedPhotos) */
  const images = async (list: Photo[]) => (await Promise.all(list.map(image))).filter((x): x is ReportImage => !!x);
  /** Parte la lista en filas de n, completando la última con null */
  const rowsOf = (images: (ReportImage | null)[], n: number) => {
    const rows: (ReportImage | null)[][] = [];
    for (let i = 0; i < images.length; i += n) {
      const row = images.slice(i, i + n);
      rows.push([...row, ...Array(n - row.length).fill(null)]);
    }
    return rows;
  };

  const equipment = await Promise.all(
    b.equipment.map(async (e, i) => {
      const items = e.checklist_template_id ? b.items[e.checklist_template_id] ?? [] : [];
      const res = b.results.filter((r) => r.service_equipment_id === e.id);
      const photoCount = b.photos.filter((x) => x.service_equipment_id === e.id).length;
      const photos = await Promise.all(
        STAGES.map(async (st) => {
          const list = b.photos.filter((x) => x.service_equipment_id === e.id && x.stage === st.id).sort((x, y) => x.position - y.position);
          return { stage: st.label.toUpperCase(), rows: rowsOf(await images(list), 3) };
        }),
      ).then((xs) => xs.filter((st) => st.rows.length));
      return {
        photoCount,
        // Por orden y no por la posición guardada: al quitar equipos quedan huecos (1, 2, 4…)
        n: i + 1,
        code: e.code ?? '—',
        type: names.typeName(e.equipment_type_id).toUpperCase(),
        capacity: equipmentLabel(e).toUpperCase(),
        brandModel: [e.brand, e.model].filter(Boolean).join(' / ').toUpperCase(),
        serial: e.serial || '—',
        status: e.final_status,
        observation: e.observation || (e.final_status === 'Conforme' ? 'Sin observaciones' : '—'),
        checklist: items.map((i, n) => {
          const r = res.find((x) => x.template_item_id === i.id);
          return { n: n + 1, category: i.category, activity: i.activity, result: r?.result ? RESULT[r.result] : '—', value: r?.value ?? '' };
        }),
        photos,
      };
    }),
  );

  const photoGroups = await Promise.all(
    [...b.photoGroups].sort((x, y) => x.position - y.position).map(async (g) => {
      const list = b.photos.filter((p) => p.group_id === g.id).sort((x, y) => x.position - y.position);
      return { title: g.title.toUpperCase(), description: g.description ?? '', rows: rowsOf(await images(list), 2) };
    }),
  );

  // Con equipos los textos se generan desde los hallazgos (salvo que se hayan editado) y van numerados
  const numbered = (xs: string[]) => xs.map((x, i) => `${i + 1}. ${x}`);
  let conclusions = splitLines(s.conclusions);
  let recommendations = splitLines(s.recommendations);
  if (withEquipment) {
    if (!s.conclusions) conclusions = splitLines(conclusionsFrom(b.findings, codeOf));
    if (!s.recommendations) recommendations = splitLines(recommendationsFrom(b.findings, codeOf));
    const sinHallazgo = b.equipment.filter((e) => !b.findings.some((f) => f.service_equipment_id === e.id)).map((e) => e.code);
    if (sinHallazgo.length) conclusions.push(`Los equipos ${sinHallazgo.join(', ')} se encuentran conformes, sin observaciones.`);
    conclusions = numbered(conclusions);
    recommendations = numbered(recommendations);
  }

  const site = names.site;
  const shortType = s.service_type.toUpperCase();
  const dateTag = fmtDate(s.execution_date).replaceAll('/', '-');
  // El nombre del archivo es el título de la portada (sin caracteres que Windows no admite)
  const title = (s.cover_title ?? '').replaceAll(' · ', ' - ').replace(/\s+/g, ' ').trim()
    || `INFORME ${shortType} - ${(site?.name ?? '').toUpperCase()} - ${dateTag}`;

  return {
    withEquipment,
    template: {
      code: tpl.code, name: tpl.name, version: String(tpl.version).padStart(2, '0'),
      issueDate: fmtDate(issueDate).replace(/\//g, '.').replace(/\.(\d{2})(\d{2})$/, '.$2'),
    },
    coverTitle: s.cover_title ?? '',
    serviceType: s.service_type,
    serviceCode: s.code,
    clientName: names.clientName(s.client_id),
    site,
    executionDate: fmtDate(s.execution_date),
    workOrder: s.work_order ?? '—',
    leadTech: names.userName(s.lead_tech_id),
    supportTechs: s.support_tech_ids.map((id) => names.userName(id)).join(', ') || '—',
    description: s.description ?? '',
    prevDetails: s.prev_details ?? [],
    equipmentSummary: equipmentSummary(s.service_type, b.equipment, names.typeName),
    equipment,
    findings: b.findings.map((f, i) => ({
      n: i + 1, code: codeOf(f.service_equipment_id), finding: f.finding, cause: f.probable_cause ?? '',
      action: f.action_taken ?? '', recommendation: f.recommendation ?? '', priority: f.priority,
    })),
    workItems: s.work_items ?? [],
    photoGroups,
    conclusions,
    observations: splitLines(s.observations),
    recommendations,
    sections: tpl.sections,
    failedPhotos,
    baseName: title.replace(/[\\/:*?"<>|]/g, '').replace(/[. ]+$/, '').slice(0, 180),
  };
}
