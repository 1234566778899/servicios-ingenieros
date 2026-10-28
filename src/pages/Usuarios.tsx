import { useEffect, useMemo, useState } from 'react';
import {
  Avatar, Button, Caption1, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Dropdown,
  Field, Input, Link, MessageBar, MessageBarBody, Option, Spinner, Switch, Table, TableBody,
  TableCell, TableHeader, TableHeaderCell, TableRow, Text, Title1, makeStyles, tokens,
} from '@fluentui/react-components';
import { Dismiss20Regular, PersonAdd20Regular, Search20Regular } from '@fluentui/react-icons';
import { PageHeader, Section, StatusBadge, ErrorBar } from '../components/common';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useAuth } from '../lib/auth';
import { useCatalogs } from '../lib/catalogs';
import { supabase, must } from '../lib/supabase';
import { useAsync } from '../lib/useAsync';
import { timeAgo } from '../lib/format';
import { useNotify } from '../lib/toast';
import type { Profile } from '../lib/types';

const useStyles = makeStyles({
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '16px', '@media (max-width: 1000px)': { gridTemplateColumns: '1fr 1fr' } },
  filters: { display: 'flex', gap: '12px', alignItems: 'flex-end', marginBottom: '12px' },
  form: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px 16px', '@media (max-width: 600px)': { gridTemplateColumns: 'minmax(0, 1fr)' }, '& .fui-Dropdown, & .fui-Input, & .fui-Combobox': { minWidth: 0 } },
  span2: { gridColumn: 'span 2', '@media (max-width: 600px)': { gridColumn: 'auto' } },
  name: { display: 'flex', alignItems: 'center', gap: '8px' },
  ellipsis: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
});

async function adminUsers(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('admin-users', { body });
  if (error) {
    const detail = await (error as any).context?.json?.().catch(() => null);
    throw new Error(detail?.error ?? error.message);
  }
  return data;
}

type Draft = Partial<Profile>;

