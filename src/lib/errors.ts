// Traduce al español los errores de Supabase (Postgres, Auth, Storage, Edge Functions) y del navegador.
// Los mensajes propios de la app ya vienen en español y pasan sin cambios.

/** Restricciones únicas (código 23505) → qué dato está repetido */
const UNIQUE: Record<string, string> = {
  sites_client_id_name_key: 'Ya existe una sede con ese nombre en este cliente.',
  clients_name_key: 'Ya existe un cliente con ese nombre.',
  equipment_types_name_key: 'Ya existe un tipo de equipo con ese nombre.',
  service_types_name_key: 'Ya existe un tipo de servicio con ese nombre.',
  specialties_name_key: 'Ya existe una especialidad con ese nombre.',
  findings_catalog_code_key: 'Ya existe un hallazgo con ese código.',
  site_equipment_site_id_code_key: 'Ya existe un equipo con ese código en esta sede.',
  profiles_dni_key: 'Ya existe un usuario con ese DNI.',
  concepts_unique: 'Ese texto ya está guardado.',
  checklist_templates_equipment_type_id_version_key: 'Otra persona acaba de publicar una versión de este checklist. Recarga la página e inténtalo de nuevo.',
  checklist_results_service_equipment_id_template_item_id_key: 'Esa respuesta del checklist ya se guardó desde otra ventana. Recarga la página.',
  services_code_key: 'Se creó otro servicio al mismo tiempo. Inténtalo de nuevo.',
  reports_number_version_key: 'Se generó otro informe al mismo tiempo. Inténtalo de nuevo.',
};

/** Restricciones CHECK (código 23514) */
const CHECK: Record<string, string> = {
  clients_ruc_check: 'El RUC debe tener 11 dígitos.',
  profiles_dni_check: 'El DNI debe tener 8 dígitos.',
  concepts_text_check: 'El texto no puede estar vacío.',
  photos_position_check: 'La posición de la foto no es válida.',
};

const NETWORK = 'No se pudo conectar con el servidor. Revisa tu conexión a internet e inténtalo de nuevo.';

const RULES: [RegExp, string | ((m: RegExpMatchArray) => string)][] = [
  [/duplicate key value violates unique constraint "([^"]+)"/i, (m) => UNIQUE[m[1]] ?? 'Ya existe un registro con esos datos.'],
  [/violates check constraint "([^"]+)"/i, (m) => CHECK[m[1]] ?? 'Uno de los datos tiene un valor no permitido.'],
  [/update or delete on table .* violates foreign key constraint/i,
    'No se puede eliminar porque tiene información asociada (por ejemplo, servicios, sedes o equipos).'],
  [/violates foreign key constraint/i, 'Uno de los datos seleccionados ya no existe. Recarga la página e inténtalo de nuevo.'],
  [/violates not-null constraint|null value in column/i, 'Falta completar un dato obligatorio.'],
  [/row-level security|permission denied|insufficient_privilege/i, 'No tienes permiso para realizar esta acción.'],
  [/value too long/i, 'Uno de los textos es demasiado largo.'],
  [/invalid input syntax|invalid input value/i, 'Uno de los datos tiene un formato no válido.'],
  [/out of range/i, 'Uno de los números está fuera del rango permitido.'],
  [/statement timeout|timed? ?out/i, 'El servidor tardó demasiado en responder. Inténtalo de nuevo.'],
  // Auth
  [/invalid login credentials/i, 'DNI o contraseña incorrectos.'],
  [/user is banned/i, 'Tu usuario está desactivado. Consulta con un administrador.'],
  [/password should be at least (\d+)/i, (m) => `La contraseña debe tener al menos ${m[1]} caracteres.`],
  [/password .*weak|weak password|pwned/i, 'Esa contraseña es muy fácil de adivinar. Elige otra.'],
  [/different from the old/i, 'La contraseña nueva debe ser distinta de la actual.'],
  [/jwt expired|invalid jwt|refresh token|auth session missing|session.*(expired|not found)/i,
    'Tu sesión venció. Vuelve a iniciar sesión.'],
  [/rate limit|too many requests|only request this after/i, 'Demasiados intentos. Espera un momento e inténtalo de nuevo.'],
  [/token has expired or is invalid|otp.*expired/i, 'El enlace no es válido o ya venció. Solicita uno nuevo.'],
  [/already (been )?registered/i, 'Ya existe un usuario con ese DNI.'],
  // Storage
  [/exceeded the maximum allowed size|payload too large|entity too large/i, 'El archivo es demasiado grande.'],
  [/mime type .* is not supported|invalid mime/i, 'Ese tipo de archivo no está permitido.'],
  [/the resource already exists/i, 'El archivo ya existe.'],
  [/object not found|not_found|bucket not found/i, 'No se encontró el archivo. Puede que se haya eliminado.'],
  // Red y Edge Functions
  [/failed to fetch|load failed|networkerror|network request failed|failed to send a request/i, NETWORK],
  [/non-2xx status code|edge function/i, 'El servidor no pudo completar la solicitud. Inténtalo de nuevo.'],
];

/** Mensaje en español para mostrar al usuario a partir de un error de cualquier origen */
export function friendlyError(e: unknown): string {
  const msg = typeof e === 'string' ? e : (e as any)?.message ? String((e as any).message) : String(e ?? '');
  if (!msg) return 'Ocurrió un error inesperado. Inténtalo de nuevo.';
  for (const [re, out] of RULES) {
    const m = msg.match(re);
    if (m) return typeof out === 'string' ? out : out(m);
  }
  return msg;
}
