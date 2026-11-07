import { useEffect, useRef, useState } from 'react';
import { clampScale } from '../report/model';

/** Vista previa del informe (HTML en un iframe). Si es editable, cada foto muestra al pasar el ratón un tirador
 *  en la esquina inferior derecha: arrastrándolo cambia el tamaño (sin deformarla), como en Word; doble clic
 *  en el tirador la deja en el tamaño automático. Al soltar llama a `onScale` con la nueva escala.
 *  Arrastrando la foto misma y soltándola sobre otra del mismo grupo (`data-grp`: misma sección u etapa y
 *  misma orientación) se intercambian: llama a `onSwap`.
 *  Sin parpadeo: cada versión nueva se carga en un segundo iframe oculto y se muestra cuando ya está lista
 *  (en la misma posición de desplazamiento); el anterior queda debajo hasta entonces.
 *  El iframe no ejecuta scripts: los eventos se escuchan desde aquí (sandbox con allow-same-origin). */
export function ReportPreview({ html, editable, onScale, onSwap, className }: {
  html: string; editable: boolean; onScale: (photoId: string, scale: number) => void;
  onSwap?: (a: string, b: string) => void; className?: string;
}) {
  const frames = [useRef<HTMLIFrameElement>(null), useRef<HTMLIFrameElement>(null)];
  // Cada carga lleva un número de versión: el mismo HTML (p. ej. al deshacer un intercambio) también se recarga,
  // así nunca se muestra un documento con restos de la animación anterior
  const [docs, setDocs] = useState<[{ html: string; v: number }, { html: string; v: number }]>([{ html, v: 0 }, { html: '', v: 0 }]);
  const [active, setActive] = useState(0);
  const activeRef = useRef(0);
  activeRef.current = active;
  const version = useRef(0);
  const scrollTop = useRef(0);
  const latest = useRef(html);
  latest.current = html;
  const onScaleRef = useRef(onScale);
  onScaleRef.current = onScale;
  const onSwapRef = useRef(onSwap);
  onSwapRef.current = onSwap;

  // HTML nuevo → al iframe oculto
  useEffect(() => {
    if (html === docs[active].html && version.current === docs[active].v) return;
    const next = 1 - active;
    const doc = { html, v: ++version.current };
    setDocs((d) => (next === 0 ? [doc, d[1]] : [d[0], doc]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html]);

  const onLoad = (i: number) => {
    const win = frames[i].current?.contentWindow;
    const doc = frames[i].current?.contentDocument;
    // Solo si es la versión vigente (pudo llegar otra mientras cargaba)
    if (!win || !doc || !docs[i].html || docs[i].html !== latest.current || docs[i].v !== version.current) return;
    win.scrollTo(0, scrollTop.current);
    win.addEventListener('scroll', () => { if (activeRef.current === i) scrollTop.current = win.scrollY; });
    if (editable) {
      attachResize(win, doc, (id, s) => onScaleRef.current(id, s));
      attachSwap(win, doc, (a, b) => onSwapRef.current?.(a, b));
    }
    setActive(i);
  };

  return (
    <div className={className} style={{ position: 'relative', overflow: 'hidden' }}>
      {[0, 1].map((i) => (
        <iframe key={i} ref={frames[i]} title={i === active ? 'Vista previa del informe' : 'Vista previa (cargando)'}
          srcDoc={docs[i].html && `${docs[i].html}<!-- v${docs[i].v} -->`} sandbox="allow-same-origin" onLoad={() => onLoad(i)} aria-hidden={i !== active}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0, background: 'transparent',
            visibility: i === active ? 'visible' : 'hidden', pointerEvents: i === active ? 'auto' : 'none',
          }} />
      ))}
    </div>
  );
}

