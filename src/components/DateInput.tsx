import { DatePicker, type DatePickerProps } from '@fluentui/react-datepicker-compat';
import { fmtDate } from '../lib/format';

const strings: DatePickerProps['strings'] = {
  months: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'],
  shortMonths: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
  days: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
  shortDays: ['D', 'L', 'M', 'X', 'J', 'V', 'S'],
  goToToday: 'Ir a hoy',
  prevMonthAriaLabel: 'Mes anterior',
  nextMonthAriaLabel: 'Mes siguiente',
  prevYearAriaLabel: 'Año anterior',
  nextYearAriaLabel: 'Año siguiente',
  closeButtonAriaLabel: 'Cerrar',
};

const toIso = (d?: Date | null) =>
  d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '';

const fromIso = (s?: string | null) => {
  if (!s) return null;
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** DatePicker de Fluent que trabaja con fechas ISO (yyyy-mm-dd). */
export function DateInput({ value, onChange, placeholder = 'Seleccionar fecha', ...rest }: {
  value: string | null; onChange: (iso: string) => void; placeholder?: string;
} & Omit<DatePickerProps, 'value' | 'onSelectDate' | 'onChange'>) {
  return (
    <DatePicker
      {...rest}
      value={fromIso(value)}
      onSelectDate={(d) => onChange(toIso(d))}
      formatDate={(d) => (d ? fmtDate(toIso(d)) : '')}
      parseDateFromString={(s) => {
        const [d, m, y] = s.split('/').map(Number);
        return y && m && d ? new Date(y, m - 1, d) : null;
      }}
      allowTextInput
      firstDayOfWeek={1}
      strings={strings}
      placeholder={placeholder}
    />
  );
}
