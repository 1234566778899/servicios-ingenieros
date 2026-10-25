import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Caption1, Combobox, Option, Textarea, makeStyles, tokens } from '@fluentui/react-components';
import { Add20Regular, ArrowDown16Regular, ArrowUp16Regular, Delete16Regular } from '@fluentui/react-icons';
import { supabase } from '../lib/supabase';
import { ImproveButton } from './ImproveWriting';
import type { Concept, ConceptKind } from '../lib/types';

const useStyles = makeStyles({
  list: { display: 'flex', flexDirection: 'column', gap: '6px' },
  row: { display: 'grid', gridTemplateColumns: '24px 1fr auto', gap: '6px', alignItems: 'start' },
  mark: { paddingTop: '6px', textAlign: 'right', color: tokens.colorNeutralForeground3 },
  tools: { display: 'flex', alignItems: 'center' },
  add: { display: 'flex', gap: '6px', alignItems: 'center', marginTop: '6px' },
  option: { whiteSpace: 'normal' },
});

// Una carga por tipo de concepto mientras la app esté abierta; se invalida al guardar o editar
const cache = new Map<ConceptKind, Promise<Concept[]>>();

export function invalidateConcepts(kind?: ConceptKind) {
  if (kind) cache.delete(kind);
  else cache.clear();
}

function fetchConcepts(kind: ConceptKind) {
  if (!cache.has(kind)) {
    cache.set(kind, Promise.resolve(
      supabase.from('concepts').select('*').eq('kind', kind).order('uses', { ascending: false }).limit(1000)
        .then(({ data }) => (data ?? []) as Concept[]),
    ));
  }
  return cache.get(kind)!;
}

export function useConcepts(kind: ConceptKind) {
  const [list, setList] = useState<Concept[]>([]);
  useEffect(() => {
    let live = true;
    fetchConcepts(kind).then((l) => live && setList(l));
    return () => { live = false; };
  }, [kind]);
  return list;
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Conceptos que contienen todas las palabras escritas; primero los de la especialidad y los más usados. */
export function matchConcepts(list: Concept[], query: string, specialty: string, exclude: string[] = [], max = 8) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  const skip = new Set(exclude.map((x) => fold(x.trim())));
  return list
    .filter((c) => !skip.has(fold(c.text)) && words.every((w) => fold(c.text).includes(w)))
    .sort((a, b) => Number(b.specialty === specialty) - Number(a.specialty === specialty) || b.uses - a.uses)
    .slice(0, max);
}

/** Campo de texto libre que sugiere conceptos guardados mientras se escribe. */
export function ConceptInput({ kind, specialty, value, onChange, onPick, placeholder, exclude, disabled, size }: {
  kind: ConceptKind; specialty: string; value: string; onChange: (v: string) => void;
  /** Al elegir una sugerencia (si no se pasa, la sugerencia reemplaza el texto) */
  onPick?: (v: string) => void;
  placeholder?: string; exclude?: string[]; disabled?: boolean; size?: 'small' | 'medium';
}) {
  const s = useStyles();
  const list = useConcepts(kind);
  const options = useMemo(() => matchConcepts(list, value, specialty, exclude), [list, value, specialty, exclude]);
  return (
    <Combobox
      freeform
      size={size}
      disabled={disabled}
      placeholder={placeholder}
      value={value}
      selectedOptions={[]}
      style={{ flex: 1, minWidth: 0 }}
      input={{ style: { width: '100%' } }}
      onChange={(e) => onChange(e.target.value)}
      onOptionSelect={(_, d) => {
        if (!d.optionText) return;
        if (onPick) onPick(d.optionText);
        else onChange(d.optionText);
      }}
    >
      {options.map((c) => (
        <Option key={c.id} value={c.id} text={c.text} className={s.option}>
          {c.text}
        </Option>
      ))}
    </Combobox>
  );
}

/**
 * Lista editable de textos (un párrafo por elemento) con sugerencias de conceptos para agregar.
 * Se usa para detalles previos, trabajos realizados, conclusiones, observaciones y recomendaciones.
 */
export function ConceptList({ kind, specialty, items, onChange, readOnly, placeholder, numbered, emptyText }: {
  kind: ConceptKind; specialty: string; items: string[]; onChange: (items: string[]) => void;
  readOnly?: boolean; placeholder?: string; numbered?: boolean; emptyText?: string;
}) {
  const s = useStyles();
  const [draft, setDraft] = useState('');
  // Enter sobre una sugerencia ya la agrega (onPick): el Enter que llega después no debe agregar el borrador
  const picked = useRef(false);

  const add = (text: string) => {
    const t = text.trim();
    if (!t) return;
    onChange([...items, t]);
    setDraft('');
  };
  const set = (i: number, v: string) => onChange(items.map((x, j) => (j === i ? v : x)));
  const move = (i: number, d: number) => {
    const n = [...items];
    [n[i], n[i + d]] = [n[i + d], n[i]];
    onChange(n);
  };

  return (
    <div className={s.list}>
      {items.map((t, i) => (
        <div key={i} className={s.row}>
          <Caption1 className={s.mark}>{numbered ? `${i + 1}.` : '•'}</Caption1>
          <Textarea value={t} readOnly={readOnly} resize="vertical" rows={Math.min(4, Math.max(1, Math.ceil(t.length / 90)))}
            onChange={(_, d) => set(i, d.value)}
            onBlur={() => !t.trim() && onChange(items.filter((_, j) => j !== i))} />
          {!readOnly && (
            <div className={s.tools}>
              <Button size="small" appearance="subtle" icon={<ArrowUp16Regular />} aria-label="Subir" disabled={i === 0} onClick={() => move(i, -1)} />
              <Button size="small" appearance="subtle" icon={<ArrowDown16Regular />} aria-label="Bajar" disabled={i === items.length - 1} onClick={() => move(i, 1)} />
              <Button size="small" appearance="subtle" icon={<Delete16Regular />} aria-label="Quitar" onClick={() => onChange(items.filter((_, j) => j !== i))} />
            </div>
          )}
        </div>
      ))}
      {!items.length && readOnly && <Caption1>{emptyText ?? '—'}</Caption1>}
      {!readOnly && (
        <div className={s.add} onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          if (picked.current) picked.current = false;
          else if (draft.trim()) add(draft);
        }}>
          <ConceptInput kind={kind} specialty={specialty} value={draft} onChange={(v) => { picked.current = false; setDraft(v); }} exclude={items}
            onPick={(t) => { picked.current = true; add(t); }}
            placeholder={placeholder ?? 'Escribe o elige un concepto guardado…'} />
          <Button icon={<Add20Regular />} disabled={!draft.trim()} onClick={() => add(draft)}>Agregar</Button>
          {items.length > 0 && <ImproveButton texts={items} kind={kind} specialty={specialty} onApply={onChange} />}
        </div>
      )}
    </div>
  );
}
