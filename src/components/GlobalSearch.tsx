import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Caption1, SearchBox, Spinner, Text, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { Building20Regular, Location20Regular, Search20Regular, WrenchScrewdriver20Regular } from '@fluentui/react-icons';
import { useCatalogs } from '../lib/catalogs';
import { useRouter } from '../lib/router';
import { supabase } from '../lib/supabase';
import { fmtDate, fold } from '../lib/format';
import type { Service } from '../lib/types';

const useStyles = makeStyles({
  wrap: { position: 'relative', width: '360px', maxWidth: '40vw', '@media (max-width: 900px)': { flex: 1, width: 'auto', maxWidth: 'none', minWidth: 0 } },
  box: { width: '100%', maxWidth: 'none' },
  panel: {
    position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 1000,
    width: '520px', maxWidth: 'calc(100vw - 24px)', maxHeight: 'min(70vh, 560px)', overflowY: 'auto',
    backgroundColor: tokens.colorNeutralBackground1, borderRadius: tokens.borderRadiusLarge,
    boxShadow: tokens.shadow16, border: `1px solid ${tokens.colorNeutralStroke2}`, padding: '6px 0',
    // En el celular el buscador no empieza en el borde (está el botón del menú): el panel ocupa el ancho de la pantalla
    '@media (max-width: 600px)': { position: 'fixed', top: '52px', left: '8px', right: '8px', width: 'auto', maxWidth: 'none' },
  },
  group: { padding: '8px 14px 4px', color: tokens.colorNeutralForeground3, fontWeight: tokens.fontWeightSemibold, textTransform: 'uppercase', fontSize: tokens.fontSizeBase100, letterSpacing: '0.04em' },
  item: {
    display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '8px 14px', border: 0, background: 'none',
    textAlign: 'left', font: 'inherit', cursor: 'pointer', color: tokens.colorNeutralForeground1,
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  active: { backgroundColor: tokens.colorNeutralBackground1Selected },
  icon: { color: tokens.colorNeutralForeground3, flexShrink: 0, display: 'flex' },
  text: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  sub: { color: tokens.colorNeutralForeground3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  empty: { padding: '12px 14px', color: tokens.colorNeutralForeground3 },
  footer: { borderTop: `1px solid ${tokens.colorNeutralStroke2}`, marginTop: '6px', paddingTop: '4px' },
});

type Item = { key: string; group: string; icon: ReactNode; title: string; sub?: string; to: string };

const MAX = 6;
// Palabras sin los caracteres que cambian el sentido de un filtro de PostgREST
const words = (q: string) => fold(q).replace(/[%_\\,()*]/g, ' ').split(/\s+/).filter(Boolean);

/** Buscador de la barra superior: muestra los resultados en un panel flotante sin salir de la pantalla actual. */
export function GlobalSearch() {
  const s = useStyles();
  const cat = useCatalogs();
  const { path, navigate } = useRouter();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Item[] | null>(null);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const run = useRef(0);
  // Texto de la última búsqueda: Enter sin cambiarlo abre el resultado marcado
  const searched = useRef('');

  // Al cambiar de pantalla se cierra el panel
  useEffect(() => setOpen(false), [path]);

  // Clic fuera del buscador: se cierra
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const search = async (text: string) => {
    const ws = words(text);
    if (!ws.length) return;
    const id = ++run.current;
    searched.current = text.trim();
    setOpen(true);
    setLoading(true);
    setActive(0);

    // Servicios: texto de búsqueda del servicio (código, OT, cliente, sede), los más recientes primero
    let sq = supabase.from('services').select('id, code, client_id, site_id, service_type, execution_date')
      .order('execution_date', { ascending: false }).order('code', { ascending: false }).limit(MAX);
    for (const w of ws) sq = sq.ilike('search_text', `%${w}%`);
    const svcRes = await sq;
    if (id !== run.current) return; // llegó una búsqueda más nueva

    const has = (t: string) => ws.every((w) => fold(t).includes(w));
    const clients = cat.clients.filter((c) => has(c.name)).slice(0, 4);
    const sites = cat.sites.filter((x) => has(`${cat.siteLabel(x.id)} ${x.district ?? ''} ${x.address ?? ''}`)).slice(0, 4);

    const out: Item[] = [
      ...((svcRes.data ?? []) as Pick<Service, 'id' | 'code' | 'client_id' | 'site_id' | 'service_type' | 'execution_date'>[]).map((r) => ({
        key: `s${r.id}`, group: 'Servicios', icon: <WrenchScrewdriver20Regular />, title: `${r.code} · ${cat.siteLabel(r.site_id)}`,
        sub: `${cat.clientName(r.client_id)} · ${r.service_type} · ${fmtDate(r.execution_date)}`, to: `/servicios/${r.id}`,
      })),
      ...clients.map((c) => ({
        key: `c${c.id}`, group: 'Clientes', icon: <Building20Regular />, title: c.name, sub: 'Ver sus servicios',
        to: `/servicios?cliente=${c.id}`,
      })),
      ...sites.map((x) => ({
        key: `t${x.id}`, group: 'Sedes', icon: <Location20Regular />, title: cat.siteLabel(x.id),
        sub: `${cat.clientName(x.client_id)}${x.district ? ` · ${x.district}` : ''} · Ver sus servicios`,
        to: `/servicios?cliente=${x.client_id}&sede=${x.id}`,
      })),
    ];
    out.push({
      key: 'all', group: '', icon: <Search20Regular />, title: `Ver todos los servicios con «${text.trim()}»`,
      to: `/servicios?q=${encodeURIComponent(text.trim())}`,
    });
    setItems(out);
    setLoading(false);
  };

  const go = (it: Item) => {
    setOpen(false);
    navigate(it.to);
  };

  const list = items ?? [];
  let lastGroup = '';

  return (
    <div className={s.wrap} ref={wrapRef}>
      <SearchBox
        className={s.box}
        placeholder="Buscar servicio, cliente o sede…"
        value={q}
        onChange={(_, d) => { setQ(d.value); if (!d.value.trim()) setOpen(false); }}
        onFocus={() => items && q.trim() && setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') return setOpen(false);
          if (open && list.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length);
            return;
          }
          if (e.key !== 'Enter' || !q.trim()) return;
          // Con los resultados a la vista y el mismo texto, Enter abre el marcado; si cambió el texto, busca de nuevo
          if (open && !loading && items && q.trim() === searched.current) go(list[active]);
          else void search(q);
        }}
        aria-expanded={open}
        aria-controls="busqueda-resultados"
      />
      {open && (
        <div className={s.panel} id="busqueda-resultados" role="listbox" aria-label="Resultados de la búsqueda">
          {loading && <div className={s.empty}><Spinner size="tiny" label="Buscando…" labelPosition="after" /></div>}
          {!loading && list.length === 1 && <div className={s.empty}><Text>Sin resultados para «{q.trim()}».</Text></div>}
          {!loading && list.map((it, i) => {
            const head = it.group && it.group !== lastGroup;
            lastGroup = it.group || lastGroup;
            return (
              <div key={it.key} className={it.key === 'all' ? s.footer : undefined}>
                {head && <div className={s.group}>{it.group}</div>}
                <button type="button" role="option" aria-selected={i === active}
                  className={mergeClasses(s.item, i === active && s.active)}
                  onMouseEnter={() => setActive(i)} onClick={() => go(it)}>
                  <span className={s.icon}>{it.icon}</span>
                  <span className={s.text}>
                    <Text truncate wrap={false} weight={it.key === 'all' ? 'regular' : 'semibold'}>{it.title}</Text>
                    {it.sub && <Caption1 className={s.sub}>{it.sub}</Caption1>}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
