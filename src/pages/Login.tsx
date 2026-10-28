import { useEffect, useState, type ReactNode } from 'react';
import {
  Button, Card, Checkbox, Field, Input, Link, MessageBar, MessageBarBody, MessageBarTitle,
  Spinner, Subtitle1, Text, Title1, makeStyles, tokens,
} from '@fluentui/react-components';
import { PersonKey20Regular } from '@fluentui/react-icons';
import logoWhite from '../assets/logo-white.png';
import { useAuth } from '../lib/auth';
import { useConnection } from '../lib/connection';
import { useRouter } from '../lib/router';
import { supabase } from '../lib/supabase';
import { friendlyError } from '../lib/errors';

const REMEMBER_KEY = 'nordico.rememberedDni';
// Cuenta de demostración (solo se muestra si está configurada en .env)
const DEMO_DNI = import.meta.env.VITE_DEMO_DNI as string | undefined;
const DEMO_PASSWORD = import.meta.env.VITE_DEMO_PASSWORD as string | undefined;

const useStyles = makeStyles({
  root: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', height: '100dvh', overflowY: 'auto', '@media (max-width: 800px)': { gridTemplateColumns: 'minmax(0, 1fr)', gridTemplateRows: 'auto 1fr' } },
  brand: {
    backgroundColor: '#16233a', color: tokens.colorNeutralForegroundOnBrand,
    display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '64px', gap: '16px',
    '@media (max-width: 800px)': { padding: '24px 20px' },
  },
  side: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.colorNeutralBackground2, padding: '16px' },
  card: { width: '100%', maxWidth: '400px', boxSizing: 'border-box', padding: '28px', display: 'flex', flexDirection: 'column', gap: '16px', '@media (max-width: 600px)': { padding: '20px' } },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  demo: { width: '100%', maxWidth: '400px', boxSizing: 'border-box', marginTop: '12px' },
  demoRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' },
});

const onlyDigits = (v: string) => v.replace(/\D/g, '').slice(0, 8);

function readRemembered() {
  try {
    return localStorage.getItem(REMEMBER_KEY) ?? '';
  } catch {
    return '';
  }
}

/** Marco de las pantallas sin sesión: logo a la izquierda y el formulario a la derecha. */
function AuthLayout({ children, after }: { children: ReactNode; after?: ReactNode }) {
  const s = useStyles();
  return (
    <div className={s.root}>
      <div className={s.brand}>
        <img src={logoWhite} alt="Nórdico Ingenieros — Servicios de Infraestructura" style={{ width: 380, maxWidth: '80%' }} />
        <Subtitle1 style={{ fontWeight: 400, maxWidth: 440 }}>
          Elaboración de informes técnicos de servicios: registra el servicio, sus equipos y fotografías, y genera el
          informe en Word o PDF.
        </Subtitle1>
      </div>
      <div className={s.side}>
        {children}
        {after}
      </div>
    </div>
  );
}

function OfflineBar() {
  const conn = useConnection();
  if (conn.online) return null;
  return (
    <MessageBar intent="warning">
      <MessageBarBody>
        <MessageBarTitle>Sin conexión</MessageBarTitle>
        La aplicación necesita Internet para validar el usuario contra la base de datos en la nube.
      </MessageBarBody>
    </MessageBar>
  );
}