const BLUE = '#0f6cbd';
const CSS = `
  img[data-photo]:hover, img.rz-on { outline: 2px solid ${BLUE}; outline-offset: 1px; }
  .rz-h { position: absolute; width: 14px; height: 14px; background: #fff; border: 2px solid ${BLUE}; border-radius: 3px;
          cursor: nwse-resize; z-index: 10; display: none; touch-action: none; box-sizing: border-box; }
  .rz-t { position: absolute; z-index: 10; display: none; pointer-events: none; background: ${BLUE}; color: #fff;
          font: 600 12px 'Segoe UI', system-ui, sans-serif; padding: 2px 6px; border-radius: 4px; white-space: nowrap; }
  body.rz-drag, body.rz-drag * { cursor: nwse-resize !important; user-select: none; }
  img[data-grp]:not([data-grp=""]) { cursor: grab; }
  body.sw-drag, body.sw-drag * { cursor: grabbing !important; user-select: none; }
  body.sw-drag.sw-no, body.sw-drag.sw-no * { cursor: not-allowed !important; }
  img.sw-src { opacity: .2; outline: 2px dashed #8a8886 !important; outline-offset: 2px; }
  img[data-photo] { transition: transform .15s ease, opacity .15s ease; }
  img.sw-ok { outline: 3px solid #107c10 !important; outline-offset: 2px; transform: scale(1.04); }
  .sw-ghost { position: fixed; z-index: 20; pointer-events: none; border-radius: 3px; object-fit: contain;
              box-shadow: 0 10px 28px rgba(0,0,0,.35); opacity: .92; transform: rotate(-2deg); }
  .sw-fly { position: fixed; z-index: 19; pointer-events: none; object-fit: contain; box-shadow: 0 6px 18px rgba(0,0,0,.25); }
  .sw-anim { transition: left .25s cubic-bezier(.2,.8,.2,1), top .25s cubic-bezier(.2,.8,.2,1), width .25s cubic-bezier(.2,.8,.2,1),
             height .25s cubic-bezier(.2,.8,.2,1), transform .25s ease, opacity .25s ease; }
  .sw-t { position: fixed; z-index: 21; pointer-events: none; background: #242424; color: #fff; display: none;
          font: 600 12px 'Segoe UI', system-ui, sans-serif; padding: 3px 8px; border-radius: 4px; white-space: nowrap; }
`;

const MS = 260;
// Los temporizadores van en la ventana de la app: el iframe (sandbox sin scripts) no ejecuta los suyos

/** Arrastrar una foto sobre otra del mismo grupo las intercambia. Se activa al mover más de 6 px (un clic no hace nada).
 *  Mientras se arrastra, una copia de la foto sigue al cursor; al soltar, las dos se deslizan a su nuevo lugar
 *  y recién entonces se guarda el cambio (la vista previa se vuelve a dibujar con el nuevo orden). */
