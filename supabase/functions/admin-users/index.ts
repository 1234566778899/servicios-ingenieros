// Edge Function: alta de usuarios (requiere service_role, que nunca se empaqueta en la app de escritorio).
// Solo la pueden invocar usuarios activos con el permiso "usuarios.admin".
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

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
    const { email, full_name, cargo, role_id, active = true, mode, password } = body;
    if (!email || !full_name || !role_id) return json({ error: 'Faltan datos obligatorios.' }, 400);
    const res =
      mode === 'invite'
        ? await admin.auth.admin.inviteUserByEmail(email, { data: { full_name } })
        : await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name } });
    if (res.error) return json({ error: res.error.message }, 400);
    const id = res.data.user!.id;
    const { error } = await admin.from('profiles').insert({ id, email, full_name, cargo: cargo || null, role_id, active });
    if (error) {
      await admin.auth.admin.deleteUser(id);
      return json({ error: error.message }, 400);
    }
    return json({ id });
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
    const { id, password } = body;
    const { error } = await admin.auth.admin.updateUserById(id, { password });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  return json({ error: 'Acción no válida.' }, 400);
});
