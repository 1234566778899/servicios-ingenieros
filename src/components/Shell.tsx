import { useState, type ReactNode } from 'react';
import {
  Avatar, Button, Caption1, Menu, MenuItem, MenuList, MenuPopover, MenuTrigger, NavDrawer,
  NavDrawerBody, NavItem, NavSectionHeader, SearchBox, Text, makeStyles, tokens, MessageBar,
  MessageBarBody, MessageBarActions,
} from '@fluentui/react-components';
import {
  Home20Regular, Home20Filled, WrenchScrewdriver20Regular, WrenchScrewdriver20Filled, Box20Regular, Box20Filled,
  History20Regular, History20Filled, People20Regular, People20Filled, ShieldKeyhole20Regular, ShieldKeyhole20Filled,
  BookTemplate20Regular, BookTemplate20Filled, SignOut20Regular, ChevronDown16Regular, bundleIcon,
  Circle12Filled,
} from '@fluentui/react-icons';
import logo from '../assets/logo.png';
import { useAuth } from '../lib/auth';
import { useRouter } from '../lib/router';
import { useConnection } from '../lib/connection';
import { fmtTime } from '../lib/format';

const Home = bundleIcon(Home20Filled, Home20Regular);
const Wrench = bundleIcon(WrenchScrewdriver20Filled, WrenchScrewdriver20Regular);
const BoxI = bundleIcon(Box20Filled, Box20Regular);
const Hist = bundleIcon(History20Filled, History20Regular);
const PeopleI = bundleIcon(People20Filled, People20Regular);
const Shield = bundleIcon(ShieldKeyhole20Filled, ShieldKeyhole20Regular);
const Book = bundleIcon(BookTemplate20Filled, BookTemplate20Regular);

const useStyles = makeStyles({
  root: { display: 'grid', gridTemplateColumns: 'auto 1fr', gridTemplateRows: '1fr auto', height: '100vh', overflow: 'hidden' },
  nav: { gridRow: '1', height: '100%', minWidth: '240px', width: '240px' },
  main: { display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, backgroundColor: tokens.colorNeutralBackground2 },
  topbar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px',
    padding: '8px 20px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground1,
  },
  search: { width: '360px', maxWidth: '40vw' },
  content: { flex: 1, overflow: 'auto', padding: '20px 28px 28px' },
  status: {
    gridColumn: '1 / span 2', display: 'flex', alignItems: 'center', gap: '20px', padding: '3px 16px',
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground2,
  },
  grow: { flex: 1 },
  userBtn: { display: 'flex', alignItems: 'center', gap: '8px' },
});

const ADMIN_ITEMS = [
  { value: '/usuarios', label: 'Usuarios', icon: <PeopleI />, perm: 'usuarios.admin' },
  { value: '/roles', label: 'Roles y permisos', icon: <Shield />, perm: 'usuarios.admin' },
  { value: '/catalogos', label: 'Catálogos y plantillas', icon: <Book />, perm: 'catalogos.admin' },
];

export function Shell({ children }: { children: ReactNode }) {
  const s = useStyles();
  const { profile, roleName, can, signOut } = useAuth();
  const { path, navigate } = useRouter();
  const conn = useConnection();
  const [q, setQ] = useState('');

  const root = '/' + (path.split('/')[1] ?? '');
  const adminItems = ADMIN_ITEMS.filter((i) => can(i.perm));

  return (
    <div className={s.root}>
      <NavDrawer
        open
        type="inline"
        className={s.nav}
        selectedValue={root}
        onNavItemSelect={(_, d) => navigate(d.value as string)}
      >
        <NavDrawerBody>
          <div style={{ padding: '14px 12px 18px' }}>
            <img src={logo} alt="Nórdico Ingenieros" style={{ width: '100%', maxWidth: 200, display: 'block' }} />
            <Caption1 style={{ color: tokens.colorNeutralForeground3, marginLeft: 4 }}>Informes técnicos</Caption1>
          </div>
          <NavItem value="/" icon={<Home />}>Inicio</NavItem>
          <NavItem value="/servicios" icon={<Wrench />}>Servicios</NavItem>
          <NavItem value="/equipos" icon={<BoxI />}>Equipos</NavItem>
          <NavItem value="/historial" icon={<Hist />}>Historial de informes</NavItem>
          {adminItems.length > 0 && <NavSectionHeader>Administración</NavSectionHeader>}
          {adminItems.map((i) => (
            <NavItem key={i.value} value={i.value} icon={i.icon}>{i.label}</NavItem>
          ))}
        </NavDrawerBody>
      </NavDrawer>

      <div className={s.main}>
        <header className={s.topbar}>
          <SearchBox
            className={s.search}
            placeholder="Buscar servicio, equipo o cliente…"
            value={q}
            onChange={(_, d) => setQ(d.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && q.trim()) navigate(`/servicios?q=${encodeURIComponent(q.trim())}`);
            }}
          />
          <Menu>
            <MenuTrigger>
              <Button appearance="subtle" icon={<ChevronDown16Regular />} iconPosition="after">
                <span className={s.userBtn}>
                  <Avatar name={profile?.full_name} size={24} />
                  <Text weight="semibold">{profile?.full_name}</Text>
                  <Caption1>({roleName})</Caption1>
                </span>
              </Button>
            </MenuTrigger>
            <MenuPopover>
              <MenuList>
                <MenuItem disabled>{profile?.email}</MenuItem>
                <MenuItem icon={<SignOut20Regular />} onClick={signOut}>Cerrar sesión</MenuItem>
              </MenuList>
            </MenuPopover>
          </Menu>
        </header>
        {!conn.online && (
          <MessageBar intent="error" layout="singleline" style={{ borderRadius: 0 }}>
            <MessageBarBody>
              Sin conexión a Internet. No se pueden guardar ni consultar datos de la nube. Reintentando en {conn.retryIn} s…
            </MessageBarBody>
            <MessageBarActions>
              <Button size="small" onClick={conn.retry}>Reintentar ahora</Button>
            </MessageBarActions>
          </MessageBar>
        )}
        <main className={s.content}>{children}</main>
      </div>

      <footer className={s.status}>
        <Caption1 style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Circle12Filled color={conn.online ? tokens.colorPaletteGreenForeground1 : tokens.colorPaletteRedForeground1} />
          {conn.online ? 'Conectado a la nube' : 'Sin conexión'}
        </Caption1>
        <Caption1>
          {conn.online
            ? `Última sincronización: ${conn.lastSync ? fmtTime(conn.lastSync) : '—'}`
            : `Último intento: ${conn.lastAttempt ? fmtTime(conn.lastAttempt) : '—'}`}
        </Caption1>
        <Caption1>Servidor: supabase · {import.meta.env.VITE_SUPABASE_URL.replace('https://', '').split('.')[0].slice(0, 8)}</Caption1>
        <span className={s.grow} />
        <Caption1>Usuario: {profile?.full_name} ({roleName})</Caption1>
        <Caption1>v{__APP_VERSION__}</Caption1>
      </footer>
    </div>
  );
}
