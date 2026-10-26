import { useState } from 'react';
import { Button, Caption1, Dropdown, Option, Text, makeStyles, tokens } from '@fluentui/react-components';
import { ChevronDoubleLeft20Regular, ChevronDoubleRight20Regular, ChevronLeft20Regular, ChevronRight20Regular } from '@fluentui/react-icons';

const SIZES = [10, 15, 25, 50, 100];

const useStyles = makeStyles({
  pager: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px 16px', flexWrap: 'wrap', marginTop: '12px' },
  controls: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' },
  size: { display: 'flex', alignItems: 'center', gap: '6px', marginRight: '8px' },
});

/** Tamaño de página recordado por pantalla en este navegador. */
export function usePageSize(key: string, initial: number) {
  const storageKey = `pageSize:${key}`;
  const [size, setSize] = useState(() => {
    try {
      const v = Number(localStorage.getItem(storageKey));
      return SIZES.includes(v) ? v : initial;
    } catch {
      return initial;
    }
  });
  const update = (v: number) => {
    setSize(v);
    try { localStorage.setItem(storageKey, String(v)); } catch { /* sin almacenamiento: solo vale para esta visita */ }
  };
  return [size, update] as const;
}

/** Barra de paginación: rango mostrado, filas por página y saltos a primera/anterior/siguiente/última. */
export function Pager({ page, size, total, noun, note, onPage, onSize }: {
  page: number; size: number; total: number; noun: string; note?: string;
  onPage: (p: number) => void; onSize: (s: number) => void;
}) {
  const s = useStyles();
  const pages = Math.max(1, Math.ceil(total / size));
  const last = pages - 1;
  return (
    <div className={s.pager}>
      <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>
        {total > 0 && `Mostrando ${page * size + 1}–${Math.min(total, (page + 1) * size)} de ${total} ${noun}. `}
        {note}
      </Caption1>
      {total > 0 && (
        <div className={s.controls}>
          <span className={s.size}>
            <Text size={200}>Filas por página</Text>
            <Dropdown size="small" value={String(size)} selectedOptions={[String(size)]} style={{ minWidth: 72 }}
              onOptionSelect={(_, d) => onSize(Number(d.optionValue))} aria-label="Filas por página">
              {SIZES.map((n) => <Option key={n} value={String(n)}>{String(n)}</Option>)}
            </Dropdown>
          </span>
          <Button size="small" icon={<ChevronDoubleLeft20Regular />} disabled={page === 0} onClick={() => onPage(0)} aria-label="Primera página" title="Primera página" />
          <Button size="small" icon={<ChevronLeft20Regular />} disabled={page === 0} onClick={() => onPage(page - 1)} aria-label="Anterior" title="Anterior" />
          <Text size={200} style={{ minWidth: 90, textAlign: 'center' }}>Página {page + 1} de {pages}</Text>
          <Button size="small" icon={<ChevronRight20Regular />} disabled={page >= last} onClick={() => onPage(page + 1)} aria-label="Siguiente" title="Siguiente" />
          <Button size="small" icon={<ChevronDoubleRight20Regular />} disabled={page >= last} onClick={() => onPage(last)} aria-label="Última página" title="Última página" />
        </div>
      )}
    </div>
  );
}
