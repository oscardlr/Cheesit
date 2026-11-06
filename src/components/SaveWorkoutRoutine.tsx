'use client';

import { useRef, useState } from 'react';
import { newId, type Workout } from '@/lib/model';

export type SaveRoutineFromWorkout = (workout: Workout, routineId: string) => Promise<void>;

export default function SaveWorkoutRoutine({ workout, onSave }: { workout: Workout; onSave: SaveRoutineFromWorkout }) {
  const operation = useRef<{ id: string; saving: boolean } | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState('');

  async function save() {
    const request = operation.current ??= { id: newId(), saving: false };
    if (request.saving || status === 'saved') return;
    request.saving = true;
    setStatus('saving');
    try {
      await onSave(workout, request.id);
      setStatus('saved');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se ha podido guardar la rutina.');
      setStatus('error');
    } finally {
      request.saving = false;
    }
  }

  return <>
    <button type="button" className="secondary wide" disabled={status === 'saving' || status === 'saved'} onClick={() => void save()}>Guardar rutina</button>
    {status === 'saved' && <p className="notice" role="status">Rutina guardada en Mis rutinas.</p>}
    {status === 'error' && <p className="notice" role="alert">{error}</p>}
  </>;
}
