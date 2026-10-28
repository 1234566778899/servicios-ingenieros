import {
  AlignmentType, BorderStyle, Document, Header, ImageRun, Packer, Paragraph, ShadingType, Table, TableCell,
  TableRow, TextRun, VerticalAlign, WidthType,
} from 'docx';
import { rowLayout, type ReportImage, type ReportModel } from './model';
import logoDataUrl from '../assets/logo.png?inline';

// Logo 400×113 px embebido en el bundle
const LOGO = Uint8Array.from(atob(logoDataUrl.split(',')[1]), (c) => c.charCodeAt(0));
const logoRun = (width: number) => new ImageRun({ type: 'png', data: LOGO, transformation: { width, height: Math.round((width * 113) / 400) } });

const BLUE = '1F4E79';
const CONTENT = 11906 - 900 * 2; // ancho útil A4 en twips
const dxa = (pct: number) => Math.round((CONTENT * pct) / 100);
const LIGHT = 'DDE6F0';
const border = { style: BorderStyle.SINGLE, size: 4, color: '555555' };
const borders = { top: border, bottom: border, left: border, right: border };

const p = (text: string, opts: { bold?: boolean; size?: number; color?: string; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}) =>
  new Paragraph({
    alignment: opts.align,
    spacing: { after: 80 },
    children: [new TextRun({ text, bold: opts.bold, size: opts.size ?? 19, color: opts.color, font: 'Arial' })],
  });

const cell = (content: string | Paragraph[], opts: { head?: boolean; width?: number; shade?: string; span?: number; rowSpan?: number; color?: string } = {}) =>
  new TableCell({
    borders,
    columnSpan: opts.span,
    rowSpan: opts.rowSpan,
    verticalAlign: VerticalAlign.CENTER,
    width: opts.width ? { size: dxa(opts.width), type: WidthType.DXA } : undefined,
    shading: opts.head ? { type: ShadingType.CLEAR, fill: BLUE, color: 'auto' } : opts.shade ? { type: ShadingType.CLEAR, fill: opts.shade, color: 'auto' } : undefined,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    children: typeof content === 'string'
      ? [new Paragraph({ children: [new TextRun({ text: content, bold: opts.head, color: opts.head ? 'FFFFFF' : opts.color, size: opts.head ? 16 : 17, font: 'Arial' })] })]
      : content,
  });

const table = (head: string[], rows: string[][], widths?: number[], colorize?: (r: number, c: number) => string | undefined) =>
  new Table({
    width: { size: CONTENT, type: WidthType.DXA },
    columnWidths: (widths ?? head.map(() => 100 / head.length)).map(dxa),
    rows: [
      new TableRow({ tableHeader: true, children: head.map((h, i) => cell(h.toUpperCase(), { head: true, width: widths?.[i] })) }),
      ...rows.map((r, ri) => new TableRow({ children: r.map((v, ci) => cell(v, { width: widths?.[ci], color: colorize?.(ri, ci) })) })),
    ],
  });

const h2 = (text: string, pageBreakBefore = false) =>
  new Paragraph({
    pageBreakBefore,
    spacing: { before: 240, after: 120 },
    shading: { type: ShadingType.CLEAR, fill: LIGHT, color: 'auto' },
    border: { left: { style: BorderStyle.SINGLE, size: 24, color: BLUE, space: 4 } },
    children: [new TextRun({ text, bold: true, size: 22, font: 'Arial' })],
  });

const h3 = (text: string, pageBreakBefore = false) => new Paragraph({ pageBreakBefore, spacing: { before: 160, after: 80 }, children: [new TextRun({ text, bold: true, size: 20, font: 'Arial' })] });

