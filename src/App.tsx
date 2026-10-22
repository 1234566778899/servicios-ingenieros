import { FluentProvider, Toaster, webLightTheme } from '@fluentui/react-components';
import { AuthProvider, useAuth } from './lib/auth';
import { CatalogsProvider } from './lib/catalogs';
import { ConnectionProvider } from './lib/connection';
import { RouterProvider, match, useRouter } from './lib/router';
import { Shell } from './components/Shell';
import { Loading } from './components/common';
import { Login } from './pages/Login';
import { Inicio } from './pages/Inicio';
import { Servicios } from './pages/Servicios';
import { ServicioDetalle } from './pages/ServicioDetalle';
import { ServicioWizard } from './pages/wizard/ServicioWizard';
import { Equipos } from './pages/Equipos';
import { EquipoFicha } from './pages/EquipoFicha';
import { Historial } from './pages/Historial';
import { Plantillas } from './pages/Plantillas';
import { Usuarios } from './pages/Usuarios';
import { Roles } from './pages/Roles';
import { Catalogos } from './pages/Catalogos';
import { NoPermitido } from './pages/NoPermitido';

import { TOASTER_ID } from './lib/toast';

function Routes() {
  const { path } = useRouter();
  const { can } = useAuth();

  let m: Record<string, string> | null;
  if (match('/', path)) return <Inicio />;
  if (match('/servicios', path)) return <Servicios />;
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
  const { session, profile, loading } = useAuth();
  if (loading) return <Loading label="Iniciando…" />;
  if (!session || !profile) return <Login />;
  return (
    <CatalogsProvider>
      <Shell>
        <Routes />
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
