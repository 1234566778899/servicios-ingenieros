import { Caption1, Text, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { useCatalogs } from '../lib/catalogs';
import type { ServiceEquipment } from '../lib/types';
import type { ReactNode } from 'react';

const useStyles = makeStyles({
  rail: { display: 'flex', flexDirection: 'column', gap: '4px' },
  item: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', textAlign: 'left',
    padding: '8px 10px', borderRadius: tokens.borderRadiusMedium, border: `1px solid transparent`,
    backgroundColor: 'transparent', cursor: 'pointer', font: 'inherit', color: 'inherit',
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  active: { backgroundColor: tokens.colorBrandBackground2, border: `1px solid ${tokens.colorBrandStroke2}`, ':hover': { backgroundColor: tokens.colorBrandBackground2Hover } },
});

/** Lista lateral de equipos del servicio usada en Checklist y Fotografías. */
export function EquipmentRail({ equipment, selected, onSelect, right, sub }: {
  equipment: ServiceEquipment[]; selected: string; onSelect: (id: string) => void; right: (e: ServiceEquipment) => ReactNode;
  sub?: (e: ServiceEquipment) => ReactNode;
}) {
  const s = useStyles();
  const cat = useCatalogs();
  return (
    <div className={s.rail} role="listbox" aria-label="Equipos del servicio">
      {equipment.map((e) => (
        <button key={e.id} role="option" aria-selected={e.id === selected} className={mergeClasses(s.item, e.id === selected && s.active)} onClick={() => onSelect(e.id)}>
          <div>
            <Text weight="semibold" block>{e.code}</Text>
            {sub ? sub(e) : <Caption1>{cat.typeName(e.equipment_type_id)}</Caption1>}
          </div>
          {right(e)}
        </button>
      ))}
    </div>
  );
}