function headerTable(m: ReportModel) {
  return new Table({
    width: { size: CONTENT, type: WidthType.DXA },
    columnWidths: [28, 46, 26].map(dxa),
    rows: [
      new TableRow({
        children: [
          cell([new Paragraph({ alignment: AlignmentType.CENTER, children: [logoRun(140)] })], { rowSpan: 3, width: 28 }),
          cell([
            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'SERVICIO', bold: true, size: 18, font: 'Arial' })] }),
            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'FORMATO: INFORME TÉCNICO', bold: true, size: 18, font: 'Arial' })] }),
          ], { rowSpan: 3, width: 46 }),
          cell(`Código: ${m.template.code}`, { width: 26 }),
        ],
      }),
      new TableRow({ children: [cell(`Versión: ${m.template.version}`)] }),
      new TableRow({ children: [cell(`Fecha de emisión: ${m.template.issueDate}`)] }),
    ],
  });
}

/** Ajusta la foto a una caja (170×125 px por defecto) conservando la proporción. */
function img(i: ReportImage, boxW = 170, boxH = 125) {
  const scale = Math.min(boxW / i.width, boxH / i.height);
  return new ImageRun({ type: 'jpg', data: i.bytes, transformation: { width: Math.round(i.width * scale), height: Math.round(i.height * scale) } });
}

function coverParagraphs(m: ReportModel) {
  return [
    new Paragraph({ spacing: { before: 3600 } }),
    ...m.coverTitle.split(' · ').map((t) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120, line: 312 }, children: [new TextRun({ text: t, bold: true, size: 60, color: '000000', font: 'Arial Black' })] })),
  ];
}

function memoriaBlocks(m: ReportModel, n: number, pageBreakBefore: boolean) {
  const kv: [string, string][] = [
    ['Cliente', m.clientName], ['Tienda / Sede', m.site?.name ?? ''], ['Dirección', m.site?.address ?? '—'],
    ['Tipo de servicio', m.serviceType], ['Fecha de ejecución', m.executionDate], ['Orden de trabajo', m.workOrder],
    ['Técnico responsable', m.leadTech], ['Técnicos de apoyo', m.supportTechs],
  ];
  return [
    h2(`${n}. MEMORIA DESCRIPTIVA`, pageBreakBefore), ...(m.description ? [p(m.description)] : []),
    new Table({
      width: { size: CONTENT, type: WidthType.DXA },
      columnWidths: [32, 68].map(dxa),
      rows: kv.map(([k, v]) => new TableRow({ children: [cell(k, { shade: 'F3F3F3', width: 32 }), cell(v, { width: 68 })] })),
    }),
  ];
}

const bullets = (xs: string[]) => xs.map((d) => p(`•  ${d}`));

/** Celda de foto: la imagen (con sus figuras) y, si lo hay, el comentario debajo */
const photoCell = (im: ReportImage | null, width: number, box: [number, number], empty = '') => cell(im
  ? [
      new Paragraph({ alignment: AlignmentType.CENTER, children: [img(im, ...box)] }),
      ...(im.caption ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: im.caption, size: 14, color: '444444', font: 'Arial' })] })] : []),
    ]
  : [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: empty, font: 'Arial' })] })], { width });

const NONE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const noBorders = { top: NONE, bottom: NONE, left: NONE, right: NONE };

/** Fila de fotos sin bordes: hasta 3, a la misma altura y centradas (si la última queda sola sale al medio).
 *  Una tabla por fila, con un párrafo en medio para que Word no las una.
 *  Medidas en px (96 ppp): ~673 de ancho útil, 8 entre fotos (márgenes de celda), 250 de alto como máximo. */
const PX = 15; // twips por px
const PAD = 60; // margen izquierdo/derecho de cada celda, en twips
const photoRow = (row: ReportImage[]) => {
  const { height, widths } = rowLayout(row, CONTENT / PX, (PAD * 2) / PX, 250);
  const cols = widths.map((w) => Math.floor(w * PX + PAD * 2));
  return [
    new Table({
      alignment: AlignmentType.CENTER,
      width: { size: cols.reduce((a, c) => a + c, 0), type: WidthType.DXA },
      columnWidths: cols,
      borders: { ...noBorders, insideHorizontal: NONE, insideVertical: NONE },
      rows: [new TableRow({
        cantSplit: true,
        children: row.map((im, i) => new TableCell({
          borders: noBorders,
          verticalAlign: VerticalAlign.CENTER,
          width: { size: cols[i], type: WidthType.DXA },
          margins: { top: 0, bottom: 0, left: PAD, right: PAD },
          children: [
            new Paragraph({ alignment: AlignmentType.CENTER, children: [img(im, widths[i], height)] }),
            ...(im.caption ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: im.caption, size: 14, color: '444444', font: 'Arial' })] })] : []),
          ],
        })),
      })],
    }),
    new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: '', size: 8 })] }),
  ];
};

