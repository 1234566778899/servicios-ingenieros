import { useEffect, useRef, useState, type ReactElement } from 'react';
import {
  Button, Caption1, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Field, Input, Spinner,
  Toolbar, ToolbarButton, ToolbarDivider, ToolbarRadioButton, ToolbarRadioGroup, Tooltip, tokens,
} from '@fluentui/react-components';
import {
  ArrowDownRight20Regular, ArrowUndo20Regular, Circle20Regular, Cursor20Regular, Delete20Regular, Dismiss20Regular,
  Eraser20Regular, RectangleLandscape20Regular, Save20Regular, TextT20Regular,
} from '@fluentui/react-icons';
import { signedUrl } from '../lib/services';
import { ANNOTATION_COLORS, drawAnnotations, handleRadius, hitTest, type Annotation, type HitArea, type ShapeKind } from '../lib/annotations';

type Tool = 'select' | ShapeKind;

const TOOLS: { id: Tool; label: string; icon: ReactElement }[] = [
  { id: 'select', label: 'Seleccionar y mover', icon: <Cursor20Regular /> },
  { id: 'arrow', label: 'Flecha', icon: <ArrowDownRight20Regular /> },
  { id: 'rect', label: 'Rectángulo', icon: <RectangleLandscape20Regular /> },
  { id: 'ellipse', label: 'Círculo', icon: <Circle20Regular /> },
  { id: 'text', label: 'Texto', icon: <TextT20Regular /> },
];

/** Lado mayor del lienzo de edición; las coordenadas se guardan relativas, así que no afecta al informe. */
const MAX_PX = 1600;
const clamp = (v: number) => Math.min(1, Math.max(0, v));

type Drag = { mode: 'move' | 'p1' | 'p2'; id: string; start: [number, number]; orig: Annotation; created: boolean };

