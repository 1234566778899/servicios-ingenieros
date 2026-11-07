/**
 * Texto con formato (negrita, cursiva, subrayado, listas, párrafos) guardado como HTML.
 * Las descripciones antiguas son texto plano: se convierten al leerlas (un párrafo por línea).
 * Todo HTML pasa por `sanitizeRich`: solo quedan las etiquetas permitidas y ningún atributo,
 * así lo pegado desde Word o WhatsApp no trae estilos ni nada ejecutable al informe.
 */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const isHtml = (s: string) => /^\s*<(p|ul|ol|br|strong|em|u|b|i|div|span|h\d)\b/i.test(s);

const INLINE: Record<string, string> = { STRONG: 'strong', B: 'strong', EM: 'em', I: 'em', U: 'u' };
const BLOCK = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE']);

function clean(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return esc(node.textContent ?? '');
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const el = node as HTMLElement;
  const inner = () => [...el.childNodes].map(clean).join('');
  const tag = el.tagName;
  if (tag === 'BR') return '<br>';
  if (tag === 'SCRIPT' || tag === 'STYLE') return '';
  if (INLINE[tag]) { const t = INLINE[tag]; const c = inner(); return c ? `<${t}>${c}</${t}>` : ''; }
  if (tag === 'UL' || tag === 'OL') {
    const items = [...el.children].filter((c) => c.tagName === 'LI').map((li) => `<li>${[...li.childNodes].map(cleanInLi).join('')}</li>`);
    return items.length ? `<${tag.toLowerCase()}>${items.join('')}</${tag.toLowerCase()}>` : '';
  }
  if (BLOCK.has(tag)) return `<p>${inner()}</p>`;
  return inner(); // span, font, a… → solo su contenido
}

/** Dentro de un ítem de lista los párrafos se aplanan (TipTap envuelve el texto en <p>). */
function cleanInLi(node: Node): string {
  if (node.nodeType === Node.ELEMENT_NODE && BLOCK.has((node as HTMLElement).tagName)) {
    return [...node.childNodes].map(clean).join('');
  }
  return clean(node);
}

export function sanitizeRich(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  // El texto y el formato sueltos en la raíz se juntan en un mismo párrafo
  let out = '';
  let loose = '';
  const flush = () => { if (loose.trim()) out += `<p>${loose}</p>`; loose = ''; };
  for (const n of [...doc.body.childNodes]) {
    const tag = n.nodeType === Node.ELEMENT_NODE ? (n as HTMLElement).tagName : '';
    if (n.nodeType === Node.TEXT_NODE || INLINE[tag] || tag === 'SPAN' || tag === 'BR' || tag === 'A' || tag === 'FONT') loose += clean(n);
    else { flush(); out += clean(n); }
  }
  flush();
  // Sin líneas vacías al principio ni al final
  return out.replace(/^(<p><\/p>)+|(<p><\/p>)+$/g, '');
}

/** HTML seguro para mostrar/editar, venga de texto plano antiguo o de HTML. */
export function toRichHtml(value?: string | null): string {
  const v = value ?? '';
  if (!v.trim()) return '';
  if (isHtml(v)) return sanitizeRich(v);
  return v.split(/\r?\n/).map((line) => `<p>${esc(line)}</p>`).join('');
}

/** Texto sin formato (para subtítulos, búsquedas y textos frecuentes). */
export function richToPlain(value?: string | null): string {
  const html = toRichHtml(value);
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html.replace(/<br>/g, '\n').replace(/<\/(p|li)>/g, '</$1>\n'), 'text/html');
  return (doc.body.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim();
}

export const isRichEmpty = (value?: string | null) => !richToPlain(value);

export interface RichRun { text: string; bold?: boolean; italic?: boolean; underline?: boolean; br?: boolean }
export interface RichBlock { runs: RichRun[]; list?: 'bullet' | 'number'; index?: number }

/** Bloques y tramos con formato, para armar los párrafos del Word. */
export function richBlocks(value?: string | null): RichBlock[] {
  const html = toRichHtml(value);
  if (!html) return [];
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const runsOf = (node: Node, f: Omit<RichRun, 'text'> = {}): RichRun[] => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ? [{ text: node.textContent, ...f }] : [];
    const el = node as HTMLElement;
    if (el.tagName === 'BR') return [{ text: '', br: true }];
    const g = { ...f };
    if (el.tagName === 'STRONG') g.bold = true;
    if (el.tagName === 'EM') g.italic = true;
    if (el.tagName === 'U') g.underline = true;
    return [...el.childNodes].flatMap((c) => runsOf(c, g));
  };
  const blocks: RichBlock[] = [];
  for (const el of [...doc.body.children] as HTMLElement[]) {
    if (el.tagName === 'UL' || el.tagName === 'OL') {
      [...el.children].forEach((li, i) => blocks.push({ runs: runsOf(li), list: el.tagName === 'UL' ? 'bullet' : 'number', index: i + 1 }));
    } else {
      blocks.push({ runs: runsOf(el) });
    }
  }
  return blocks;
}