export function Login() {
  const s = useStyles();
  const { signIn } = useAuth();
  const conn = useConnection();
  const [dni, setDni] = useState(readRemembered);
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(!!readRemembered());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (dni.length !== 8) return setError('El DNI debe tener 8 dígitos.');
    setBusy(true);
    try {
      await signIn(dni, password);
      try {
        if (remember) localStorage.setItem(REMEMBER_KEY, dni);
        else localStorage.removeItem(REMEMBER_KEY);
      } catch { /* almacenamiento no disponible */ }
    } catch (err: any) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const forgot = async () => {
    setError(null);
    setInfo(null);
    if (dni.length !== 8) {
      setError('Escribe tu DNI para enviarte el enlace de recuperación a tu correo registrado.');
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('recuperar-contrasena', { body: { dni } });
    setBusy(false);
    if (error) {
      const detail = await (error as any).context?.json?.().catch(() => null);
      setError(friendlyError(detail?.error ?? error));
    } else setInfo(data.message);
  };

  return (
    <AuthLayout
      after={DEMO_DNI && DEMO_PASSWORD && (
        <MessageBar intent="info" layout="multiline" className={s.demo} icon={<PersonKey20Regular />}>
          <MessageBarBody>
            <MessageBarTitle>Credenciales de prueba</MessageBarTitle>
            <div className={s.demoRow}>
              <span>
                DNI: <b>{DEMO_DNI}</b>
                <br />
                Contraseña: <b>{DEMO_PASSWORD}</b>
              </span>
              <Button size="small" onClick={() => { setDni(DEMO_DNI); setPassword(DEMO_PASSWORD); setError(null); }}>
                Usar credenciales
              </Button>
            </div>
          </MessageBarBody>
        </MessageBar>
      )}
    >
      <form onSubmit={submit} style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
        <Card className={s.card}>
          <div>
            <Title1 as="h1" style={{ fontSize: 24 }}>Iniciar sesión</Title1>
            <Text block style={{ color: tokens.colorNeutralForeground3 }}>
              Ingresa con tu DNI. La primera vez tu contraseña es tu mismo DNI.
            </Text>
          </div>
          {error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>}
          {info && <MessageBar intent="success" layout="multiline"><MessageBarBody>{info}</MessageBarBody></MessageBar>}
          <Field label="DNI" required>
            <Input inputMode="numeric" autoComplete="username" maxLength={8} value={dni}
              onChange={(_, d) => setDni(onlyDigits(d.value))} placeholder="8 dígitos" autoFocus={!dni} />
          </Field>
          <Field label="Contraseña" required>
            <Input type="password" autoComplete="current-password" value={password} onChange={(_, d) => setPassword(d.value)} autoFocus={!!dni} />
          </Field>
          <div className={s.row}>
            <Checkbox label="Recordar DNI" checked={remember} onChange={(_, d) => setRemember(!!d.checked)} />
            <Link as="button" type="button" onClick={forgot} disabled={busy}>¿Olvidaste tu contraseña?</Link>
          </div>
          <Button appearance="primary" type="submit" disabled={busy || !conn.online || !dni || !password}>
            {busy ? <Spinner size="tiny" /> : 'Ingresar'}
          </Button>
          <OfflineBar />
        </Card>
      </form>
    </AuthLayout>
  );
}

/** Primer ingreso o enlace de recuperación: el usuario define su contraseña antes de usar la aplicación. */
export function CambiarContrasena() {
  const s = useStyles();
  const { profile, changePassword, signOut } = useAuth();
  const conn = useConnection();
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.');
    if (password === profile?.dni) return setError('La contraseña no puede ser tu DNI.');
    if (password !== repeat) return setError('Las contraseñas no coinciden.');
    setBusy(true);
    try {
      await changePassword(password);
    } catch (err: any) {
      setError(friendlyError(err));
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <form onSubmit={submit} style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
        <Card className={s.card}>
          <div>
            <Title1 as="h1" style={{ fontSize: 24 }}>Crea tu contraseña</Title1>
            <Text block style={{ color: tokens.colorNeutralForeground3 }}>
              Hola {profile?.full_name}. Antes de continuar, define una contraseña nueva que solo tú conozcas.
            </Text>
          </div>
          {error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>}
          <Field label="Contraseña nueva" required hint="Mínimo 8 caracteres y distinta de tu DNI.">
            <Input type="password" autoComplete="new-password" value={password} onChange={(_, d) => setPassword(d.value)} autoFocus />
          </Field>
          <Field label="Repite la contraseña" required>
            <Input type="password" autoComplete="new-password" value={repeat} onChange={(_, d) => setRepeat(d.value)} />
          </Field>
          <Button appearance="primary" type="submit" disabled={busy || !conn.online || !password || !repeat}>
            {busy ? <Spinner size="tiny" /> : 'Guardar y continuar'}
          </Button>
          <Link as="button" type="button" onClick={signOut} disabled={busy}>Cancelar y cerrar sesión</Link>
          <OfflineBar />
        </Card>
      </form>
    </AuthLayout>
  );
}

/** Destino del enlace del correo (#/restablecer?token=…): valida el token y pasa a "Crea tu contraseña". */
export function Restablecer() {
  const s = useStyles();
  const { recover } = useAuth();
  const { path, navigate } = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = new URLSearchParams(path.split('?')[1] ?? '').get('token');
    if (!token) return setError('El enlace está incompleto. Solicita uno nuevo desde «¿Olvidaste tu contraseña?».');
    recover(token).then(() => navigate('/')).catch((e) => setError(friendlyError(e)));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AuthLayout>
      <Card className={s.card}>
        <Title1 as="h1" style={{ fontSize: 24 }}>Restablecer contraseña</Title1>
        {error
          ? <MessageBar intent="error" layout="multiline"><MessageBarBody>{error}</MessageBarBody></MessageBar>
          : <Spinner label="Validando enlace…" />}
        {error && <Button appearance="primary" onClick={() => navigate('/')}>Ir a iniciar sesión</Button>}
      </Card>
    </AuthLayout>
  );
}
