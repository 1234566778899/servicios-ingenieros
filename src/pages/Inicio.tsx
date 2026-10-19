import {
  Avatar, Button, Caption1, Link, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Text,
  Title1, makeStyles, tokens, Tooltip,
} from '@fluentui/react-components';
import { Add20Regular, History20Regular } from '@fluentui/react-icons';
import { PageHeader, Section, StatusBadge, ErrorBar } from '../components/common';
import { useAuth } from '../lib/auth';
import { useCatalogs } from '../lib/catalogs';
import { useRouter } from '../lib/router';
import { supabase, must } from '../lib/supabase';
import { useAsync } from '../lib/useAsync';
import { fmtDate, shortType, timeAgo } from '../lib/format';
import type { Service } from '../lib/types';

const useStyles = makeStyles({
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '16px', '@media (max-width: 1000px)': { gridTemplateColumns: '1fr 1fr' } },
  kpi: { display: 'flex', flexDirection: 'column', gap: '2px' },
  grid: { display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px', alignItems: 'start', '@media (max-width: 1000px)': { gridTemplateColumns: '1fr' } },
  col: { display: 'flex', flexDirection: 'column', gap: '16px' },
  chart: { display: 'flex', alignItems: 'flex-end', gap: '6px', height: '140px', paddingTop: '8px' },
  bar: { flex: 1, borderRadius: '3px 3px 0 0', minHeight: '2px' },
  act: { display: 'flex', gap: '10px', alignItems: 'center', padding: '6px 0' },
});

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
}

export function Inicio() {
  const s = useStyles();
  const { profile, can } = useAuth();
  const { navigate } = useRouter();
  const cat = useCatalogs();

  const { data, error } = useAsync(async () => {
    cat.reload();
    const since = new Date(Date.now() - 84 * 86400_000).toISOString();
    const [stats, recent, reports, activity] = await Promise.all([
      supabase.rpc('dashboard_stats'),
      supabase
        .from('services')
        .select('*')
        .or(`lead_tech_id.eq.${profile!.id},created_by.eq.${profile!.id}`)
        .order('execution_date', { ascending: false })
        .limit(5),
      supabase.from('reports').select('generated_at').gte('generated_at', since),
      supabase.from('activity_log').select('*, services(code)').order('created_at', { ascending: false }).limit(6),
    ]);
    // Informes por semana: 12 cubetas de 7 días, la última es la semana actual
    const weeks = Array(12).fill(0);
    for (const r of must(reports) as { generated_at: string }[]) {
      const ago = Math.floor((Date.now() - new Date(r.generated_at).getTime()) / (7 * 86400_000));
      if (ago < 12) weeks[11 - ago]++;
    }
    return {
      stats: (must(stats) ?? {}) as Record<string, number>,
      recent: must(recent) as Service[],
      weeks,
      activity: must(activity) as any[],
    };
  }, [profile?.id]);

  const st = data?.stats ?? {};
  const connected = cat.users.filter((u) => u.active && u.last_seen_at && Date.now() - new Date(u.last_seen_at).getTime() < 5 * 60_000).length;
  const diffMes = (st.informes_mes ?? 0) - (st.informes_mes_ant ?? 0);
  const max = Math.max(1, ...(data?.weeks ?? [1]));

  const kpis = [
    { label: 'Servicios en curso', value: st.en_curso, note: `${st.sin_fotos ?? 0} sin fotografías completas` },
    { label: 'Informes este mes', value: st.informes_mes, note: `${diffMes >= 0 ? '+' : ''}${diffMes} vs. mes anterior` },
    { label: 'Equipos atendidos este mes', value: st.equipos_mes, note: `en ${st.servicios_mes ?? 0} servicios` },
    { label: 'Usuarios conectados', value: connected, note: `de ${st.usuarios_activos ?? 0} activos` },
  ];

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Inicio' }]}
        title={`${greeting()}, ${profile?.full_name.split(' ')[0]}`}
        actions={
          <>
            <Button icon={<History20Regular />} onClick={() => navigate('/historial')}>Ver historial</Button>
            {can('servicios.crear') && (
              <Button appearance="primary" icon={<Add20Regular />} onClick={() => navigate('/servicios/nuevo')}>
                Nuevo servicio
              </Button>
            )}
          </>
        }
      />
      <ErrorBar error={error} />
      <div className={s.kpis}>
        {kpis.map((k) => (
          <Section key={k.label}>
            <div className={s.kpi}>
              <Caption1>{k.label}</Caption1>
              <Title1>{k.value ?? '—'}</Title1>
              <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>{k.note}</Caption1>
            </div>
          </Section>
        ))}
      </div>
      <div className={s.grid}>
        <Section title="Mis servicios recientes" actions={<Link onClick={() => navigate('/servicios')}>Ver todos</Link>}>
          <Table size="small">
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Código</TableHeaderCell>
                <TableHeaderCell>Cliente · Sede</TableHeaderCell>
                <TableHeaderCell>Tipo</TableHeaderCell>
                <TableHeaderCell>Fecha</TableHeaderCell>
                <TableHeaderCell>Estado</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.recent.map((r) => (
                <TableRow key={r.id} onClick={() => navigate(`/servicios/${r.id}`)} style={{ cursor: 'pointer' }}>
                  <TableCell><Link>{r.code}</Link></TableCell>
                  <TableCell>{cat.clientName(r.client_id)} · {cat.siteName(r.site_id)}</TableCell>
                  <TableCell>{shortType(r.service_type)}</TableCell>
                  <TableCell>{fmtDate(r.execution_date)}</TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                </TableRow>
              ))}
              {data && data.recent.length === 0 && (
                <TableRow><TableCell colSpan={5}><Caption1>Aún no tienes servicios registrados.</Caption1></TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </Section>
        <div className={s.col}>
          <Section title="Informes por semana" subtitle="últimas 12">
            <div className={s.chart} role="img" aria-label="Informes generados por semana">
              {(data?.weeks ?? Array(12).fill(0)).map((v, i) => (
                <Tooltip key={i} content={`${v} informe(s) · ${i === 11 ? 'esta semana' : `hace ${11 - i} sem.`}`} relationship="label">
                  <div
                    className={s.bar}
                    style={{
                      height: `${(v / max) * 100}%`,
                      backgroundColor: i === 11 ? tokens.colorBrandBackground : tokens.colorNeutralStroke1,
                    }}
                  />
                </Tooltip>
              ))}
            </div>
          </Section>
          <Section title="Actividad del equipo">
            {data?.activity.map((a) => (
              <div key={a.id} className={s.act}>
                <Avatar name={cat.userName(a.user_id)} size={28} />
                <div>
                  <Text block size={200}>
                    <b>{cat.userName(a.user_id)}</b> {a.action}
                    {a.services?.code ? ` · ${a.services.code}` : ''}
                  </Text>
                  <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>{timeAgo(a.created_at)}</Caption1>
                </div>
              </div>
            ))}
            {data && data.activity.length === 0 && <Caption1>Sin actividad reciente.</Caption1>}
          </Section>
        </div>
      </div>
    </>
  );
}
