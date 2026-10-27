import { useEffect, useRef, useState, type ReactElement } from 'react';
import {
  Caption1, Input, Spinner, Toolbar, ToolbarButton, ToolbarDivider, ToolbarRadioButton, ToolbarRadioGroup, Tooltip, tokens,
} from '@fluentui/react-components';
import {
  ArrowDownRight20Regular, ArrowUndo20Regular, Circle20Regular, Delete20Regular, RectangleLandscape20Regular, TextT20Regular,
} from '@fluentui/react-icons';
import { signedUrl } from '../lib/services';
import { ANNOTATION_COLORS, drawAnnotations, handleRadius, hitTest, type Annotation, type HitArea, type ShapeKind } from '../lib/annotations';

const TOOLS: { id: ShapeKind; label: string; icon: ReactElement }[] = [
  { id: 'arrow', label: 'Flecha', icon: <ArrowDownRight20Regular /> },
  { id: 'rect', label: 'Rectángulo', icon: <RectangleLandscape20Regular /> },
  { id: 'ellipse', label: 'Círculo', icon: <Circle20Regular /> },
  { id: 'text', label: 'Texto', icon: <TextT20Regular /> },
];

/** Lado mayor del lienzo: las fotos pequeñas se amplían para que las figuras se vean nítidas.
 *  Las coordenadas se guardan relativas, así que no afecta al informe. */
const MIN_PX = 1200;
const MAX_PX = 1600;
const clamp = (v: number) => Math.min(1, Math.max(0, v));
/** Dónde va el texto de cada figura (relativo): inicio de la flecha, centro del rectángulo/círculo */
const labelAt = (a: Annotation): [number, number] =>
  a.kind === 'rect' || a.kind === 'ellipse' ? [(a.x1 + a.x2) / 2, (a.y1 + a.y2) / 2] : [a.x1, a.y1];

type Drag = { mode: 'move' | 'p1' | 'p2'; id: string; start: [number, number]; orig: Annotation; created: boolean; moved: boolean };

