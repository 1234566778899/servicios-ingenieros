import {
  AlignmentType, BorderStyle, Document, Header, ImageRun, Packer, Paragraph, ShadingType, Table, TableCell,
  TableRow, TextRun, VerticalAlign, WidthType,
} from 'docx';
import type { ReportImage, ReportModel } from './model';
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

/** Ajusta la foto a una caja de 170×125 px conservando la proporción. */
function img(i: ReportImage) {
  const scale = Math.min(170 / i.width, 125 / i.height);
  return new ImageRun({ type: 'jpg', data: i.bytes, transformation: { width: Math.round(i.width * scale), height: Math.round(i.height * scale) } });
}

export async function renderReportDocx(m: ReportModel): Promise<Uint8Array> {
  const has = (k: string) => m.sections.includes(k);
  const body: (Paragraph | Table)[] = [];

  if (has('portada')) {
    body.push(
      new Paragraph({ spacing: { before: 2000, after: 800 }, alignment: AlignmentType.CENTER, children: [logoRun(400)] }),
      ...m.coverTitle.split(' · ').map((t) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: t, bold: true, size: 36, color: BLUE, font: 'Arial' })] })),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 600 }, children: [new TextRun({ text: `${m.clientName} · ${m.site?.name ?? ''}`, size: 22, font: 'Arial' })] }),
      p(m.executionDate, { align: AlignmentType.CENTER, size: 22 }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 600 }, children: [new TextRun({ text: 'NÓRDICO INGENIEROS', bold: true, size: 22, font: 'Arial' })] }),
      p(`INFORME TÉCNICO · ${m.serviceCode}`, { align: AlignmentType.CENTER, size: 22 }),
    );
  }
  const afterCover = has('portada');

  if (has('memoria')) {
    body.push(h2('1. MEMORIA DESCRIPTIVA', afterCover), p(m.description));
    const kv: [string, string][] = [
      ['Cliente', m.clientName], ['Tienda / Sede', m.site?.name ?? ''], ['Dirección', m.site?.address ?? '—'],
      ['Tipo de servicio', m.serviceType], ['Fecha de ejecución', m.executionDate], ['Orden de trabajo', m.workOrder],
      ['Técnico responsable', m.leadTech], ['Técnicos de apoyo', m.supportTechs],
    ];
    body.push(new Table({
      width: { size: CONTENT, type: WidthType.DXA },
      columnWidths: [32, 68].map(dxa),
      rows: kv.map(([k, v]) => new TableRow({ children: [cell(k, { shade: 'F3F3F3', width: 32 }), cell(v, { width: 68 })] })),
    }));
  }
  if (has('detalles')) {
    body.push(h2('2. DETALLES PREVIOS'), ...m.prevDetails.map((d) => p(`•  ${d}`)), p(`•  ${m.equipmentSummary}`));
  }
  if (has('equipos')) {
    body.push(h2('3. LISTA DE EQUIPOS'), table(
      ['N.º', 'Código', 'Tipo de equipo', 'Capacidad', 'Marca / Modelo', 'Serie', 'Estado final', 'Observación'],
      m.equipment.map((e) => [String(e.n), e.code, e.type, e.capacity, e.brandModel, e.serial, e.status, e.observation]),
      [6, 11, 18, 10, 18, 10, 12, 15],
      (r, c) => (c === 6 && m.equipment[r].status === 'No conforme' ? 'B00020' : undefined),
    ));
  }
  if (has('checklist')) {
    body.push(h2('4. CHECKLIST DE MANTENIMIENTO', true));
    for (const e of m.equipment) {
      body.push(h3(`${e.code} · ${e.type} ${e.capacity}`), table(
        ['N.º', 'Categoría', 'Actividad', 'Resultado', 'Observación / valor'],
        e.checklist.map((c) => [String(c.n), c.category, c.activity, c.result, c.value]),
        [6, 18, 38, 16, 22],
        (r, c) => (c === 3 && e.checklist[r].result === 'No conforme' ? 'B00020' : undefined),
      ));
    }
  }
  if (has('fotos')) {
    for (const [i, e] of m.equipment.entries()) {
      if (i === 0) body.push(h2('5. REGISTRO FOTOGRÁFICO', true));
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
              ...row.map((im) => cell(im
                ? [
                    new Paragraph({ alignment: AlignmentType.CENTER, children: [img(im)] }),
                    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: im.caption, size: 14, color: '444444', font: 'Arial' })] }),
                  ]
                : [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '—', font: 'Arial' })] })], { width: 30 })),
            ],
          }))),
        ],
      }));
    }
  }
  if (has('hallazgos')) {
    body.push(h2('6. HALLAZGOS Y DEFICIENCIAS', true));
    body.push(m.findings.length
      ? table(['N.º', 'Equipo', 'Hallazgo', 'Causa probable', 'Acción realizada', 'Recomendación', 'Prioridad'],
          m.findings.map((f) => [String(f.n), f.code, f.finding, f.cause, f.action, f.recommendation, f.priority]),
          [5, 10, 15, 20, 20, 20, 10])
      : p('No se registraron hallazgos. Todos los equipos se encuentran conformes.'));
  }
  if (has('conclusiones')) {
    body.push(h2('7. CONCLUSIONES Y RECOMENDACIONES', !has('hallazgos')), h3('Conclusiones'), ...(m.conclusions.length ? m.conclusions : ['—']).map((c) => p(c)),
      h3('Recomendaciones'), ...(m.recommendations.length ? m.recommendations : ['—']).map((c) => p(c)));
  }

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
