import { useEffect, useState } from 'react';
import {
  Button, Checkbox, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Field, Input,
  MessageBar, MessageBarBody, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Text, tokens,
} from '@fluentui/react-components';
import { Add20Regular, Save20Regular } from '@fluentui/react-icons';
import { PageHeader, Section, Loading, ErrorBar } from '../components/common';
import { useAuth } from '../lib/auth';
import { supabase, must } from '../lib/supabase';
import { useAsync } from '../lib/useAsync';
import { useNotify } from '../lib/toast';

interface Perm { id: string; module: string; action: string }
interface Role { id: string; name: string; position: number }

const key = (r: string, p: string) => `${r}|${p}`;

export function Roles() {
  const notify = useNotify();
  const { profile } = useAuth();
  const { data, error, reload } = useAsync(async () => {
    const [roles, perms, rp] = await Promise.all([
      supabase.from('roles').select('*').order('position'),
      supabase.from('permissions').select('*').order('position'),
      supabase.from('role_permissions').select('*'),
    ]);
    return {
      roles: must(roles) as Role[],
      perms: must(perms) as Perm[],
      granted: new Set((must(rp) as { role_id: string; permission_id: string }[]).map((x) => key(x.role_id, x.permission_id))),
    };
  }, []);

  const [matrix, setMatrix] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [newRole, setNewRole] = useState<{ id: string; name: string } | null>(null);
  useEffect(() => { if (data) setMatrix(new Set(data.granted)); }, [data]);

  if (!data) return error ? <ErrorBar error={error} /> : <Loading />;

  const dirty = data.granted.size !== matrix.size || [...matrix].some((k) => !data.granted.has(k));
  // Evita que el administrador se quite a sí mismo el acceso a esta pantalla
  const locked = (r: string, p: string) => p === 'usuarios.admin' && r === profile?.role_id;

  const toggle = (k: string, on: boolean) => setMatrix((m) => { const n = new Set(m); if (on) n.add(k); else n.delete(k); return n; });

  const save = async () => {
    setSaving(true);
    try {
      const add = [...matrix].filter((k) => !data.granted.has(k)).map((k) => { const [role_id, permission_id] = k.split('|'); return { role_id, permission_id }; });
      const del = [...data.granted].filter((k) => !matrix.has(k));
      if (add.length) must(await supabase.from('role_permissions').insert(add));
      for (const k of del) {
        const [role_id, permission_id] = k.split('|');
        must(await supabase.from('role_permissions').delete().eq('role_id', role_id).eq('permission_id', permission_id));
      }
      notify('Permisos actualizados');
      await reload();
    } catch (e: any) {
      notify('No se pudo guardar', 'error', e.message);
    } finally {
      setSaving(false);
    }
  };

  const createRole = async () => {
    if (!newRole?.name) return;
    const id = (newRole.id || newRole.name).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const { error } = await supabase.from('roles').insert({ id, name: newRole.name, position: data.roles.length });
    if (error) return notify('No se pudo crear el rol', 'error', error.message);
    setNewRole(null);
    notify(`Rol ${newRole.name} creado`);
    reload();
  };

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Inicio', to: '/' }, { label: 'Administración' }, { label: 'Roles y permisos' }]}
        title="Roles y permisos"
        actions={
          <>
            <Button icon={<Add20Regular />} onClick={() => setNewRole({ id: '', name: '' })}>Nuevo rol</Button>
            <Button appearance="primary" icon={<Save20Regular />} disabled={!dirty || saving} onClick={save}>Guardar cambios</Button>
          </>
        }
      />
      <MessageBar style={{ marginBottom: 16 }}>
        <MessageBarBody>Los permisos se aplican en la base de datos (políticas RLS): un usuario sin permiso no puede leer ni modificar esos datos aunque la interfaz lo intente.</MessageBarBody>
      </MessageBar>
      <Section title="Permisos por rol">
        <Table size="small">
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Módulo / acción</TableHeaderCell>
              {data.roles.map((r) => <TableHeaderCell key={r.id} style={{ width: 140, textAlign: 'center' }}>{r.name.toUpperCase()}</TableHeaderCell>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.perms.map((p) => (
              <TableRow key={p.id}>
                <TableCell><Text weight="semibold">{p.module}</Text> · {p.action}</TableCell>
                {data.roles.map((r) => {
                  const k = key(r.id, p.id);
                  return (
                    <TableCell key={r.id} style={{ textAlign: 'center' }}>
                      <Checkbox aria-label={`${r.name}: ${p.module} ${p.action}`} checked={matrix.has(k)} disabled={locked(r.id, p.id)}
                        onChange={(_, d) => toggle(k, !!d.checked)} />
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {dirty && <Text size={200} style={{ color: tokens.colorPaletteMarigoldForeground1, display: 'block', marginTop: 8 }}>Hay cambios sin guardar.</Text>}
      </Section>

      <Dialog open={!!newRole} onOpenChange={(_, d) => !d.open && setNewRole(null)}>
        <DialogSurface style={{ maxWidth: 420 }}>
          <DialogBody>
            <DialogTitle>Nuevo rol</DialogTitle>
            <DialogContent>
              <Field label="Nombre del rol" required>
                <Input value={newRole?.name ?? ''} onChange={(_, d) => setNewRole({ id: '', name: d.value })} placeholder="Ej.: Practicante" />
              </Field>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setNewRole(null)}>Cancelar</Button>
              <Button appearance="primary" disabled={!newRole?.name} onClick={createRole}>Crear rol</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  );
}