export function Usuarios() {
  const s = useStyles();
  const cat = useCatalogs();
  const { profile: me } = useAuth();
  const notify = useNotify();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('activos');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [toDeactivate, setToDeactivate] = useState<Profile | null>(null);
  const [reason, setReason] = useState('');
  const [toReset, setToReset] = useState<Profile | null>(null);

  const { data: roles } = useAsync(async () => must(await supabase.from('roles').select('*').order('position')) as { id: string; name: string }[], []);
  const roleName = (id?: string) => roles?.find((r) => r.id === id)?.name ?? id ?? '';

  // Refresca "último acceso" al entrar a la pantalla (el catálogo se carga al iniciar sesión)
  useEffect(() => { cat.reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const users = cat.users;
  const online = (u: Profile) => u.active && u.last_seen_at && Date.now() - new Date(u.last_seen_at).getTime() < 5 * 60_000;
  const rows = useMemo(
    () => users.filter((u) =>
      (!role || u.role_id === role) &&
      (status === 'todos' || (status === 'activos' ? u.active : !u.active)) &&
      (!q || `${u.full_name} ${u.dni ?? ''} ${u.email ?? ''}`.toLowerCase().includes(q.toLowerCase()))),
    [users, q, role, status],
  );

  const filtered = !!(q || role) || status !== 'activos';

  const save = async () => {
    if (!draft) return;
    setFormError('');
    if (!draft.full_name || !draft.dni || !draft.role_id) return setFormError('Completa nombre, DNI y rol.');
    if (!/^[0-9]{8}$/.test(draft.dni)) return setFormError('El DNI debe tener 8 dígitos.');
    setBusy(true);
    try {
      const fields = { dni: draft.dni, email: draft.email, full_name: draft.full_name, cargo: draft.cargo, role_id: draft.role_id };
      if (draft.id) {
        await adminUsers({ action: 'update', id: draft.id, ...fields });
        const before = users.find((u) => u.id === draft.id);
        if (before && before.active !== draft.active) await adminUsers({ action: 'set_active', id: draft.id, active: draft.active });
      } else {
        await adminUsers({ action: 'create', ...fields, active: draft.active ?? true });
      }
      notify(draft.id ? 'Usuario actualizado' : 'Usuario creado', 'success', draft.id ? undefined : `Ingresa con su DNI ${draft.dni}; esa es también su contraseña inicial.`);
      setDraft(null);
      cat.reload();
    } catch (e: any) {
      setFormError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const setActive = async (u: Profile, active: boolean, why?: string) => {
    try {
      await adminUsers({ action: 'set_active', id: u.id, active, reason: why });
      notify(active ? `${u.full_name} reactivado` : `${u.full_name} desactivado`);
      cat.reload();
    } catch (e: any) {
      notify('No se pudo actualizar', 'error', e.message);
    }
  };

  const resetPassword = async (u: Profile) => {
    try {
      await adminUsers({ action: 'reset_password', id: u.id });
      notify(`Contraseña de ${u.full_name} restablecida`, 'success', 'Ahora es su DNI; al ingresar se le pedirá cambiarla.');
      cat.reload();
    } catch (e: any) {
      notify('No se pudo restablecer', 'error', e.message);
    }
  };

  const kpis = [
    ['Usuarios activos', users.filter((u) => u.active).length],
    ['Conectados ahora', users.filter(online).length],
    ['Desactivados', users.filter((u) => !u.active).length],
    ['Roles', (roles ?? []).map((r) => r.name).join(' · ')],
  ];

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Inicio', to: '/' }, { label: 'Administración' }, { label: 'Usuarios' }]}
        title="Usuarios"
        actions={<Button appearance="primary" icon={<PersonAdd20Regular />} onClick={() => { setFormError(''); setDraft({ role_id: 'tecnico', active: true }); }}>Nuevo usuario</Button>}
      />
      <div className={s.kpis}>
        {kpis.map(([l, v]) => (
          <Section key={l as string}>
            <Caption1 block>{l}</Caption1>
            {typeof v === 'number' ? <Title1>{v}</Title1> : <Text weight="semibold">{v}</Text>}
          </Section>
        ))}
      </div>
      <Section>
        <div className={s.filters}>
          <Field label="Buscar"><Input contentBefore={<Search20Regular />} placeholder="Nombre, DNI o correo…" value={q} onChange={(_, d) => setQ(d.value)} style={{ width: 260 }} /></Field>
          <Field label="Rol">
            <Dropdown value={role ? roleName(role) : 'Todos'} selectedOptions={[role]} onOptionSelect={(_, d) => setRole(d.optionValue ?? '')}>
              <Option value="">Todos</Option>
              {(roles ?? []).map((r) => <Option key={r.id} value={r.id}>{r.name}</Option>)}
            </Dropdown>
          </Field>
          <Field label="Estado">
            <Dropdown value={{ activos: 'Activos', inactivos: 'Inactivos', todos: 'Todos' }[status]} selectedOptions={[status]} onOptionSelect={(_, d) => setStatus(d.optionValue!)}>
              <Option value="activos">Activos</Option>
              <Option value="inactivos">Inactivos</Option>
              <Option value="todos">Todos</Option>
            </Dropdown>
          </Field>
          {filtered && <Button appearance="subtle" icon={<Dismiss20Regular />} onClick={() => { setQ(''); setRole(''); setStatus('activos'); }}>Limpiar</Button>}
        </div>
        <Table size="small">
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Nombre</TableHeaderCell>
              <TableHeaderCell>DNI</TableHeaderCell>
              <TableHeaderCell>Correo</TableHeaderCell>
              <TableHeaderCell>Cargo</TableHeaderCell>
              <TableHeaderCell>Rol</TableHeaderCell>
              <TableHeaderCell>Último acceso</TableHeaderCell>
              <TableHeaderCell>Estado</TableHeaderCell>
              <TableHeaderCell />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <span className={s.name}>
                    <Avatar size={24} name={u.full_name} badge={online(u) ? { status: 'available' } : undefined} />
                    {u.full_name}
                  </span>
                </TableCell>
                <TableCell>{u.dni ?? '—'}</TableCell>
                <TableCell className={s.ellipsis} title={u.email ?? undefined}>{u.email ?? <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>Sin correo</Caption1>}</TableCell>
                <TableCell>{u.cargo ?? '—'}</TableCell>
                <TableCell>{roleName(u.role_id)}</TableCell>
                <TableCell>{u.must_change_password ? 'Aún no ingresa' : online(u) ? 'Ahora' : timeAgo(u.last_seen_at)}</TableCell>
                <TableCell><StatusBadge status={u.active ? 'Activo' : 'Inactivo'} /></TableCell>
                <TableCell>
                  <Link onClick={() => { setFormError(''); setDraft({ ...u }); }}>Editar</Link>
                  {' · '}
                  <Link disabled={u.id === me?.id || !u.active} onClick={() => setToReset(u)}>Restablecer contraseña</Link>
                  {' · '}
                  {u.active
                    ? <Link disabled={u.id === me?.id} onClick={() => { setReason(''); setToDeactivate(u); }}>Desactivar</Link>
                    : <Link onClick={() => setActive(u, true)}>Reactivar</Link>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!rows.length && <Caption1 block style={{ padding: 12 }}>No hay usuarios con esos filtros.</Caption1>}
      </Section>

      <Dialog open={!!draft} onOpenChange={(_, d) => !d.open && setDraft(null)}>
        <DialogSurface style={{ maxWidth: 600 }}>
          <DialogBody>
            <DialogTitle>{draft?.id ? `Editar ${draft.full_name}` : 'Nuevo usuario'}</DialogTitle>
            {draft && (
              <DialogContent>
                <ErrorBar error={formError} />
                <div className={s.form}>
                  <Field label="Nombres y apellidos" required><Input value={draft.full_name ?? ''} onChange={(_, d) => setDraft({ ...draft, full_name: d.value })} /></Field>
                  <Field label="DNI" required hint={draft.id ? 'Es el usuario con el que ingresa.' : 'Es su usuario y su contraseña inicial.'}>
                    <Input inputMode="numeric" maxLength={8} value={draft.dni ?? ''} onChange={(_, d) => setDraft({ ...draft, dni: d.value.replace(/\D/g, '').slice(0, 8) })} />
                  </Field>
                  <Field label="Correo" hint="Opcional: solo para restablecer su contraseña.">
                    <Input type="email" value={draft.email ?? ''} onChange={(_, d) => setDraft({ ...draft, email: d.value })} />
                  </Field>
                  <Field label="Cargo"><Input value={draft.cargo ?? ''} onChange={(_, d) => setDraft({ ...draft, cargo: d.value })} /></Field>
                  <Field label="Rol" required>
                    <Dropdown value={roleName(draft.role_id)} selectedOptions={[draft.role_id ?? '']} onOptionSelect={(_, d) => setDraft({ ...draft, role_id: d.optionValue! })}>
                      {(roles ?? []).map((r) => <Option key={r.id} value={r.id}>{r.name}</Option>)}
                    </Dropdown>
                  </Field>
                  <Switch className={s.span2} label="Usuario activo" checked={draft.active ?? true} disabled={draft.id === me?.id}
                    onChange={(_, d) => setDraft({ ...draft, active: d.checked })} />
                </div>
                <MessageBar style={{ marginTop: 12 }}>
                  <MessageBarBody>El usuario se crea en la base de datos centralizada en la nube; requiere conexión a Internet.</MessageBarBody>
                </MessageBar>
              </DialogContent>
            )}
            <DialogActions>
              <Button onClick={() => setDraft(null)} disabled={busy}>Cancelar</Button>
              <Button appearance="primary" onClick={save} disabled={busy}>{busy ? <Spinner size="tiny" /> : 'Guardar usuario'}</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <ConfirmDialog
        open={!!toReset}
        title={`¿Restablecer la contraseña de ${toReset?.full_name}?`}
        body={`Su contraseña volverá a ser su DNI (${toReset?.dni ?? ''}) y al ingresar se le pedirá crear una nueva.`}
        confirmLabel="Restablecer"
        onConfirm={async () => { await resetPassword(toReset!); setToReset(null); }}
        onCancel={() => setToReset(null)}
      />

      <ConfirmDialog
        open={!!toDeactivate}
        title={`¿Desactivar a ${toDeactivate?.full_name}?`}
        body="El usuario no podrá iniciar sesión. Sus servicios e informes se conservan en el historial y el usuario puede reactivarse después."
        confirmLabel="Desactivar"
        danger
        onConfirm={async () => { await setActive(toDeactivate!, false, reason); setToDeactivate(null); }}
        onCancel={() => setToDeactivate(null)}
      >
        <Field label="Motivo (opcional)" style={{ marginTop: 12 }}>
          <Input value={reason} onChange={(_, d) => setReason(d.value)} placeholder="Ej.: fin de contrato" />
        </Field>
      </ConfirmDialog>
    </>
  );
}
