'use client';

import { useRef, useState } from 'react';
import type { Workout, WorkoutPublication as Publication } from '@/lib/model';
import WorkoutPublication from './WorkoutPublication';

export default function PublicationEditor({ owner, workout, onSave }: {
  owner: string;
  workout: Workout;
  onSave: (publication: Publication) => Promise<void>;
}) {
  const [value, setValue] = useState<Publication>(workout.publication?.published
    ? workout.publication : { ...workout.publication, published: true });
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);

  async function save() {
    if (lock.current || photoBusy || cameraOpen) return;
    lock.current = true;
    setSaving(true);
    setError('');
    try {
      await onSave(value);
    } catch (reason) {
      const detail = reason instanceof Error ? reason.message : 'Comprueba la conexión.';
      setError(`Tu entrenamiento está guardado. El cambio de publicación sigue sin confirmar. ${detail}`);
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }

  return <section className="form-card">
    <h2>{workout.name}</h2>
    <WorkoutPublication owner={owner} workoutId={workout.id} value={value} onChange={setValue}
      onBusy={setPhotoBusy} onCameraOpen={setCameraOpen} disabled={saving}/>
    {error && <p className="notice" role="alert">{error}</p>}
    <button type="button" className="primary wide" disabled={saving || photoBusy || cameraOpen} onClick={() => void save()}>
      {saving ? 'Confirmando…' : error ? 'Reintentar publicación' : value.published ? 'Publicar en Comunidad' : 'Guardar como privada'}
    </button>
  </section>;
}
