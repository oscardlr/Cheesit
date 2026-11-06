import { COLORS, ROUTINE_COLOR_OPTIONS, ROUTINE_ICONS, resolvedRoutineIcon, type RoutineIconId } from '@/lib/model';
import RoutineIcon, { ROUTINE_ICON_LABELS } from './RoutineIcon';
import './routine-editor.css';

type Appearance = { color: string; icon?: RoutineIconId };

export default function TrainingAppearance({ color, icon, onChange }: Appearance & { onChange: (value: Partial<Appearance>) => void }) {
  return <>
    <fieldset className="color-field"><legend>Color</legend><div className="colors routine-colors">{ROUTINE_COLOR_OPTIONS.map(({ value: option, label }) => <button type="button" key={option} className={`color-choice ${color === option ? 'selected' : ''}`} style={{ backgroundColor: option }} aria-label={`Color ${label}`} aria-pressed={color === option} onClick={() => onChange({ color: option })}>{color === option ? '✓' : ''}</button>)}{!(COLORS as readonly string[]).includes(color) && <button type="button" className="color-choice legacy-color selected" style={{ backgroundColor: color }} aria-label="Color actual (anterior)" aria-pressed="true" title="Color actual (anterior)">✓</button>}</div></fieldset>
    <fieldset className="routine-icon-field"><legend>Icono</legend><div className="routine-icon-choices">{ROUTINE_ICONS.map(option => <button type="button" key={option} className={`routine-icon-choice ${resolvedRoutineIcon(icon) === option ? 'selected' : ''}`} aria-label={`Icono ${ROUTINE_ICON_LABELS[option]}`} aria-pressed={resolvedRoutineIcon(icon) === option} title={ROUTINE_ICON_LABELS[option]} onClick={() => onChange({ icon: option })}><RoutineIcon icon={option} size={22} /></button>)}</div></fieldset>
  </>;
}
