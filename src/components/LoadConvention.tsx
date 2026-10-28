import { Dumbbell } from 'lucide-react';
import type { WorkoutExercise } from '@/lib/model';
import { exerciseLoadConvention, type AthleteProfile } from '@/lib/strength';
import './load-convention.css';

export default function LoadConvention({ exercise, profile }: {
  exercise: Pick<WorkoutExercise, 'exerciseId' | 'mode'>;
  profile?: AthleteProfile;
}) {
  const convention = exerciseLoadConvention(exercise, profile);
  if (!convention.isDumbbell) return null;
  return <p className="load-convention" role="note">
    <Dumbbell size={16} aria-hidden="true" />
    <span><strong>{convention.heading}</strong><span>{convention.hint}</span></span>
  </p>;
}
