import { useState } from 'react';
import {
  Button, Caption1, Card, Checkbox, Field, Input, Link, MessageBar, MessageBarBody, MessageBarTitle,
  Spinner, Subtitle1, Text, Title1, makeStyles, tokens,
} from '@fluentui/react-components';
import { Circle12Filled } from '@fluentui/react-icons';
import logoWhite from '../assets/logo-white.png';
import { useAuth } from '../lib/auth';
import { useConnection } from '../lib/connection';
import { supabase } from '../lib/supabase';

const REMEMBER_KEY = 'nordico.rememberedUser';

const useStyles = makeStyles({
  root: { display: 'grid', gridTemplateColumns: '1fr 1fr', height: '100vh' },
  brand: {
    backgroundColor: '#16233a', color: tokens.colorNeutralForegroundOnBrand,
    display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '64px', gap: '16px',
  },
  side: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.colorNeutralBackground2 },
  card: { width: '400px', padding: '28px', display: 'flex', flexDirection: 'column', gap: '16px' },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  footer: { marginTop: '16px', display: 'flex', alignItems: 'center', gap: '6px', color: tokens.colorNeutralForeground3 },
});

function readRemembered() {
  try {
    return localStorage.getItem(REMEMBER_KEY) ?? '';
  } catch {
    return '';
  }
}

export function Login() {
  const s = useStyles();
  const { signIn } = useAuth();
  const conn = useConnection();
  const [email, setEmail] = useState(readRemembered);
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(!!readRemembered());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signIn(email.trim(), password);
      try {
        if (remember) localStorage.setItem(REMEMBER_KEY, email.trim());
        else localStorage.removeItem(REMEMBER_KEY);
      } catch { /* almacenamiento no disponible */ }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const forgot = async () => {
    setError(null);
    if (!email.trim()) {
      setError('Escribe tu correo para enviarte el enlace de recuperación.');
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    if (error) setError(error.message);
    else setInfo(`Enviamos un enlace de recuperación a ${email.trim()}.`);
  };

  return (
    <div className={s.root}>
      <div className={s.brand}>
        <img src={logoWhite} alt="Nórdico Ingenieros — Servicios de Infraestructura" style={{ width: 380, maxWidth: '100%' }} />
        <Subtitle1 style={{ fontWeight: 400, maxWidth: 440 }}>
          Elaboración de informes técnicos de servicios: registra el servicio, sus equipos y fotografías, y genera el
          informe en Word o PDF.
        </Subtitle1>
      </div>
      <div className={s.side}>
        <form onSubmit={submit}>
        <Card className={s.card}>
          <div>
            <Title1 as="h1" style={{ fontSize: 24 }}>Iniciar sesión</Title1>
            <Text block style={{ color: tokens.colorNeutralForeground3 }}>
              Ingresa con tu usuario corporativo. Se requiere conexión a Internet.
            </Text>
          </div>
          {error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>}
          {info && <MessageBar intent="success"><MessageBarBody>{info}</MessageBarBody></MessageBar>}
          <Field label="Usuario o correo" required>
            <Input type="email" value={email} onChange={(_, d) => setEmail(d.value)} placeholder="usuario@nordico.pe" autoFocus={!email} />
          </Field>
          <Field label="Contraseña" required>
            <Input type="password" value={password} onChange={(_, d) => setPassword(d.value)} autoFocus={!!email} />
          </Field>
          <div className={s.row}>
            <Checkbox label="Recordar usuario" checked={remember} onChange={(_, d) => setRemember(!!d.checked)} />
            <Link as="button" type="button" onClick={forgot}>¿Olvidaste tu contraseña?</Link>
          </div>
          <Button appearance="primary" type="submit" disabled={busy || !conn.online || !email || !password}>
            {busy ? <Spinner size="tiny" /> : 'Ingresar'}
          </Button>
          {!conn.online && (
            <MessageBar intent="warning">
              <MessageBarBody>
                <MessageBarTitle>Sin conexión</MessageBarTitle>
                La aplicación necesita Internet para validar el usuario contra la base de datos en la nube.
              </MessageBarBody>
            </MessageBar>
          )}
        </Card>
        </form>
        <Caption1 className={s.footer}>
          <Circle12Filled color={conn.online ? tokens.colorPaletteGreenForeground1 : tokens.colorPaletteRedForeground1} />
          Servidor en la nube: {conn.online ? 'disponible' : 'no disponible'} · v{__APP_VERSION__}
        </Caption1>
      </div>
    </div>
  );
}