function attachSwap(win: Window, doc: Document, commit: (a: string, b: string) => void) {
  const tip = doc.createElement('div');
  tip.className = 'sw-t';
  doc.body.append(tip);
  type Drag = {
    img: HTMLImageElement; x: number; y: number; on: boolean; target: HTMLImageElement | null;
    ghost?: HTMLImageElement; gw: number; gh: number; ox: number; oy: number;
  };
  let drag: Drag | null = null;
  let busy = false;

  const box = (el: HTMLElement, r: { left: number; top: number; width: number; height: number }) => {
    el.style.left = `${r.left}px`;
    el.style.top = `${r.top}px`;
    el.style.width = `${r.width}px`;
    el.style.height = `${r.height}px`;
  };
  const reset = () => {
    doc.querySelectorAll('img.sw-ok, img.sw-src').forEach((x) => x.classList.remove('sw-ok', 'sw-src'));
    doc.body.classList.remove('sw-drag', 'sw-no');
    tip.style.display = 'none';
  };

  doc.addEventListener('pointerdown', (e) => {
    const t = e.target as HTMLElement;
    if (busy || e.button !== 0 || t.tagName !== 'IMG' || !t.dataset.photo || !t.dataset.grp) return;
    e.preventDefault(); // sin el arrastre nativo de imágenes del navegador
    const r = t.getBoundingClientRect();
    // La copia que sigue al cursor es algo más chica (como mucho 220 px de ancho) y se toma del mismo punto
    const k = Math.min(1, 220 / r.width);
    drag = {
      img: t as HTMLImageElement, x: e.clientX, y: e.clientY, on: false, target: null,
      gw: r.width * k, gh: r.height * k, ox: (e.clientX - r.left) * k, oy: (e.clientY - r.top) * k,
    };
  });

  doc.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (!drag.on) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
      drag.on = true;
      const ghost = drag.img.cloneNode() as HTMLImageElement;
      ghost.removeAttribute('data-photo');
      ghost.removeAttribute('data-grp');
      ghost.className = 'sw-ghost';
      ghost.style.cssText = '';
      doc.body.append(ghost);
      drag.ghost = ghost;
      drag.img.classList.add('sw-src');
      doc.body.classList.add('sw-drag');
      // El tirador de tamaño no debe quedar encima mientras se arrastra
      doc.querySelectorAll<HTMLElement>('.rz-h, .rz-t').forEach((x) => { x.style.display = 'none'; });
    }
    box(drag.ghost!, { left: e.clientX - drag.ox, top: e.clientY - drag.oy, width: drag.gw, height: drag.gh });
    const over = doc.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const img = over?.tagName === 'IMG' && over.dataset.photo && over !== drag.img ? (over as HTMLImageElement) : null;
    const ok = !!img && img.dataset.grp === drag.img.dataset.grp;
    if (drag.target !== (ok ? img : null)) {
      drag.target?.classList.remove('sw-ok');
      drag.target = ok ? img : null;
      drag.target?.classList.add('sw-ok');
    }
    doc.body.classList.toggle('sw-no', !!img && !ok);
    tip.textContent = ok ? 'Soltar para intercambiar' : img ? 'Solo con fotos de la misma sección y orientación' : 'Suelta sobre otra foto';
    tip.style.left = `${e.clientX + 14}px`;
    tip.style.top = `${e.clientY + 18}px`;
    tip.style.display = 'block';
  });

  const end = () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (!d.on || !d.ghost) return reset();
    const ghost = d.ghost;
    const src = d.img.getBoundingClientRect();
    tip.style.display = 'none';
    doc.body.classList.remove('sw-no');
    busy = true;
    ghost.classList.add('sw-anim');
    void ghost.offsetWidth; // aplica la posición actual antes de animar

    if (!d.target) {
      // Sin destino válido: la foto vuelve a su lugar
      box(ghost, src);
      ghost.style.transform = 'none';
      window.setTimeout(() => { ghost.remove(); reset(); busy = false; }, MS);
      return;
    }
    // Intercambio: la arrastrada vuela al lugar de la otra y la otra al lugar de la arrastrada
    const target = d.target;
    const dst = target.getBoundingClientRect();
    target.classList.remove('sw-ok');
    const fly = target.cloneNode() as HTMLImageElement;
    fly.removeAttribute('data-photo');
    fly.removeAttribute('data-grp');
    fly.className = 'sw-fly sw-anim';
    fly.style.cssText = '';
    box(fly, dst);
    doc.body.append(fly);
    target.style.opacity = '0';
    d.img.style.opacity = '0';
    void fly.offsetWidth;
    box(ghost, dst);
    ghost.style.transform = 'none';
    ghost.style.boxShadow = 'none';
    box(fly, src);
    // Al guardar, la vista previa se vuelve a dibujar con el nuevo orden (y desaparecen estas copias)
    window.setTimeout(() => { busy = false; commit(d.img.dataset.photo!, target.dataset.photo!); }, MS + 20);
  };
  doc.addEventListener('pointerup', end);
  doc.addEventListener('pointercancel', end);
  win.addEventListener('blur', end);
}

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
    if (drag || doc.body.classList.contains('sw-drag')) return;
    const t = e.target as HTMLElement;
    if (t.tagName === 'IMG' && t.dataset.photo) {
      if (cur !== t) cur?.classList.remove('rz-on');
      cur = t as HTMLImageElement;
      cur.classList.add('rz-on');
      // El porcentaje solo se muestra mientras se cambia el tamaño, no al pasar el ratón
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
    tip.textContent = pct(s0);
    tip.style.display = 'block';
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
    tip.style.display = 'none';
    if (s !== s0) commit(img.dataset.photo!, s);
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
  handle.addEventListener('dblclick', () => {
    if (cur && Number(cur.dataset.scale) !== 1) commit(cur.dataset.photo!, 1);
  });
}
