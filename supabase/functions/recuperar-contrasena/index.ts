// Edge Function pública: envía con Resend el enlace para restablecer la contraseña al correo registrado del DNI.
// Debe desplegarse SIN verificación de JWT (la llama quien todavía no ha iniciado sesión).
// Secretos en private.app_secrets: RESEND_API_KEY, RESEND_FROM y APP_URL (direcciones de la app separadas por coma).
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// Misma respuesta exista o no el DNI, para no revelar quién está registrado
const GENERIC = 'Si el DNI está registrado y tiene un correo, recibirás un enlace para restablecer tu contraseña. '
  + 'Si no tienes correo registrado, pide al administrador que restablezca tu contraseña.';

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const secret = async (name: string) =>
    Deno.env.get(name) ?? ((await admin.rpc('get_app_secret', { p_name: name })).data as string | null);

  const { dni } = await req.json().catch(() => ({}));
  if (typeof dni !== 'string' || !/^[0-9]{8}$/.test(dni)) return json({ error: 'Escribe un DNI de 8 dígitos.' }, 400);

  const { data: p } = await admin.from('profiles')
    .select('id, full_name, email, active, reset_requested_at').eq('dni', dni).maybeSingle();
  // Un envío por minuto como máximo por usuario
  const recent = p?.reset_requested_at && Date.now() - new Date(p.reset_requested_at).getTime() < 60_000;
  if (!p || !p.active || !p.email || recent) return json({ message: GENERIC });

  const [apiKey, from, appUrls] = await Promise.all([secret('RESEND_API_KEY'), secret('RESEND_FROM'), secret('APP_URL')]);
  if (!apiKey || !from || !appUrls) return json({ error: 'El envío de correos no está configurado.' }, 500);

  // El enlace solo apunta a direcciones conocidas de la app (nunca a un Origin arbitrario)
  const allowed = appUrls.split(',').map((u) => u.trim().replace(/\/$/, '')).filter(Boolean);
  const origin = req.headers.get('Origin') ?? '';
  const base = allowed.includes(origin) ? origin : allowed[0];

  const { data: user } = await admin.auth.admin.getUserById(p.id);
  const link = await admin.auth.admin.generateLink({ type: 'recovery', email: user.user!.email! });
  if (link.error) return json({ error: link.error.message }, 500);
  const url = `${base}/#/restablecer?token=${encodeURIComponent(link.data.properties.hashed_token)}`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [p.email],
      subject: 'Restablecer contraseña — Informes Técnicos Nórdico',
      text: `Hola ${p.full_name}:\n\nPara restablecer tu contraseña abre este enlace (vence en 1 hora):\n${url}\n\n`
        + 'Si no lo solicitaste, ignora este correo.\n\nNórdico Ingenieros',
      html: `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#242424;max-width:520px">
  <p>Hola ${escape(p.full_name)}:</p>
  <p>Recibimos una solicitud para restablecer tu contraseña de <b>Informes Técnicos</b>.</p>
  <p><a href="${escape(url)}" style="display:inline-block;background:#0f6cbd;color:#fff;padding:10px 20px;border-radius:4px;text-decoration:none">Restablecer contraseña</a></p>
  <p style="color:#616161">El enlace vence en 1 hora. Si no lo solicitaste, ignora este correo.</p>
  <p>Nórdico Ingenieros</p>
</div>`,
    }),
  });
  if (!res.ok) return json({ error: `No se pudo enviar el correo (${res.status}).` }, 502);

  await admin.from('profiles').update({ reset_requested_at: new Date().toISOString() }).eq('id', p.id);
  return json({ message: GENERIC });
});
