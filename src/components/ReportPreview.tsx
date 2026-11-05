import { useRef } from 'react';
import { clampScale } from '../report/model';

/** Vista previa del informe (HTML en un iframe). Si es editable, cada foto muestra al pasar el ratón un tirador
 *  en la esquina inferior derecha: arrastrándolo cambia el tamaño (sin deformarla), como en Word; doble clic
 *  en el tirador la deja en el tamaño automático. Al soltar llama a `onScale` con la nueva escala.
 *  El iframe no ejecuta scripts: los eventos se escuchan desde aquí (sandbox con allow-same-origin). */
export function ReportPreview({ html, editable, onScale, className }: {
  html: string; editable: boolean; onScale: (photoId: string, scale: number) => void; className?: string;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const scrollTop = useRef(0);
  const onScaleRef = useRef(onScale);
  onScaleRef.current = onScale;

  const onLoad = () => {
    const win = frame.current?.contentWindow;
    const doc = frame.current?.contentDocument;
    if (!win || !doc) return;
    // Al cambiar un tamaño el HTML se vuelve a cargar: se conserva la posición
    win.scrollTo(0, scrollTop.current);
    win.addEventListener('scroll', () => { scrollTop.current = win.scrollY; });
    if (editable) attachResize(win, doc, (id, s) => onScaleRef.current(id, s));
  };

  return <iframe ref={frame} className={className} title="Vista previa del informe" srcDoc={html} sandbox="allow-same-origin" onLoad={onLoad} />;
}

const BLUE = '#0f6cbd';
const CSS = `
  img[data-photo]:hover, img.rz-on { outline: 2px solid ${BLUE}; outline-offset: 1px; }
  .rz-h { position: absolute; width: 14px; height: 14px; background: #fff; border: 2px solid ${BLUE}; border-radius: 3px;
          cursor: nwse-resize; z-index: 10; display: none; touch-action: none; box-sizing: border-box; }
  .rz-t { position: absolute; z-index: 10; display: none; pointer-events: none; background: ${BLUE}; color: #fff;
          font: 600 12px 'Segoe UI', system-ui, sans-serif; padding: 2px 6px; border-radius: 4px; white-space: nowrap; }
  body.rz-drag, body.rz-drag * { cursor: nwse-resize !important; user-select: none; }
`;

function attachResize(win: Window, doc: Document, commit: (id: string, scale: number) => void) {
  const style = doc.createElement('style');
  style.textContent = CSS;
  doc.head.appendChild(style);
  const handle = doc.createElement('div');
  handle.className = 'rz-h';
  handle.title = 'Arrastra para cambiar el tamaño · Doble clic: tamaño automático';
  const tip = doc.createElement('div');
  tip.className = 'rz-t';
  doc.body.append(handle, tip);

  let cur: HTMLImageElement | null = null;
  let drag: { img: HTMLImageElement; x: number; y: number; w: number; h: number; s0: number; s: number } | null = null;

  const pct = (s: number) => `${Math.round(s * 100)} %`;
  const place = () => {
    if (!cur) return;
    const r = cur.getBoundingClientRect();
    handle.style.left = `${r.right + win.scrollX - 8}px`;
    handle.style.top = `${r.bottom + win.scrollY - 8}px`;
    handle.style.display = 'block';
    tip.style.left = `${r.left + win.scrollX + 4}px`;
    tip.style.top = `${r.top + win.scrollY + 4}px`;
  };
  const hide = () => {
    cur?.classList.remove('rz-on');
    cur = null;
    handle.style.display = 'none';
    tip.style.display = 'none';
  };

  doc.addEventListener('mouseover', (e) => {
    if (drag) return;
    const t = e.target as HTMLElement;
    if (t.tagName === 'IMG' && t.dataset.photo) {
      if (cur !== t) cur?.classList.remove('rz-on');
      cur = t as HTMLImageElement;
      cur.classList.add('rz-on');
      tip.textContent = pct(Number(cur.dataset.scale) || 1);
      tip.style.display = 'block';
      place();
    } else if (t !== handle) hide();
  });
  doc.addEventListener('mouseleave', () => { if (!drag) hide(); });

  handle.addEventListener('pointerdown', (e) => {
    if (!cur || e.button !== 0) return;
    e.preventDefault();
    const r = cur.getBoundingClientRect();
    const s0 = Number(cur.dataset.scale) || 1;
    drag = { img: cur, x: e.clientX, y: e.clientY, w: r.width, h: r.height, s0, s: s0 };
    handle.setPointerCapture(e.pointerId);
    doc.body.classList.add('rz-drag');
  });
  handle.addEventListener('pointermove', (e) => {
    if (!drag) return;
    // Proporción constante: se promedia lo que se movió en horizontal y en vertical
    const ratio = ((drag.w + e.clientX - drag.x) / drag.w + (drag.h + e.clientY - drag.y) / drag.h) / 2;
    drag.s = clampScale(drag.s0 * ratio);
    const k = drag.s / drag.s0;
    const { img } = drag;
    img.style.width = `${drag.w * k}px`;
    img.style.height = `${drag.h * k}px`;
    // En las filas de fotos la caja acompaña a la foto
    const box = img.parentElement?.classList.contains('box') ? img.parentElement : null;
    if (box) {
      box.style.height = `${drag.h * k}px`;
      (box.parentElement as HTMLElement).style.width = `${drag.w * k}px`;
    }
    tip.textContent = pct(drag.s);
    place();
  });
  const end = () => {
    if (!drag) return;
    const { img, s, s0 } = drag;
    drag = null;
    doc.body.classList.remove('rz-drag');
    if (s !== s0) commit(img.dataset.photo!, s);
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
  handle.addEventListener('dblclick', () => {
    if (cur && Number(cur.dataset.scale) !== 1) commit(cur.dataset.photo!, 1);
  });
}