/** Salto de página al empezar un bloque (como las páginas de la vista previa), salvo al inicio del documento. */
function pager(body: unknown[]) {
  let pending = false;
  return {
    block: () => { pending = body.length > 0; },
    take: () => { const b = pending; pending = false; return b; },
  };
}

/** Servicio sin equipos: secciones numeradas según lo que tenga y fotos por sección (2 por fila).
 *  Las secciones sin datos no aparecen. */
function serviceBody(m: ReportModel) {
  const has = (k: string) => m.sections.includes(k);
  const body: (Paragraph | Table)[] = [];
  const pg = pager(body);
  let n = 0;
  if (has('portada')) body.push(...coverParagraphs(m));
  pg.block();
  if (has('memoria')) body.push(...memoriaBlocks(m, ++n, pg.take()));
  if (has('detalles')) {
    if (m.prevDetails.length) body.push(h2(`${++n}. DETALLES PREVIOS`, pg.take()), ...bullets(m.prevDetails));
    if (m.workItems.length) body.push(h2(`${++n}. TRABAJOS REALIZADOS`, pg.take()), ...bullets(m.workItems));
  }
  const groups = m.photoGroups.filter((g) => g.rows.length);
  if (has('fotos') && groups.length) {
    const sec = ++n;
    pg.block();
    groups.forEach((g, i) => {
      if (i === 0) body.push(h2(`${sec}. REGISTRO FOTOGRÁFICO`, pg.take()));
      body.push(h3(`${sec}.${i + 1}. ${g.title}`, i > 0));
      body.push(...g.rows.flatMap(photoRow));
      if (g.description) body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 120 }, children: [new TextRun({ text: g.description, bold: true, size: 19, font: 'Arial' })] }));
    });
  }
  if (has('conclusiones')) {
    pg.block();
    if (m.conclusions.length) body.push(h2(`${++n}. CONCLUSIONES`, pg.take()), ...bullets(m.conclusions));
    if (m.observations.length) body.push(h2(`${++n}. OBSERVACIONES`, pg.take()), ...bullets(m.observations));
    if (m.recommendations.length) body.push(h2(`${++n}. RECOMENDACIONES`, pg.take()), ...bullets(m.recommendations));
  }
  return body;
}

export async function renderReportDocx(m: ReportModel): Promise<Uint8Array> {
  const body = m.withEquipment ? equipmentBody(m) : serviceBody(m);
  const doc = new Document({
    creator: 'Nordico Ingenieros',
    title: m.baseName,
    styles: { default: { document: { run: { font: 'Arial', size: 19 } } } },
    sections: [{
      properties: { page: { margin: { top: 720, bottom: 720, left: 900, right: 900 } } },
      headers: { default: new Header({ children: [headerTable(m), new Paragraph({ text: '' })] }) },
      children: body,
    }],
  });
  const blob = await Packer.toBlob(doc);
  return new Uint8Array(await blob.arrayBuffer());
}