/** Editor de anotaciones: flechas, rectángulos, círculos y textos sobre la foto (la original no se modifica). */
export function PhotoAnnotator({ path, initial, onSave, onClose }: {
  path: string; initial: Annotation[];
  onSave: (annotations: Annotation[]) => Promise<void>; onClose: () => void;
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [list, setList] = useState<Annotation[]>(initial);
  const [history, setHistory] = useState<Annotation[][]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('arrow');
  const [color, setColor] = useState(ANNOTATION_COLORS[0].id);
  const [busy, setBusy] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const hits = useRef<HitArea[]>([]);
  const drag = useRef<Drag | null>(null);
  const textRef = useRef<HTMLInputElement>(null);
  const sel = list.find((a) => a.id === selected);

  useEffect(() => {
    let live = true;
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
    const scale = Math.min(1, MAX_PX / Math.max(img.naturalWidth, img.naturalHeight));
    if (c.width !== Math.round(img.naturalWidth * scale)) {
      c.width = Math.round(img.naturalWidth * scale);
      c.height = Math.round(img.naturalHeight * scale);
    }
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    hits.current = drawAnnotations(ctx, list, selected);
  }, [img, list, selected]);

  const commit = () => setHistory((h) => [...h.slice(-30), list]);
  const patch = (id: string, p: Partial<Annotation>) => setList((xs) => xs.map((a) => (a.id === id ? { ...a, ...p } : a)));
  const removeSelected = () => {
    if (!selected) return;
    commit();
    setList((xs) => xs.filter((a) => a.id !== selected));
    setSelected(null);
  };
  const undo = () => {
    const prev = history.at(-1);
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    setList(prev);
    if (!prev.some((a) => a.id === selected)) setSelected(null);
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
          drag.current = { mode, id: sel.id, start: [rx, ry], orig: sel, created: false };
          return;
        }
      }
    }
    const hit = hitTest(hits.current, px, py, tol);
    if (hit) {
      commit();
      setSelected(hit);
      drag.current = { mode: 'move', id: hit, start: [rx, ry], orig: list.find((a) => a.id === hit)!, created: false };
      return;
    }
    if (tool === 'select') return setSelected(null);
    commit();
    const a: Annotation = { id: crypto.randomUUID(), kind: tool, x1: rx, y1: ry, x2: rx, y2: ry, color, text: '' };
    setList((xs) => [...xs, a]);
    setSelected(a.id);
    if (tool === 'text') {
      setTimeout(() => textRef.current?.focus(), 0);
      return;
    }
    drag.current = { mode: 'p2', id: a.id, start: [rx, ry], orig: a, created: true };
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d) return;
    const { rx, ry } = point(e);
    const o = d.orig;
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
    if (!d?.created) return;
    const a = list.find((x) => x.id === d.id);
    // Un clic sin arrastrar crea la figura con un tamaño por defecto (la flecha apunta al punto)
    if (a && Math.abs(a.x2 - a.x1) < 0.015 && Math.abs(a.y2 - a.y1) < 0.015) {
      if (a.kind === 'arrow') patch(a.id, { x1: clamp(a.x2 - 0.15), y1: clamp(a.y2 - 0.15) });
      else patch(a.id, { x1: clamp(a.x1 - 0.1), y1: clamp(a.y1 - 0.08), x2: clamp(a.x1 + 0.1), y2: clamp(a.y1 + 0.08) });
    }
    setTimeout(() => textRef.current?.focus(), 0);
  };

  const save = async () => {
    setBusy(true);
    try {
      // Los textos sueltos vacíos no aportan nada
      await onSave(list.filter((a) => a.kind !== 'text' || a.text.trim()));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface style={{ maxWidth: 1100, width: '96vw' }}>
        <DialogBody>
          <DialogTitle action={<Button appearance="subtle" icon={<Dismiss20Regular />} aria-label="Cerrar" onClick={onClose} />}>
            Editar imagen
          </DialogTitle>
          <DialogContent>
            <Toolbar aria-label="Herramientas de edición" checkedValues={{ tool: [tool], color: [color] }} style={{ flexWrap: 'wrap', padding: 0 }}
              onCheckedValueChange={(_, d) => {
                const v = d.checkedItems[0];
                if (d.name === 'tool') setTool(v as Tool);
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
                {ANNOTATION_COLORS.map((c) => (
                  <Tooltip key={c.id} content={c.label} relationship="label">
                    <ToolbarRadioButton name="color" value={c.id} appearance="subtle"
                      icon={<span style={{
                        width: 16, height: 16, borderRadius: '50%', background: c.id, display: 'block',
                        boxShadow: `0 0 0 1px ${tokens.colorNeutralStroke1}`,
                      }} />} />
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
              <Tooltip content="Quitar todas las figuras" relationship="label">
                <ToolbarButton icon={<Eraser20Regular />} disabled={!list.length}
                  onClick={() => { commit(); setList([]); setSelected(null); }} />
              </Tooltip>
            </Toolbar>

            <div tabIndex={0} style={{ marginTop: 8, display: 'flex', justifyContent: 'center', background: tokens.colorNeutralBackground3, borderRadius: tokens.borderRadiusMedium, outline: 'none' }}
              onKeyDown={(e) => { if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSelected(); } }}>
              {!img && <Spinner style={{ height: '50vh' }} label="Cargando foto…" />}
              <canvas ref={canvas} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
                style={{
                  display: img ? 'block' : 'none', maxWidth: '100%', maxHeight: '58vh', touchAction: 'none',
                  cursor: tool === 'select' ? 'default' : 'crosshair',
                }} />
            </div>

            <Field style={{ marginTop: 12 }} label="Texto de la figura seleccionada"
              hint={sel ? undefined : 'Elige una herramienta y dibuja sobre la foto (arrastra), o haz clic en una figura para editarla.'}>
              <Input ref={textRef} disabled={!sel} value={sel?.text ?? ''} placeholder={sel ? 'Ej.: Fuga de refrigerante' : ''}
                onChange={(_, d) => selected && patch(selected, { text: d.value })} />
            </Field>
            <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>
              La flecha muestra el texto en su inicio; el rectángulo y el círculo, en su centro. Las figuras aparecen en el informe.
            </Caption1>
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose}>Cancelar</Button>
            <Button appearance="primary" icon={<Save20Regular />} disabled={busy || !img} onClick={save}>Guardar edición</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
