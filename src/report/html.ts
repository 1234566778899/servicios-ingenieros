import { rowLayout, type ReportImage, type ReportModel } from './model';
import logo from '../assets/logo.png?inline';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const CSS = `
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; font-size: 10pt; color: #1b1b1b; background: #e8e8e8; }
  .page { width: 210mm; min-height: 297mm; padding: 14mm 16mm; margin: 0 auto 12px; background: #fff; page-break-after: always; }
  .page:last-child { page-break-after: auto; }
  @media print { body { background: #fff; } .page { margin: 0; } }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #555; padding: 4px 6px; vertical-align: top; }
  th { background: #1f4e79; color: #fff; font-weight: bold; font-size: 8.5pt; text-transform: uppercase; }
  .hdr td { font-size: 8.5pt; }
  h2 { font-size: 11pt; background: #dde6f0; padding: 5px 8px; margin: 16px 0 8px; border-left: 4px solid #1f4e79; }
  h3 { font-size: 10pt; margin: 12px 0 6px; }
  .cover { display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; min-height: 220mm; gap: 18px; }
  .cover h1 { font-size: 30pt; color: #000; margin: 0 8mm; line-height: 1.3; font-weight: 900; }
  .kv td:first-child { width: 32%; font-weight: bold; background: #f3f3f3; }
  .ph td { text-align: center; vertical-align: middle; width: 30%; height: 52mm; }
  .ph td[rowspan] { width: 10%; font-weight: bold; background: #f3f3f3; }
  .ph tr { page-break-inside: avoid; }
  .ph img { max-width: 100%; max-height: 46mm; display: block; margin: 0 auto 2px; }
  .ph .cap { font-size: 7.5pt; color: #444; }
  .prow { display: flex; justify-content: center; gap: 4mm; margin-bottom: 4mm; page-break-inside: avoid; }
  .prow figure { margin: 0; text-align: center; }
  .prow .box { display: flex; align-items: center; justify-content: center; }
  .prow img { max-width: 100%; max-height: 100%; display: block; }
  .prow figcaption { font-size: 7.5pt; color: #444; margin-top: 2px; }
  .desc { text-align: center; font-weight: bold; margin: 8px 0 14px; }
  .nc { color: #b00020; font-weight: bold; }
  p { margin: 6px 0; text-align: justify; line-height: 1.4; }
  ul { margin: 6px 0 6px 18px; padding: 0; }
`;

function header(m: ReportModel) {
  return `
  <table class="hdr">
    <tr>
      <td rowspan="3" style="width:28%;text-align:center;vertical-align:middle"><img src="${logo}" alt="Nórdico Ingenieros" style="width:150px"/></td>
      <td rowspan="3" style="text-align:center;vertical-align:middle;font-weight:bold">SERVICIO<br/>FORMATO: INFORME TÉCNICO</td>
      <td style="width:26%">Código: ${esc(m.template.code)}</td>
    </tr>
    <tr><td>Versión: ${esc(m.template.version)}</td></tr>
    <tr><td>Fecha de emisión: ${esc(m.template.issueDate)}</td></tr>
  </table>`;
}

const page = (m: ReportModel, body: string) => `<div class="page">${header(m)}${body}</div>`;

const cover = (m: ReportModel) => page(m, `
  <div class="cover">
    <h1>${esc(m.coverTitle).replace(' · ', '<br/>')}</h1>
  </div>`);

const memoria = (m: ReportModel, n: number) => `<h2>${n}. MEMORIA DESCRIPTIVA</h2>
  ${m.description ? `<p>${esc(m.description)}</p>` : ''}
  <table class="kv">
    <tr><td>Cliente</td><td>${esc(m.clientName)}</td></tr>
    <tr><td>Tienda / Sede</td><td>${esc(m.site?.name ?? '')}</td></tr>
    <tr><td>Dirección</td><td>${esc(m.site?.address ?? '—')}</td></tr>
    <tr><td>Tipo de servicio</td><td>${esc(m.serviceType)}</td></tr>
    <tr><td>Fecha de ejecución</td><td>${esc(m.executionDate)}</td></tr>
    <tr><td>Orden de trabajo</td><td>${esc(m.workOrder)}</td></tr>
    <tr><td>Técnico responsable</td><td>${esc(m.leadTech)}</td></tr>
    <tr><td>Técnicos de apoyo</td><td>${esc(m.supportTechs)}</td></tr>
  </table>`;