/** Foto con figuras (flechas, rectángulos, círculos y textos) dibujadas encima. El texto se escribe sobre la misma foto. */
export function PhotoEditor({ path, value, onChange, readOnly }: {
  path: string; value: Annotation[]; onChange: (list: Annotation[]) => void; readOnly?: boolean;
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [history, setHistory] = useState<Annotation[][]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [typing, setTyping] = useState<string | null>(null);
  const [tool, setTool] = useState<ShapeKind>('arrow');
  const [color, setColor] = useState(ANNOTATION_COLORS[0].id);
  const canvas = useRef<HTMLCanvasElement>(null);
  const hits = useRef<HitArea[]>([]);
  const drag = useRef<Drag | null>(null);
  const list = value;
  // Lista más reciente: varios eventos seguidos (soltar, perder foco) no deben pisarse entre sí
  const latest = useRef(list);
  latest.current = list;
  const set = (next: Annotation[]) => { latest.current = next; onChange(next); };
  const sel = list.find((a) => a.id === selected);
  const typed = list.find((a) => a.id === typing);

  useEffect(() => {
    let live = true;
    setImg(null);
    signedUrl('photos', path).then((u) => {
      const el = new window.Image();
      el.onload = () => live && setImg(el);
      el.src = u;
    }).catch(() => {});
    return () => { live = false; };
  }, [path]);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !img) return;
    const long = Math.max(img.naturalWidth, img.naturalHeight);
    const scale = Math.min(MAX_PX, Math.max(MIN_PX, long)) / long;
    if (c.width !== Math.round(img.naturalWidth * scale)) {
      c.width = Math.round(img.naturalWidth * scale);
      c.height = Math.round(img.naturalHeight * scale);
    }
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    // Mientras se escribe, el texto lo muestra el cuadro de edición
    hits.current = drawAnnotations(ctx, list.map((a) => (a.id === typing ? { ...a, text: '' } : a)), readOnly ? null : selected);
  }, [img, list, selected, typing, readOnly]);

  const commit = () => setHistory((h) => [...h.slice(-30), list]);
  const patch = (id: string, p: Partial<Annotation>) => set(latest.current.map((a) => (a.id === id ? { ...a, ...p } : a)));
  const removeSelected = () => {
    if (!selected) return;
    commit();
    set(latest.current.filter((a) => a.id !== selected));
    setSelected(null);
    setTyping(null);
  };
  const undo = () => {
    const prev = history.at(-1);
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    set(prev);
    setTyping(null);
    if (!prev.some((a) => a.id === selected)) setSelected(null);
  };
  /** Termina de escribir: un texto suelto vacío no sirve y se quita */
  const stopTyping = () => {
    const t = latest.current.find((a) => a.id === typing);
    if (t?.kind === 'text' && !t.text.trim()) {
      set(latest.current.filter((a) => a.id !== t.id));
      setSelected(null);
    }
    setTyping(null);
  };

  /** Punto del puntero en píxeles del lienzo y relativo (0–1); tol = 10 px de pantalla */
  const point = (e: React.PointerEvent) => {
    const c = canvas.current!;
    const r = c.getBoundingClientRect();
    const px = ((e.clientX - r.left) * c.width) / r.width;
    const py = ((e.clientY - r.top) * c.height) / r.height;
    return { px, py, rx: clamp(px / c.width), ry: clamp(py / c.height), tol: (10 * c.width) / r.width };
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (readOnly) return;
    if (typing) stopTyping();
    const c = canvas.current!;
    const { px, py, rx, ry, tol } = point(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    // Manijas de la figura seleccionada
    if (sel && sel.kind !== 'text') {
      const rad = handleRadius(c.width, c.height) + tol;
      for (const mode of ['p1', 'p2'] as const) {
        const [hx, hy] = mode === 'p1' ? [sel.x1 * c.width, sel.y1 * c.height] : [sel.x2 * c.width, sel.y2 * c.height];
        if (Math.hypot(px - hx, py - hy) <= rad) {
          commit();
          drag.current = { mode, id: sel.id, start: [rx, ry], orig: sel, created: false, moved: false };
          return;
        }
      }
    }
    const hit = hitTest(hits.current, px, py, tol);
    if (hit) {
      commit();
      setSelected(hit);
      drag.current = { mode: 'move', id: hit, start: [rx, ry], orig: latest.current.find((a) => a.id === hit)!, created: false, moved: false };
      return;
    }
    commit();
    const a: Annotation = { id: crypto.randomUUID(), kind: tool, x1: rx, y1: ry, x2: rx, y2: ry, color, text: '' };
    set([...latest.current, a]);
    setSelected(a.id);
    if (tool === 'text') return setTyping(a.id);
    drag.current = { mode: 'p2', id: a.id, start: [rx, ry], orig: a, created: true, moved: false };
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d) return;
    const { rx, ry } = point(e);
    const o = d.orig;
    d.moved = true;
    if (d.mode === 'p1') patch(d.id, { x1: rx, y1: ry });
    else if (d.mode === 'p2') patch(d.id, { x2: rx, y2: ry });
    else {
      // Mover sin que la figura salga de la imagen
      const dx = Math.min(Math.max(rx - d.start[0], -Math.min(o.x1, o.x2)), 1 - Math.max(o.x1, o.x2));
      const dy = Math.min(Math.max(ry - d.start[1], -Math.min(o.y1, o.y2)), 1 - Math.max(o.y1, o.y2));
      patch(d.id, { x1: o.x1 + dx, y1: o.y1 + dy, x2: o.x2 + dx, y2: o.y2 + dy });
    }
  };

  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    // Un clic (sin arrastrar) sobre una figura abre su texto para escribir o corregir
    if (!d.created) {
      if (!d.moved) setTyping(d.id);
      return;
    }
    const a = latest.current.find((x) => x.id === d.id);
    // Un clic sin arrastrar crea la figura con un tamaño por defecto (la flecha apunta al punto)
    if (a && Math.abs(a.x2 - a.x1) < 0.015 && Math.abs(a.y2 - a.y1) < 0.015) {
      if (a.kind === 'arrow') patch(a.id, { x1: clamp(a.x2 - 0.15), y1: clamp(a.y2 - 0.15) });
      else patch(a.id, { x1: clamp(a.x1 - 0.1), y1: clamp(a.y1 - 0.08), x2: clamp(a.x1 + 0.1), y2: clamp(a.y1 + 0.08) });
    }
    setTyping(d.id);
  };

  const c = canvas.current;
  const at = typed && c ? labelAt(typed) : null;

  return (
    <div>
      {!readOnly && (
        <Toolbar aria-label="Dibujar sobre la foto" size="small" checkedValues={{ tool: [tool], color: [color] }} style={{ flexWrap: 'wrap', padding: 0, marginBottom: 6 }}
          onCheckedValueChange={(_, d) => {
            const v = d.checkedItems[0];
            if (d.name === 'tool') setTool(v as ShapeKind);
            if (d.name === 'color') {
              setColor(v);
              if (selected) { commit(); patch(selected, { color: v }); }
            }
          }}>
          <ToolbarRadioGroup>
            {TOOLS.map((t) => (
              <Tooltip key={t.id} content={t.label} relationship="label">
                <ToolbarRadioButton name="tool" value={t.id} icon={t.icon} appearance="subtle" />
              </Tooltip>
            ))}
          </ToolbarRadioGroup>
          <ToolbarDivider />
          <ToolbarRadioGroup>
            {ANNOTATION_COLORS.map((x) => (
              <Tooltip key={x.id} content={x.label} relationship="label">
                <ToolbarRadioButton name="color" value={x.id} appearance="subtle"
                  icon={<span style={{ width: 16, height: 16, borderRadius: '50%', background: x.id, display: 'block', boxShadow: `0 0 0 1px ${tokens.colorNeutralStroke1}` }} />} />
              </Tooltip>
            ))}
          </ToolbarRadioGroup>
          <ToolbarDivider />
          <Tooltip content="Deshacer" relationship="label">
            <ToolbarButton icon={<ArrowUndo20Regular />} disabled={!history.length} onClick={undo} />
          </Tooltip>
          <Tooltip content="Quitar figura seleccionada" relationship="label">
            <ToolbarButton icon={<Delete20Regular />} disabled={!selected} onClick={removeSelected} />
          </Tooltip>
        </Toolbar>
      )}

      <div tabIndex={readOnly ? undefined : 0}
        style={{ position: 'relative', display: 'flex', justifyContent: 'center', background: tokens.colorNeutralBackground3, borderRadius: tokens.borderRadiusMedium, outline: 'none' }}
        onKeyDown={(e) => { if (!typing && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); removeSelected(); } }}>
        {!img && <Spinner style={{ height: '50vh' }} label="Cargando foto…" />}
        <canvas ref={canvas} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
          style={{
            // Ocupa todo el espacio disponible (55 % de la altura de la pantalla) sin deformarse, aunque la foto sea pequeña
            display: img ? 'block' : 'none', aspectRatio: img ? `${img.naturalWidth} / ${img.naturalHeight}` : undefined,
            width: img ? `min(100%, calc(55vh * ${img.naturalWidth / img.naturalHeight}))` : undefined, height: 'auto',
            touchAction: 'none', cursor: readOnly ? 'default' : 'crosshair',
          }} />
        {typed && at && c && (
          <Input autoFocus size="small" value={typed.text} placeholder="Escribe el texto (opcional)" aria-label="Texto de la figura"
            style={{
              position: 'absolute', width: 220, maxWidth: '80%', transform: 'translate(-50%, -50%)',
              left: c.offsetLeft + at[0] * c.clientWidth, top: c.offsetTop + at[1] * c.clientHeight,
            }}
            onChange={(_, d) => patch(typed.id, { text: d.value })}
            onBlur={stopTyping}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopTyping(); } }} />
        )}
      </div>
      {!readOnly && (
        <Caption1 block style={{ color: tokens.colorNeutralForeground3, marginTop: 4 }}>
          Elige una figura y arrastra sobre la foto; luego escribe su texto. Haz clic en una figura para moverla o cambiar su texto.
        </Caption1>
      )}
    </div>
  );
}
