import type { ReportModel } from './model';
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
  .cover h1 { font-size: 20pt; color: #1f4e79; margin: 0; line-height: 1.3; }
  .cover .meta { font-size: 11pt; }
  .kv td:first-child { width: 32%; font-weight: bold; background: #f3f3f3; }
  .ph td { text-align: center; vertical-align: middle; width: 30%; height: 52mm; }
  .ph td:first-child { width: 10%; font-weight: bold; background: #f3f3f3; }
  .ph img { max-width: 100%; max-height: 46mm; display: block; margin: 0 auto 2px; }
  .ph .cap { font-size: 7.5pt; color: #444; }
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

export function renderReportHtml(m: ReportModel) {
  const has = (k: string) => m.sections.includes(k);
  const pages: string[] = [];

  if (has('portada')) {
    pages.push(page(m, `
      <div class="cover">
        <img src="${logo}" alt="Nórdico Ingenieros" style="width:110mm"/>
        <h1>${esc(m.coverTitle).replace(' · ', '<br/>')}</h1>
        <div class="meta">${esc(m.clientName)} · ${esc(m.site?.name ?? '')}<br/>${esc(m.executionDate)}</div>
        <div class="meta"><b>NÓRDICO INGENIEROS</b><br/>INFORME TÉCNICO · ${esc(m.serviceCode)}</div>
      </div>`));
  }

  let body = '';
  if (has('memoria')) {
    body += `<h2>1. MEMORIA DESCRIPTIVA</h2>
      <p>${esc(m.description)}</p>
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
  }
  if (has('detalles')) {
    body += `<h2>2. DETALLES PREVIOS</h2>
      <ul>${m.prevDetails.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>
      <p>• ${esc(m.equipmentSummary)}</p>`;
  }
  if (has('equipos')) {
    body += `<h2>3. LISTA DE EQUIPOS</h2>
      <table>
        <tr><th>N.º</th><th>Código</th><th>Tipo de equipo</th><th>Capacidad</th><th>Marca / Modelo</th><th>Serie</th><th>Estado final</th><th>Observación</th></tr>
        ${m.equipment.map((e) => `<tr><td>${e.n}</td><td>${esc(e.code)}</td><td>${esc(e.type)}</td><td>${esc(e.capacity)}</td><td>${esc(e.brandModel)}</td><td>${esc(e.serial)}</td><td class="${e.status === 'No conforme' ? 'nc' : ''}">${esc(e.status)}</td><td>${esc(e.observation)}</td></tr>`).join('')}
      </table>`;
  }
  if (body) pages.push(page(m, body));

  if (has('checklist')) {
    pages.push(page(m, `<h2>4. CHECKLIST DE MANTENIMIENTO</h2>` + m.equipment.map((e) => `
      <h3>${esc(e.code)} · ${esc(e.type)} ${esc(e.capacity)}</h3>
      <table>
        <tr><th style="width:6%">N.º</th><th style="width:18%">Categoría</th><th>Actividad</th><th style="width:16%">Resultado</th><th style="width:22%">Observación / valor</th></tr>
        ${e.checklist.map((c) => `<tr><td>${c.n}</td><td>${esc(c.category)}</td><td>${esc(c.activity)}</td><td class="${c.result === 'No conforme' ? 'nc' : ''}">${esc(c.result)}</td><td>${esc(c.value)}</td></tr>`).join('') || '<tr><td colspan="5">Sin checklist</td></tr>'}
      </table>`).join('')));
  }

  if (has('fotos')) {
    m.equipment.forEach((e, i) => {
      pages.push(page(m, `${i === 0 ? '<h2>5. REGISTRO FOTOGRÁFICO</h2>' : ''}
        <h3>${esc(e.code)} · ${esc(e.type)} ${esc(e.capacity)}</h3>
        <table class="ph">
          <tr><th>Etapa</th><th>Foto 1</th><th>Foto 2</th><th>Foto 3</th></tr>
          ${e.photos.map((r) => `<tr><td>${r.stage}</td>${r.images.map((img) => img
            ? `<td><img src="${img.dataUrl}"/><div class="cap">${esc(img.caption)}</div></td>`
            : '<td class="cap">—</td>').join('')}</tr>`).join('')}
        </table>`));
    });
  }

  let tail = '';
  if (has('hallazgos')) {
    tail += `<h2>6. HALLAZGOS Y DEFICIENCIAS</h2>` + (m.findings.length ? `
      <table>
        <tr><th>N.º</th><th>Equipo</th><th>Hallazgo</th><th>Causa probable</th><th>Acción realizada</th><th>Recomendación</th><th>Prioridad</th></tr>
        ${m.findings.map((f) => `<tr><td>${f.n}</td><td>${esc(f.code)}</td><td>${esc(f.finding)}</td><td>${esc(f.cause)}</td><td>${esc(f.action)}</td><td>${esc(f.recommendation)}</td><td>${esc(f.priority)}</td></tr>`).join('')}
      </table>` : '<p>No se registraron hallazgos. Todos los equipos se encuentran conformes.</p>');
  }
  if (has('conclusiones')) {
    tail += `<h2>7. CONCLUSIONES Y RECOMENDACIONES</h2>
      <h3>Conclusiones</h3>${m.conclusions.map((c) => `<p>${esc(c)}</p>`).join('') || '<p>—</p>'}
      <h3>Recomendaciones</h3>${m.recommendations.map((c) => `<p>${esc(c)}</p>`).join('') || '<p>—</p>'}`;
  }
  if (tail) pages.push(page(m, tail));

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"/><title>${esc(m.baseName)}</title><style>${CSS}</style></head><body>${pages.join('')}</body></html>`;
}

export function pageCount(m: ReportModel) {
  return (renderReportHtml(m).match(/class="page"/g) ?? []).length;
}
