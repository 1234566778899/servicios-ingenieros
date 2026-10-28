import { lazy, Suspense } from 'react';
import { FluentProvider, Toaster, webLightTheme } from '@fluentui/react-components';
import { AuthProvider, useAuth } from './lib/auth';
import { CatalogsProvider } from './lib/catalogs';
import { ConnectionProvider } from './lib/connection';
import { RouterProvider, match, useRouter } from './lib/router';
import { Shell } from './components/Shell';
import { Loading } from './components/common';
import { CambiarContrasena, Login, Restablecer } from './pages/Login';
import { Inicio } from './pages/Inicio';
import { Servicios } from './pages/Servicios';
import { NoPermitido } from './pages/NoPermitido';

// Pantallas que se descargan al abrirlas por primera vez (Inicio y Servicios van en la carga inicial)
const ServicioDetalle = lazy(() => import('./pages/ServicioDetalle').then((m) => ({ default: m.ServicioDetalle })));
const ServicioWizard = lazy(() => import('./pages/wizard/ServicioWizard').then((m) => ({ default: m.ServicioWizard })));
const Equipos = lazy(() => import('./pages/Equipos').then((m) => ({ default: m.Equipos })));
const EquipoFicha = lazy(() => import('./pages/EquipoFicha').then((m) => ({ default: m.EquipoFicha })));
const Historial = lazy(() => import('./pages/Historial').then((m) => ({ default: m.Historial })));
const Plantillas = lazy(() => import('./pages/Plantillas').then((m) => ({ default: m.Plantillas })));
const Usuarios = lazy(() => import('./pages/Usuarios').then((m) => ({ default: m.Usuarios })));
const Roles = lazy(() => import('./pages/Roles').then((m) => ({ default: m.Roles })));
const Catalogos = lazy(() => import('./pages/Catalogos').then((m) => ({ default: m.Catalogos })));

// Tras publicar una versión nueva, los archivos de la anterior ya no existen: recargar para tomar la nueva
window.addEventListener('vite:preloadError', () => {
  // Una sola vez por minuto: si el archivo falta por otra causa no se entra en un bucle de recargas
  const key = 'reloadedForUpdate';
  try {
    if (Date.now() - Number(sessionStorage.getItem(key) ?? 0) < 60_000) return;
    sessionStorage.setItem(key, String(Date.now()));
  } catch { /* sin almacenamiento */ }
  window.location.reload();
});

import { TOASTER_ID } from './lib/toast';

function Routes() {
  const { path } = useRouter();
  const { can } = useAuth();

  let m: Record<string, string> | null;
  if (match('/', path)) return <Inicio />;
  // key: una nueva búsqueda desde la barra superior (/servicios?q=…) reinicia filtros y página
  if (match('/servicios', path)) return <Servicios key={path} />;
  // Misma key en "nuevo" y "editar": al crear el servicio no se vuelve a montar el asistente
  if (match('/servicios/nuevo', path)) return can('servicios.crear') ? <ServicioWizard key="wizard" /> : <NoPermitido accion="Crear servicio" />;
  if ((m = match('/servicios/:id/editar', path))) return <ServicioWizard key="wizard" serviceId={m.id} />;
  if ((m = match('/servicios/:id', path))) return <ServicioDetalle key={m.id} id={m.id} />;
  if (match('/equipos', path)) return <Equipos />;
  if ((m = match('/equipos/:code', path))) return <EquipoFicha key={m.code} code={m.code} />;
  if (match('/historial', path)) return <Historial />;
  if (match('/historial/plantillas', path)) return <Plantillas />;
  if (match('/usuarios', path)) return can('usuarios.admin') ? <Usuarios /> : <NoPermitido accion="Administrar usuarios" />;
  if (match('/roles', path)) return can('usuarios.admin') ? <Roles /> : <NoPermitido accion="Administrar roles" />;
  if (match('/catalogos', path)) return <Catalogos />;
  return <Inicio />;
}

function Gate() {
  const { session, profile, loading, mustChangePassword } = useAuth();
  const { path } = useRouter();
  // El enlace del correo de recuperación se atiende aunque haya otra sesión abierta
  if (match('/restablecer', path)) return <Restablecer />;
  if (loading) return <Loading label="Iniciando…" />;
  if (!session || !profile) return <Login />;
  if (mustChangePassword) return <CambiarContrasena />;
  return (
    <CatalogsProvider>
      <Shell>
        <Suspense fallback={<Loading />}>
          <Routes />
        </Suspense>
      </Shell>
    </CatalogsProvider>
  );
}

export function App() {
  return (
    <FluentProvider theme={webLightTheme} style={{ height: '100%' }}>
      <ConnectionProvider>
        <AuthProvider>
          <RouterProvider>
            <Gate />
          </RouterProvider>
        </AuthProvider>
      </ConnectionProvider>
      <Toaster toasterId={TOASTER_ID} position="bottom-end" />
    </FluentProvider>
  );
}