function equipmentBody(m: ReportModel) {
  const has = (k: string) => m.sections.includes(k);
  const body: (Paragraph | Table)[] = [];
  const pg = pager(body);
  let n = 0;
  if (has('portada')) body.push(...coverParagraphs(m));
  pg.block();

  if (has('memoria')) body.push(...memoriaBlocks(m, ++n, pg.take()));
  if (has('detalles') && (m.prevDetails.length || m.equipmentSummary)) {
    body.push(h2(`${++n}. DETALLES PREVIOS`, pg.take()), ...bullets(m.prevDetails), ...(m.equipmentSummary ? bullets([m.equipmentSummary]) : []));
  }
  if (has('equipos') && m.equipment.length) {
    body.push(h2(`${++n}. LISTA DE EQUIPOS`, pg.take()), table(
      ['N.º', 'Código', 'Tipo de equipo', 'Capacidad', 'Marca / Modelo', 'Serie', 'Estado final', 'Observación'],
      m.equipment.map((e) => [String(e.n), e.code, e.type, e.capacity, e.brandModel, e.serial, e.status, e.observation]),
      [6, 11, 18, 10, 18, 10, 12, 15],
      (r, c) => (c === 6 && m.equipment[r].status === 'No conforme' ? 'B00020' : undefined),
    ));
  }
  const checklists = m.equipment.filter((e) => e.checklist.length);
  if (has('checklist') && checklists.length) {
    pg.block();
    body.push(h2(`${++n}. CHECKLIST DE MANTENIMIENTO`, pg.take()));
    for (const e of checklists) {
      body.push(h3(`${e.code} · ${e.type} ${e.capacity}`), table(
        ['N.º', 'Categoría', 'Actividad', 'Resultado', 'Observación / valor'],
        e.checklist.map((c) => [String(c.n), c.category, c.activity, c.result, c.value]),
        [6, 18, 38, 16, 22],
        (r, c) => (c === 3 && e.checklist[r].result === 'No conforme' ? 'B00020' : undefined),
      ));
    }
  }
  const withPhotos = m.equipment.filter((e) => e.photos.length);
  if (has('fotos') && withPhotos.length) {
    pg.block();
    const sec = ++n;
    for (const [i, e] of withPhotos.entries()) {
      if (i === 0) body.push(h2(`${sec}. REGISTRO FOTOGRÁFICO`, pg.take()));
      body.push(h3(`${e.code} · ${e.type} ${e.capacity}`, i > 0));
      body.push(new Table({
        width: { size: CONTENT, type: WidthType.DXA },
        columnWidths: [10, 30, 30, 30].map(dxa),
        rows: [
          new TableRow({ tableHeader: true, children: ['ETAPA', 'FOTO 1', 'FOTO 2', 'FOTO 3'].map((h, k) => cell(h, { head: true, width: k ? 30 : 10 })) }),
          ...e.photos.flatMap((st) => st.rows.map((row, ri) => new TableRow({
            cantSplit: true,
            children: [
              ...(ri === 0 ? [cell(st.stage, { shade: 'F3F3F3', width: 10, rowSpan: st.rows.length })] : []),
              ...row.map((im) => photoCell(im, 30, [170, 125], '—')),
            ],
          }))),
        ],
      }));
    }
  }
  pg.block();
  if (has('hallazgos') && m.findings.length) {
    body.push(h2(`${++n}. HALLAZGOS Y DEFICIENCIAS`, pg.take()), table(
      ['N.º', 'Equipo', 'Hallazgo', 'Causa probable', 'Acción realizada', 'Recomendación', 'Prioridad'],
      m.findings.map((f) => [String(f.n), f.code, f.finding, f.cause, f.action, f.recommendation, f.priority]),
      [5, 10, 15, 20, 20, 20, 10]));
  }
  if (has('conclusiones') && (m.conclusions.length || m.recommendations.length)) {
    const title = [m.conclusions.length && 'CONCLUSIONES', m.recommendations.length && 'RECOMENDACIONES'].filter(Boolean).join(' Y ');
    body.push(h2(`${++n}. ${title}`, pg.take()));
    if (m.conclusions.length) body.push(h3('Conclusiones'), ...m.conclusions.map((c) => p(c)));
    if (m.recommendations.length) body.push(h3('Recomendaciones'), ...m.recommendations.map((c) => p(c)));
  }
  return body;
}
