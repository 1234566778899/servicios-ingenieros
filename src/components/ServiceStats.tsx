import { useMemo, useState } from 'react';
import { Caption1, Spinner, Tab, TabList, Text, Tooltip, makeStyles, tokens } from '@fluentui/react-components';
import { Section } from './common';
import { shortType } from '../lib/format';

/** Servicio reducido a lo que necesitan las estadísticas. */
export interface ServiceStatRow { client_id: string; service_type: string; execution_date: string }

type Period = 'mes' | 'anio' | 'todo';
const PERIODS: { id: Period; label: string }[] = [
  { id: 'mes', label: 'Este mes' },
  { id: 'anio', label: 'Este año' },
  { id: 'todo', label: 'Todo' },
];
/** Clientes con barra propia; el resto se suma en «Otros clientes». */
const TOP_CLIENTS = 8;

const useStyles = makeStyles({
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', '@media (max-width: 1000px)': { gridTemplateColumns: '1fr', gap: '20px' } },
  list: { display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '8px', padding: 0, listStyle: 'none', marginBottom: 0 },
  item: { margin: 0 },
  row: {
    display: 'grid', gridTemplateColumns: 'minmax(0, 40%) 1fr auto', alignItems: 'center', gap: '10px',
    width: '100%', padding: '4px 6px', borderRadius: '4px', boxSizing: 'border-box',
    border: 'none', background: 'none', font: 'inherit', color: 'inherit', textAlign: 'left',
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
    '@media (max-width: 600px)': { gridTemplateColumns: 'minmax(0, 45%) 1fr auto' },
  },
  clickable: {
    cursor: 'pointer',
    ':focus-visible': { outline: `2px solid ${tokens.colorStrokeFocus2}`, outlineOffset: '-2px' },
  },
  label: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  track: { height: '12px', display: 'flex', alignItems: 'center' },
  bar: { height: '100%', borderRadius: '0 4px 4px 0', minWidth: '2px', backgroundColor: tokens.colorBrandBackground },
  barOther: { backgroundColor: tokens.colorNeutralStroke1 },
  value: { fontVariantNumeric: 'tabular-nums', minWidth: '28px', textAlign: 'right' },
  muted: { color: tokens.colorNeutralForeground3 },
});

/** «AAAA-MM» y «AAAA» de hoy en hora local (execution_date es una fecha sin hora). */
function today() {
  const d = new Date();
  const y = String(d.getFullYear());
  return { year: y, month: `${y}-${String(d.getMonth() + 1).padStart(2, '0')}` };
}

function count<T>(xs: T[], key: (x: T) => string) {
  const m = new Map<string, number>();
  for (const x of xs) m.set(key(x), (m.get(key(x)) ?? 0) + 1);
  return [...m.entries()].map(([k, n]) => ({ key: k, n })).sort((a, b) => b.n - a.n || a.key.localeCompare(b.key));
}

type BarItem = { label: string; n: number; other?: boolean; filter?: Record<string, string> };

function Bars({ title, items, total, onOpen }: {
  title: string; items: BarItem[]; total: number; onOpen: (filter: Record<string, string>) => void;
}) {
  const s = useStyles();
  const max = Math.max(1, ...items.map((i) => i.n));
  return (
    <div>
      <Text weight="semibold">{title}</Text>
      <ul className={s.list} aria-label={title}>
        {items.map((i) => {
          const pct = total ? Math.round((i.n / total) * 100) : 0;
          const inner = (
            <>
              <Caption1 className={s.label}>{i.label}</Caption1>
              <span className={s.track}>
                <span className={`${s.bar} ${i.other ? s.barOther : ''}`} style={{ width: `${(i.n / max) * 100}%` }} />
              </span>
              <Caption1 className={s.value}>{i.n}</Caption1>
            </>
          );
          const tip = `${i.label}: ${i.n} servicio${i.n === 1 ? '' : 's'} (${pct}%)${i.filter ? ' · clic para verlos' : ''}`;
          return (
            <li key={i.label} className={s.item}>
              <Tooltip relationship="description" content={tip}>
                {i.filter
                  ? <button type="button" className={`${s.row} ${s.clickable}`} onClick={() => onOpen(i.filter!)}>{inner}</button>
                  : <div className={s.row} tabIndex={0}>{inner}</div>}
              </Tooltip>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Rango de fechas del período, para filtrar la lista de Servicios igual que el gráfico. */
function periodRange(period: Period): Record<string, string> {
  const { year, month } = today();
  if (period === 'todo') return {};
  if (period === 'anio') return { desde: `${year}-01-01`, hasta: `${year}-12-31` };
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y, m, 0).getDate(); // día 0 del mes siguiente = último día de este mes
  return { desde: `${month}-01`, hasta: `${month}-${String(last).padStart(2, '0')}` };
}

/** Cantidad de servicios por cliente y por tipo, del período elegido. */
export function ServiceStats({ rows, loading, clientName, onOpen }: {
  rows: ServiceStatRow[] | undefined; loading: boolean; clientName: (id: string) => string;
  /** Abre la lista de Servicios con estos filtros (cliente, tipo, desde, hasta). */
  onOpen: (filter: Record<string, string>) => void;
}) {
  const s = useStyles();
  const [period, setPeriod] = useState<Period>('mes');

  const { total, byClient, byType } = useMemo(() => {
    const { year, month } = today();
    const list = (rows ?? []).filter((r) =>
      period === 'todo' ? true : (r.execution_date ?? '').startsWith(period === 'mes' ? month : year));
    const range = periodRange(period);
    const clients: BarItem[] = count(list, (r) => r.client_id)
      .map((c) => ({ label: clientName(c.key) || 'Sin cliente', n: c.n, filter: { ...range, cliente: c.key } }));
    const top = clients.slice(0, TOP_CLIENTS);
    const rest = clients.slice(TOP_CLIENTS);
    if (rest.length) top.push({ label: `Otros clientes (${rest.length})`, n: rest.reduce((a, c) => a + c.n, 0), other: true });
    return {
      total: list.length,
      byClient: top,
      byType: count(list, (r) => r.service_type)
        .map((t): BarItem => ({ label: shortType(t.key), n: t.n, filter: { ...range, tipo: t.key } })),
    };
  }, [rows, period, clientName]);

  return (
    <Section>
      <div className={s.head}>
        <div>
          <Text weight="semibold" size={400}>Servicios por cliente y tipo</Text>
          {rows && <Text size={200} className={s.muted} style={{ marginLeft: 8 }}>{total} servicio{total === 1 ? '' : 's'}</Text>}
        </div>
        <TabList size="small" selectedValue={period} onTabSelect={(_, d) => setPeriod(d.value as Period)}>
          {PERIODS.map((p) => <Tab key={p.id} value={p.id}>{p.label}</Tab>)}
        </TabList>
      </div>
      {loading && !rows ? (
        <Spinner size="small" style={{ padding: 24 }} />
      ) : total === 0 ? (
        <Caption1 className={s.muted}>No hay servicios en este período.</Caption1>
      ) : (
        <div className={s.grid}>
          <Bars title="Por cliente" items={byClient} total={total} onOpen={onOpen} />
          <Bars title="Por tipo de servicio" items={byType} total={total} onOpen={onOpen} />
        </div>
      )}
    </Section>
  );
}
