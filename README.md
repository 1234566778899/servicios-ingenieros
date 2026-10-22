# Nórdico Ingenieros — Informes Técnicos de Servicios

Sistema para registrar servicios técnicos (equipos, checklist, fotografías y hallazgos) y generar el
informe del cliente en **Word** y **PDF**. Es una **aplicación web** (React + Vite) desplegada en Vercel.

- Interfaz: React 19 + [Fluent UI v9](https://react.fluentui.dev/)
- Backend: [Supabase](https://supabase.com/) (Postgres + Auth + Storage + Edge Functions)
- Informes: `docx` (Word) y vista HTML imprimible (PDF desde el navegador)

## Funcionalidades

| Módulo | Qué hace |
|---|---|
| Inicio | Indicadores, servicios recientes, informes por semana y actividad del equipo |
| Servicios | Listado con filtros y asistente de 6 pasos: datos → equipos → checklist → fotos → hallazgos → informe |
| Equipos | Inventario por código, ficha con historial de servicios y último checklist |
| Historial | Informes generados con versiones, descarga y exportación a CSV |
| Administración | Usuarios, roles y permisos, plantillas de checklist versionadas, catálogo de hallazgos, clientes y sedes |
| Trabajo simultáneo | Aviso en tiempo real de quién edita el mismo servicio y resolución de conflictos por campo |

Los permisos se aplican en la base de datos con **RLS**: la interfaz solo oculta lo que el rol no puede
hacer, pero quien protege los datos es Postgres.

## PDF

El informe en Word se genera y se guarda en la nube. El PDF se obtiene con **Imprimir / Guardar como PDF**
desde el navegador (paso “Informe” del asistente).

## Desarrollo local

Requisitos: Node 20+.

```bash
npm install
cp .env.example .env      # completa la URL y la clave publishable de Supabase
npm run dev               # http://localhost:5173
```

Otros comandos:

```bash
npm run build       # build web en dist/
npm run typecheck   # verificación de TypeScript
npm run preview     # sirve el build localmente
```

## Despliegue en Vercel

1. Importa este repositorio en Vercel (**Add New → Project**). La configuración ya está en `vercel.json`
   (Vite, salida `dist/` y cabeceras de seguridad).
2. La URL y la clave **publishable** de Supabase ya están en `.env.production` (son públicas por diseño).
   Si cambias de proyecto, edita ese archivo o define `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en
   **Settings → Environment Variables** (tienen prioridad).
3. Despliega.
4. En Supabase → **Authentication → URL Configuration**, agrega la URL de Vercel en *Site URL* y
   *Redirect URLs* (necesario para el enlace de "¿Olvidaste tu contraseña?").

> ⚠️ Nunca configures la clave `secret` / `service_role` en Vercel ni en `.env`: todo lo que empieza con
> `VITE_` queda dentro del JavaScript público. Las operaciones que la necesitan (crear y desactivar
> usuarios) viven en la Edge Function `admin-users`.

## Supabase

- Las tablas, políticas RLS, funciones y buckets (`photos`, `reports`) ya existen en el proyecto.
- Edge Function de administración de usuarios:

  ```bash
  supabase functions deploy admin-users --project-ref <ref-del-proyecto>
  ```

  Solo responde a usuarios activos con el permiso `usuarios.admin`.
- Para que un usuario nuevo pueda entrar necesita un registro en `public.profiles` con su rol
  (la pantalla **Usuarios** lo crea automáticamente).

## Estructura

```
src/
  components/        Shell, diálogos y piezas compartidas
  pages/             pantallas; pages/wizard/ = asistente de 6 pasos
  report/            modelo del informe, HTML (vista previa/PDF) y Word
  lib/               Supabase, sesión y permisos, catálogos, conexión, presencia
  assets/            logos
supabase/functions/  Edge Function admin-users
```
