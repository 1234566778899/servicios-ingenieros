// Edge Function: alta y mantenimiento de usuarios (requiere service_role, que nunca se empaqueta en la app).
// Solo la pueden invocar usuarios activos con el permiso "usuarios.admin".
// El ingreso es con DNI: en Auth el correo es interno (<dni>@dni.nordicoingenieros.com) y la contraseña
// inicial es el DNI; profiles.email es el correo real, que solo se usa para restablecer la contraseña.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const authEmail = (dni: string) => `${dni}@dni.nordicoingenieros.com`;
const validDni = (dni: unknown): dni is string => typeof dni === 'string' && /^[0-9]{8}$/.test(dni);
const cleanEmail = (email: unknown) => (typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : null);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const url = Deno.env.get('SUPABASE_URL')!;
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: allowed, error: permError } = await caller.rpc('has_perm', { p: 'usuarios.admin' });
  if (permError || !allowed) return json({ error: 'No tienes permiso para administrar usuarios.' }, 403);

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const body = await req.json();

  if (body.action === 'create') {
    const { dni, full_name, cargo, role_id, active = true } = body;
    if (!full_name || !role_id) return json({ error: 'Faltan datos obligatorios.' }, 400);
    if (!validDni(dni)) return json({ error: 'El DNI debe tener 8 dígitos.' }, 400);
    const res = await admin.auth.admin.createUser({
      email: authEmail(dni), password: dni, email_confirm: true, user_metadata: { full_name },
    });
    if (res.error) {
      return json({ error: res.error.message.includes('already') ? 'Ya existe un usuario con ese DNI.' : res.error.message }, 400);
    }
    const id = res.data.user!.id;
    const { error } = await admin.from('profiles').insert({
      id, dni, email: cleanEmail(body.email), full_name, cargo: cargo || null, role_id, active, must_change_password: true,
    });
    if (error) {
      await admin.auth.admin.deleteUser(id);
      return json({ error: error.message }, 400);
    }
    return json({ id });
  }

  if (body.action === 'update') {
    // Cambiar el DNI cambia también el usuario con el que se ingresa
    const { id, dni, full_name, cargo, role_id } = body;
    if (!id || !full_name || !role_id) return json({ error: 'Faltan datos obligatorios.' }, 400);
    if (!validDni(dni)) return json({ error: 'El DNI debe tener 8 dígitos.' }, 400);
    const { data: before } = await admin.from('profiles').select('dni').eq('id', id).single();
    if (before?.dni !== dni) {
      const taken = await admin.from('profiles').select('id').eq('dni', dni).neq('id', id).maybeSingle();
      if (taken.data) return json({ error: 'Ya existe un usuario con ese DNI.' }, 400);
      const { error } = await admin.auth.admin.updateUserById(id, { email: authEmail(dni), email_confirm: true });
      if (error) return json({ error: error.message }, 400);
    }
    const { error } = await admin.from('profiles')
      .update({ dni, email: cleanEmail(body.email), full_name, cargo: cargo || null, role_id }).eq('id', id);
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  if (body.action === 'set_active') {
    // Bloquea/desbloquea también el inicio de sesión en Auth
    const { id, active, reason } = body;
    const { error: e1 } = await admin.auth.admin.updateUserById(id, { ban_duration: active ? 'none' : '876000h' });
    if (e1) return json({ error: e1.message }, 400);
    const { error: e2 } = await admin.from('profiles').update({ active, deactivated_reason: active ? null : reason || null }).eq('id', id);
    if (e2) return json({ error: e2.message }, 400);
    return json({ ok: true });
  }

  if (body.action === 'reset_password') {
    // Vuelve a dejar el DNI como contraseña; al ingresar se le pedirá cambiarla
    const { data: p } = await admin.from('profiles').select('dni').eq('id', body.id).single();
    if (!validDni(p?.dni)) return json({ error: 'El usuario no tiene DNI registrado.' }, 400);
    const { error } = await admin.auth.admin.updateUserById(body.id, { password: p.dni });
    if (error) return json({ error: error.message }, 400);
    await admin.from('profiles').update({ must_change_password: true }).eq('id', body.id);
    return json({ ok: true });
  }

  return json({ error: 'Acción no válida.' }, 400);
});
