/** Figuras dibujadas sobre una foto. Coordenadas relativas (0–1) al ancho y alto de la imagen. */
export type ShapeKind = 'arrow' | 'rect' | 'ellipse' | 'text';

export interface Annotation {
  id: string; kind: ShapeKind;
  /** Flecha: (x1,y1) = cola, donde va el texto; (x2,y2) = punta. Rectángulo/círculo: esquinas opuestas. Texto: solo (x1,y1). */
  x1: number; y1: number; x2: number; y2: number;
  color: string; text: string;
}

export const ANNOTATION_COLORS = [
  { id: '#E81123', label: 'Rojo' },
  { id: '#FFB900', label: 'Amarillo' },
  { id: '#16C60C', label: 'Verde' },
  { id: '#0078D4', label: 'Azul' },
  { id: '#FFFFFF', label: 'Blanco' },
  { id: '#000000', label: 'Negro' },
];

/** Texto oscuro sobre colores claros (amarillo, blanco, verde) */
const ink = (color: string) => (['#FFB900', '#FFFFFF', '#16C60C'].includes(color.toUpperCase()) ? '#000000' : '#FFFFFF');

/** Zona clicable de cada figura, en píxeles del lienzo (para seleccionar y mover en el editor). */
export interface HitArea { id: string; kind: ShapeKind; box?: { x: number; y: number; w: number; h: number }; seg?: [number, number, number, number] }

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > maxW) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

/** Etiqueta con fondo del color de la figura, centrada en (cx, cy). Devuelve su caja. */
function label(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, maxW: number, color: string, font: number) {
  ctx.font = `bold ${font}px Arial, Helvetica, sans-serif`;
  const lines = wrap(ctx, text, maxW);
  const lh = font * 1.25;
  const pad = font * 0.45;
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + pad * 2;
  const h = lines.length * lh + pad * 2 - (lh - font);
  // Que no se salga de la imagen
  const x = Math.min(Math.max(cx - w / 2, 0), ctx.canvas.width - w);
  const y = Math.min(Math.max(cy - h / 2, 0), ctx.canvas.height - h);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, font * 0.3);
  ctx.fill();
  ctx.fillStyle = ink(color);
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  lines.forEach((l, i) => ctx.fillText(l, x + pad, y + pad + i * lh));
  return { x, y, w, h };
}

/** Dibuja las figuras sobre un lienzo de w×h (la foto ya debe estar dibujada). */
export function drawAnnotations(ctx: CanvasRenderingContext2D, list: Annotation[], selectedId?: string | null): HitArea[] {
  const { width: w, height: h } = ctx.canvas;
  const base = Math.max(w, h);
  const stroke = Math.max(2, base * 0.006);
  const font = Math.max(11, base * 0.026);
  const hits: HitArea[] = [];

  for (const a of list) {
    const x1 = a.x1 * w, y1 = a.y1 * h, x2 = a.x2 * w, y2 = a.y2 * h;
    ctx.save();
    ctx.strokeStyle = a.color;
    ctx.lineWidth = stroke;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Sombra suave para que se vea sobre fondos de cualquier color
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = stroke * 1.5;
    const text = a.text.trim();
    const box = { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };

    if (a.kind === 'arrow') {
      const ang = Math.atan2(y2 - y1, x2 - x1);
      const head = stroke * 4.5;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2 - Math.cos(ang) * head * 0.8, y2 - Math.sin(ang) * head * 0.8);
      ctx.stroke();
      ctx.fillStyle = a.color;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - head * Math.cos(ang - 0.45), y2 - head * Math.sin(ang - 0.45));
      ctx.lineTo(x2 - head * Math.cos(ang + 0.45), y2 - head * Math.sin(ang + 0.45));
      ctx.closePath();
      ctx.fill();
      hits.push({ id: a.id, kind: a.kind, seg: [x1, y1, x2, y2] });
      if (text) hits.push({ id: a.id, kind: a.kind, box: label(ctx, text, x1, y1, w * 0.4, a.color, font) });
    } else if (a.kind === 'rect' || a.kind === 'ellipse') {
      ctx.beginPath();
      if (a.kind === 'rect') ctx.rect(box.x, box.y, box.w, box.h);
      else ctx.ellipse(box.x + box.w / 2, box.y + box.h / 2, box.w / 2, box.h / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
      hits.push({ id: a.id, kind: a.kind, box });
      if (text) {
        ctx.shadowColor = 'transparent';
        hits.push({ id: a.id, kind: 'text', box: label(ctx, text, box.x + box.w / 2, box.y + box.h / 2, Math.max(box.w * 0.85, font * 6), a.color, font) });
      }
    } else {
      ctx.shadowColor = 'transparent';
      hits.push({ id: a.id, kind: a.kind, box: label(ctx, text || 'Texto', x1, y1, w * 0.4, a.color, font) });
    }

    if (a.id === selectedId) {
      ctx.shadowColor = 'transparent';
      ctx.setLineDash([stroke * 2, stroke * 1.5]);
      ctx.lineWidth = Math.max(1, stroke / 2);
      ctx.strokeStyle = '#FFFFFF';
      const pad = stroke * 2;
      const b = a.kind === 'text' ? hits.at(-1)!.box! : box;
      if (a.kind !== 'arrow') ctx.strokeRect(b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2);
      ctx.setLineDash([]);
      // Manijas para estirar (extremos de la flecha o esquinas opuestas)
      if (a.kind !== 'text') {
        for (const [hx, hy] of [[x1, y1], [x2, y2]]) {
          ctx.fillStyle = '#FFFFFF';
          ctx.strokeStyle = '#0078D4';
          ctx.lineWidth = Math.max(1, stroke / 2);
          ctx.beginPath();
          ctx.arc(hx, hy, handleRadius(w, h), 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }
  return hits;
}

export const handleRadius = (w: number, h: number) => Math.max(6, Math.max(w, h) * 0.009);

/** Figura bajo el punto (px, py) del lienzo; la última dibujada queda encima. */
export function hitTest(hits: HitArea[], px: number, py: number, tolerance: number) {
  for (let i = hits.length - 1; i >= 0; i--) {
    const { box, seg } = hits[i];
    if (box && px >= box.x - tolerance && px <= box.x + box.w + tolerance && py >= box.y - tolerance && py <= box.y + box.h + tolerance) {
      // Rectángulo/círculo grandes: solo cerca del borde, para poder dibujar otra figura dentro
      if ((hits[i].kind === 'rect' || hits[i].kind === 'ellipse') && box.w > tolerance * 4 && box.h > tolerance * 4
        && px > box.x + tolerance && px < box.x + box.w - tolerance && py > box.y + tolerance && py < box.y + box.h - tolerance) continue;
      return hits[i].id;
    }
    if (seg) {
      const [x1, y1, x2, y2] = seg;
      const len2 = (x2 - x1) ** 2 + (y2 - y1) ** 2 || 1;
      const t = Math.max(0, Math.min(1, ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / len2));
      if (Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1))) <= tolerance) return hits[i].id;
    }
  }
  return null;
}

/** Foto con sus anotaciones en un lienzo nuevo, con el lado mayor entre minPx y maxPx
 *  (las fotos pequeñas se amplían para que el texto de las figuras salga nítido). */
export function renderAnnotated(img: CanvasImageSource & { width: number; height: number }, list: Annotation[], maxPx = Infinity, minPx = 0) {
  const long = Math.max(img.width, img.height);
  const scale = Math.min(maxPx, Math.max(minPx, long)) / long;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  drawAnnotations(ctx, list);
  return canvas;
}
