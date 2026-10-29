import { Activity, BicepsFlexed, Dumbbell, Flame, HeartPulse, Mountain, Target, Timer } from 'lucide-react';
import { resolvedRoutineIcon, type RoutineIconId } from '@/lib/model';

const ICONS = { dumbbell: Dumbbell, 'biceps-flexed': BicepsFlexed, target: Target, flame: Flame, activity: Activity, timer: Timer, mountain: Mountain, 'heart-pulse': HeartPulse };
export const ROUTINE_ICON_LABELS: Record<RoutineIconId, string> = { dumbbell: 'Mancuerna', 'biceps-flexed': 'Bíceps', target: 'Objetivo', flame: 'Llama', activity: 'Actividad', timer: 'Cronómetro', mountain: 'Montaña', 'heart-pulse': 'Corazón' };

export default function RoutineIcon({ icon, size = 20, className }: { icon?: RoutineIconId; size?: number; className?: string }) {
  const Icon = ICONS[resolvedRoutineIcon(icon)];
  return <Icon size={size} className={className} aria-hidden="true" />;
}