/** Celda de foto: la imagen (con sus figuras) y, si lo hay, el comentario debajo */
const photoCell = (img: ReportImage | null, empty = '') => (img
  ? `<td><img src="${img.dataUrl}"/>${img.caption ? `<div class="cap">${esc(img.caption)}</div>` : ''}</td>`
  : `<td class="cap">${empty}</td>`);

/** Fila de fotos sin tabla: hasta 3, a la misma altura y centradas (si la última queda sola sale al medio).
 *  Medidas en mm: 178 de ancho útil, 4 entre fotos, 72 de alto como máximo. */
const photoRow = (row: ReportImage[]) => {
  const { height, widths } = rowLayout(row, 178, 4, 72);
  return `<div class="prow">${row.map((img, i) =>
    `<figure style="width:${widths[i].toFixed(1)}mm"><div class="box" style="height:${height.toFixed(1)}mm"><img src="${img.dataUrl}"/></div>${img.caption ? `<figcaption>${esc(img.caption)}</figcaption>` : ''}</figure>`).join('')}</div>`;
};

const bullets = (xs: string[]) => `<ul>${xs.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>`;
const doc = (m: ReportModel, pages: string[]) =>
  `<!doctype html><html lang="es"><head><meta charset="utf-8"/><title>${esc(m.baseName)}</title><style>${CSS}</style></head><body>${pages.join('')}</body></html>`;

/** Servicio sin equipos: secciones numeradas según lo que tenga (como los informes de pintura, SCI, etc.).
 *  Las secciones sin datos no aparecen. */
function renderServiceHtml(m: ReportModel) {
  const has = (k: string) => m.sections.includes(k);
  const pages: string[] = [];
  let n = 0;
  if (has('portada')) pages.push(cover(m));

  let body = '';
  if (has('memoria')) body += memoria(m, ++n);
  if (has('detalles')) {
    if (m.prevDetails.length) body += `<h2>${++n}. DETALLES PREVIOS</h2>${bullets(m.prevDetails)}`;
    if (m.workItems.length) body += `<h2>${++n}. TRABAJOS REALIZADOS</h2>${bullets(m.workItems)}`;
  }
  if (body) pages.push(page(m, body));

  const groups = m.photoGroups.filter((g) => g.rows.length);
  if (has('fotos') && groups.length) {
    const sec = ++n;
    groups.forEach((g, i) => {
      pages.push(page(m, `${i === 0 ? `<h2>${sec}. REGISTRO FOTOGRÁFICO</h2>` : ''}
        <h3>${sec}.${i + 1}. ${esc(g.title)}</h3>
        ${g.rows.map(photoRow).join('')}
        ${g.description ? `<p class="desc">${esc(g.description)}</p>` : ''}`));
    });
  }

  let tail = '';
  if (has('conclusiones')) {
    if (m.conclusions.length) tail += `<h2>${++n}. CONCLUSIONES</h2>${bullets(m.conclusions)}`;
    if (m.observations.length) tail += `<h2>${++n}. OBSERVACIONES</h2>${bullets(m.observations)}`;
    if (m.recommendations.length) tail += `<h2>${++n}. RECOMENDACIONES</h2>${bullets(m.recommendations)}`;
  }
  if (tail) pages.push(page(m, tail));
  return doc(m, pages);
}

