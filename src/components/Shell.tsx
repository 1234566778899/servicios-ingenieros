import { useEffect, useState, type ReactNode } from 'react';
import {
  Avatar, Button, Caption1, mergeClasses, Menu, MenuItem, MenuList, MenuPopover, MenuTrigger, NavDrawer,
  NavDrawerBody, NavItem, NavSectionHeader, SearchBox, Text, makeStyles, tokens, MessageBar,
  MessageBarBody, MessageBarActions,
} from '@fluentui/react-components';
import {
  Home20Regular, Home20Filled, WrenchScrewdriver20Regular, WrenchScrewdriver20Filled, Box20Regular, Box20Filled,
  History20Regular, History20Filled, People20Regular, People20Filled, ShieldKeyhole20Regular, ShieldKeyhole20Filled,
  BookTemplate20Regular, BookTemplate20Filled, SignOut20Regular, ChevronDown16Regular, bundleIcon, Navigation20Regular,
} from '@fluentui/react-icons';
import logo from '../assets/logo.png';
import { useAuth } from '../lib/auth';
import { useRouter } from '../lib/router';
import { useConnection } from '../lib/connection';
import { useCatalogs } from '../lib/catalogs';
import { useCompact } from '../lib/media';

const Home = bundleIcon(Home20Filled, Home20Regular);
const Wrench = bundleIcon(WrenchScrewdriver20Filled, WrenchScrewdriver20Regular);
const BoxI = bundleIcon(Box20Filled, Box20Regular);
const Hist = bundleIcon(History20Filled, History20Regular);
const PeopleI = bundleIcon(People20Filled, People20Regular);
const Shield = bundleIcon(ShieldKeyhole20Filled, ShieldKeyhole20Regular);
const Book = bundleIcon(BookTemplate20Filled, BookTemplate20Regular);

const useStyles = makeStyles({
  root: { display: 'grid', gridTemplateColumns: 'auto 1fr', gridTemplateRows: '1fr', height: '100dvh', overflow: 'hidden' },
  rootCompact: { gridTemplateColumns: '1fr' },
  nav: { gridRow: '1', height: '100%', minWidth: '240px', width: '240px' },
  main: { display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, backgroundColor: tokens.colorNeutralBackground2 },
  topbar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px',
    padding: '8px 20px', '@media (max-width: 600px)': { padding: '8px 10px', gap: '8px' }, borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground1,
  },
  search: { width: '360px', maxWidth: '40vw', '@media (max-width: 900px)': { flex: 1, width: 'auto', maxWidth: 'none', minWidth: 0 } },
  content: { flex: 1, overflow: 'auto', padding: '20px 28px 28px', '@media (max-width: 600px)': { padding: '12px 12px 20px' } },
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
  const cat = useCatalogs();
  const [q, setQ] = useState('');
  const compact = useCompact();
  const [menuOpen, setMenuOpen] = useState(false);
  // Al navegar en modo compacto se cierra el menú
  useEffect(() => setMenuOpen(false), [path]);
  // Al volver la conexión se reintenta lo que no cargó
  useEffect(() => {
    if (conn.online && cat.error) cat.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conn.online]);

  const root = '/' + (path.split('/')[1] ?? '');
  const adminItems = ADMIN_ITEMS.filter((i) => can(i.perm));

  return (
    <div className={mergeClasses(s.root, compact && s.rootCompact)}>
      <NavDrawer
        open={compact ? menuOpen : true}
        type={compact ? 'overlay' : 'inline'}
        onOpenChange={(_, d) => setMenuOpen(d.open)}
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
          {compact && <Button appearance="subtle" icon={<Navigation20Regular />} aria-label="Abrir menú" onClick={() => setMenuOpen(true)} />}
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
                  {!compact && <Text weight="semibold">{profile?.full_name}</Text>}
                  {!compact && <Caption1>({roleName})</Caption1>}
                </span>
              </Button>
            </MenuTrigger>
            <MenuPopover>
              <MenuList>
                <MenuItem disabled>DNI {profile?.dni}{profile?.email ? ` · ${profile.email}` : ''}</MenuItem>
                <MenuItem icon={<SignOut20Regular />} onClick={signOut}>Cerrar sesión</MenuItem>
              </MenuList>
            </MenuPopover>
          </Menu>
        </header>
        {!conn.online && (
          <MessageBar intent="error" layout="singleline" style={{ borderRadius: 0 }}>
            <MessageBarBody>
              Sin conexión a Internet. No se pueden guardar ni consultar datos de la nube.
            </MessageBarBody>
            <MessageBarActions>
              <Button size="small" onClick={conn.retry}>Reintentar ahora</Button>
            </MessageBarActions>
          </MessageBar>
        )}
        {conn.online && cat.error && (
          <MessageBar intent="warning" layout="singleline" style={{ borderRadius: 0 }}>
            <MessageBarBody>
              No se pudieron cargar las listas de clientes, sedes o usuarios; algunos nombres o filtros pueden faltar.
            </MessageBarBody>
            <MessageBarActions>
              <Button size="small" onClick={() => void cat.reload()}>Reintentar</Button>
            </MessageBarActions>
          </MessageBar>
        )}
        <main className={s.content}>{children}</main>
      </div>
    </div>
  );
}
