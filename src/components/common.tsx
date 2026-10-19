import { useState, type ReactElement, type ReactNode } from 'react';
import {
  Badge, Breadcrumb, Button, BreadcrumbButton, BreadcrumbDivider, BreadcrumbItem, MessageBar, MessageBarBody,
  Spinner, Text, Title2, makeStyles, tokens, type BadgeProps, type ButtonProps,
} from '@fluentui/react-components';
import { useRouter } from '../lib/router';

const useStyles = makeStyles({
  header: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '12px 16px', marginBottom: '16px', flexWrap: 'wrap' },
  titleBlock: { display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 },
  titleRow: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' },
  actions: { display: 'flex', gap: '8px', flexShrink: 0, flexWrap: 'wrap' },
  center: { display: 'flex', justifyContent: 'center', padding: '48px' },
  section: {
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusLarge,
    boxShadow: tokens.shadow4,
    padding: '16px 20px',
    overflowX: 'auto',
    minWidth: 0,
    '@media (max-width: 600px)': { padding: '12px' },
  },
  sectionHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', gap: '8px 12px', flexWrap: 'wrap' },
});

export interface Crumb { label: string; to?: string }

export function PageHeader({ crumbs, title, badges, actions }: {
  crumbs: Crumb[]; title: ReactNode; badges?: ReactNode; actions?: ReactNode;
}) {
  const s = useStyles();
  const { navigate } = useRouter();
  return (
    <div className={s.header}>
      <div className={s.titleBlock}>
        <Breadcrumb size="small">
          {crumbs.map((c, i) => (
            <span key={i} style={{ display: 'contents' }}>
              <BreadcrumbItem>
                <BreadcrumbButton current={i === crumbs.length - 1} onClick={c.to ? () => navigate(c.to!) : undefined}>
                  {c.label}
                </BreadcrumbButton>
              </BreadcrumbItem>
              {i < crumbs.length - 1 && <BreadcrumbDivider />}
            </span>
          ))}
        </Breadcrumb>
        <div className={s.titleRow}>
          <Title2>{title}</Title2>
          {badges}
        </div>
      </div>
      {actions && <div className={s.actions}>{actions}</div>}
    </div>
  );
}

export function Section({ title, subtitle, actions, children, className }: {
  title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string;
}) {
  const s = useStyles();
  return (
    <section className={`${s.section} ${className ?? ''}`}>
      {(title || actions) && (
        <div className={s.sectionHead}>
          <div>
            <Text weight="semibold" size={400}>{title}</Text>
            {subtitle && <Text size={200} style={{ color: tokens.colorNeutralForeground3, marginLeft: 8 }}>{subtitle}</Text>}
          </div>
          {actions && <div style={{ display: 'flex', gap: 8 }}>{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Loading({ label = 'Cargando…' }: { label?: string }) {
  const s = useStyles();
  return <div className={s.center}><Spinner label={label} /></div>;
}

/** Botón que se deshabilita y muestra un spinner mientras corre su acción asíncrona. */
export function AsyncButton({ onClick, loading, icon, disabled, ...props }: Pick<ButtonProps, 'appearance' | 'iconPosition' | 'size' | 'children'> & {
  onClick: () => unknown; loading?: boolean; icon?: ReactElement; disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const on = busy || !!loading;
  return (
    <Button {...props} icon={on ? <Spinner size="tiny" /> : icon} disabled={disabled || on}
      onClick={async () => {
        setBusy(true);
        try {
          await onClick();
        } finally {
          setBusy(false);
        }
      }} />
  );
}

export function ErrorBar({ error }: { error?: string | null }) {
  if (!error) return null;
  return (
    <MessageBar intent="error" style={{ marginBottom: 12 }}>
      <MessageBarBody>{error}</MessageBarBody>
    </MessageBar>
  );
}

const STATUS_COLORS: Record<string, BadgeProps['color']> = {
  'En registro': 'informative',
  'Fotos pendientes': 'warning',
  'Informe generado': 'success',
  Conforme: 'success',
  'No conforme': 'danger',
  Pendiente: 'warning',
  Activo: 'success',
  Inactivo: 'subtle',
  Activa: 'success',
  Borrador: 'informative',
  Inactiva: 'subtle',
  Alta: 'danger',
  Media: 'warning',
  Baja: 'informative',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge appearance="tint" color={STATUS_COLORS[status] ?? 'brand'} shape="rounded">
      {status}
    </Badge>
  );
}

export function useSharedStyles() {
  return useStyles();
}
