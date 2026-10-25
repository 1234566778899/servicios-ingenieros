// Edge Function: mejora la redacción de textos del informe con Gemini (la clave nunca llega a la app).
// Solo la pueden invocar usuarios activos. Devuelve un texto mejorado por cada texto recibido, en el mismo orden.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-flash-latest';
const MAX_TEXTS = 40;
const MAX_CHARS = 2000;

const KIND: Record<string, string> = {
  memoria: 'la memoria descriptiva del informe',
  detalle: 'detalles previos (preparativos antes del trabajo)',
  trabajo: 'trabajos realizados',
  foto: 'descripciones de fotografías',
  conclusion: 'conclusiones',
  observacion: 'observaciones',
  recomendacion: 'recomendaciones',
};

const instructions = (kind: string, specialty: string) => `Eres corrector de estilo de informes técnicos de Nórdico Ingenieros, empresa peruana de mantenimiento
de infraestructura (aire acondicionado, pintura, sistemas contra incendios, electricidad, gasfitería, etc.).
Recibirás una lista JSON de textos que corresponden a ${KIND[kind] ?? 'textos de un informe técnico'}${specialty ? ` de la especialidad "${specialty}"` : ''}.
Para cada texto devuelve su versión mejorada:
- Corrige ortografía, tildes, puntuación, concordancia y mayúsculas.
- Usa español técnico, formal e impersonal ("Se realizó…", "Se recomienda…"), claro y conciso.
- Conserva exactamente el significado: NO agregues hechos, causas, cantidades ni recomendaciones que no estén en el texto.
- Conserva sin cambios los números, cantidades, códigos de equipo, marcas, modelos, series, unidades y nombres de tiendas.
- Escribe las cantidades pequeñas con dos dígitos cuando el texto ya las use así (02, 04).
- Si el texto ya está bien escrito, devuélvelo igual.
- Cada texto es un solo párrafo, sin viñetas ni numeración al inicio.
Responde solo con un arreglo JSON de strings, con la misma cantidad de elementos y en el mismo orden que la entrada.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const caller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: active, error: authError } = await caller.rpc('is_active_user');
  if (authError || !active) return json({ error: 'Inicia sesión para usar esta función.' }, 401);

  // La clave va como secreto de la función o, si no, en private.app_secrets (solo legible con service_role)
  let key = Deno.env.get('GEMINI_API_KEY');
  if (!key) {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data } = await admin.rpc('get_app_secret', { p_name: 'GEMINI_API_KEY' });
    key = data ?? undefined;
  }
  if (!key) return json({ error: 'Falta configurar la clave de Gemini en Supabase.' }, 500);

  const { texts, kind = '', specialty = '' } = await req.json().catch(() => ({}));
  if (!Array.isArray(texts) || !texts.length || texts.some((t) => typeof t !== 'string')) {
    return json({ error: 'No hay textos para mejorar.' }, 400);
  }
  if (texts.length > MAX_TEXTS || texts.some((t: string) => t.length > MAX_CHARS)) {
    return json({ error: `Máximo ${MAX_TEXTS} textos de ${MAX_CHARS} caracteres por vez.` }, 400);
  }

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: instructions(kind, specialty) }] },
      contents: [{ role: 'user', parts: [{ text: JSON.stringify(texts) }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: { type: 'ARRAY', items: { type: 'STRING' } },
      },
    }),
  });
  if (!res.ok) {
    console.error('Gemini', res.status, await res.text());
    return json({ error: res.status === 429 ? 'Se alcanzó el límite de uso de Gemini. Intenta en unos minutos.' : 'Gemini no respondió. Intenta de nuevo.' }, 502);
  }

  const data = await res.json();
  try {
    const out = JSON.parse(data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '');
    if (!Array.isArray(out) || out.length !== texts.length) throw new Error('largo distinto');
    return json({ texts: out.map((t: unknown, i: number) => (typeof t === 'string' && t.trim() ? t.trim() : texts[i])) });
  } catch (e) {
    console.error('Respuesta inválida de Gemini', e, JSON.stringify(data).slice(0, 500));
    return json({ error: 'La respuesta de Gemini no se pudo leer. Intenta de nuevo.' }, 502);
  }
});