export function renderReportHtml(m: ReportModel) {
  if (!m.withEquipment) return renderServiceHtml(m);
  const has = (k: string) => m.sections.includes(k);
  const pages: string[] = [];
  let n = 0;

  if (has('portada')) pages.push(cover(m));

  let body = '';
  if (has('memoria')) body += memoria(m, ++n);
  if (has('detalles') && (m.prevDetails.length || m.equipmentSummary)) {
    body += `<h2>${++n}. DETALLES PREVIOS</h2>
      ${m.prevDetails.length ? bullets(m.prevDetails) : ''}
      ${m.equipmentSummary ? `<p>• ${esc(m.equipmentSummary)}</p>` : ''}`;
  }
  if (has('equipos') && m.equipment.length) {
    body += `<h2>${++n}. LISTA DE EQUIPOS</h2>
      <table>
        <tr><th>N.º</th><th>Código</th><th>Tipo de equipo</th><th>Capacidad</th><th>Marca / Modelo</th><th>Serie</th><th>Estado final</th><th>Observación</th></tr>
        ${m.equipment.map((e) => `<tr><td>${e.n}</td><td>${esc(e.code)}</td><td>${esc(e.type)}</td><td>${esc(e.capacity)}</td><td>${esc(e.brandModel)}</td><td>${esc(e.serial)}</td><td class="${e.status === 'No conforme' ? 'nc' : ''}">${esc(e.status)}</td><td>${esc(e.observation)}</td></tr>`).join('')}
      </table>`;
  }
  if (body) pages.push(page(m, body));

  const checklists = m.equipment.filter((e) => e.checklist.length);
  if (has('checklist') && checklists.length) {
    pages.push(page(m, `<h2>${++n}. CHECKLIST DE MANTENIMIENTO</h2>` + checklists.map((e) => `
      <h3>${esc(e.code)} · ${esc(e.type)} ${esc(e.capacity)}</h3>
      <table>
        <tr><th style="width:6%">N.º</th><th style="width:18%">Categoría</th><th>Actividad</th><th style="width:16%">Resultado</th><th style="width:22%">Observación / valor</th></tr>
        ${e.checklist.map((c) => `<tr><td>${c.n}</td><td>${esc(c.category)}</td><td>${esc(c.activity)}</td><td class="${c.result === 'No conforme' ? 'nc' : ''}">${esc(c.result)}</td><td>${esc(c.value)}</td></tr>`).join('')}
      </table>`).join('')));
  }

  const withPhotos = m.equipment.filter((e) => e.photos.length);
  if (has('fotos') && withPhotos.length) {
    const sec = ++n;
    withPhotos.forEach((e, i) => {
      pages.push(page(m, `${i === 0 ? `<h2>${sec}. REGISTRO FOTOGRÁFICO</h2>` : ''}
        <h3>${esc(e.code)} · ${esc(e.type)} ${esc(e.capacity)}</h3>
        <table class="ph">
          <tr><th>Etapa</th><th>Foto 1</th><th>Foto 2</th><th>Foto 3</th></tr>
          ${e.photos.map((st) => st.rows.map((row, ri) => `<tr>${ri === 0 ? `<td rowspan="${st.rows.length}">${st.stage}</td>` : ''}${row.map((img) => photoCell(img, '—')).join('')}</tr>`).join('')).join('')}
        </table>`));
    });
  }

  let tail = '';
  if (has('hallazgos') && m.findings.length) {
    tail += `<h2>${++n}. HALLAZGOS Y DEFICIENCIAS</h2>
      <table>
        <tr><th>N.º</th><th>Equipo</th><th>Hallazgo</th><th>Causa probable</th><th>Acción realizada</th><th>Recomendación</th><th>Prioridad</th></tr>
        ${m.findings.map((f) => `<tr><td>${f.n}</td><td>${esc(f.code)}</td><td>${esc(f.finding)}</td><td>${esc(f.cause)}</td><td>${esc(f.action)}</td><td>${esc(f.recommendation)}</td><td>${esc(f.priority)}</td></tr>`).join('')}
      </table>`;
  }
  if (has('conclusiones') && (m.conclusions.length || m.recommendations.length)) {
    tail += `<h2>${++n}. ${[m.conclusions.length && 'CONCLUSIONES', m.recommendations.length && 'RECOMENDACIONES'].filter(Boolean).join(' Y ')}</h2>
      ${m.conclusions.length ? `<h3>Conclusiones</h3>${m.conclusions.map((c) => `<p>${esc(c)}</p>`).join('')}` : ''}
      ${m.recommendations.length ? `<h3>Recomendaciones</h3>${m.recommendations.map((c) => `<p>${esc(c)}</p>`).join('')}` : ''}`;
  }
  if (tail) pages.push(page(m, tail));

  return doc(m, pages);
}

export function pageCount(m: ReportModel) {
  return (renderReportHtml(m).match(/class="page"/g) ?? []).length;
}
