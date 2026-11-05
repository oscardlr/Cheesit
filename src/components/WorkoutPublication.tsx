'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Camera, Globe, ImagePlus, Trash2 } from 'lucide-react';
import type { WorkoutPublication as Publication } from '@/lib/model';
import { prepareWorkoutPhoto } from '@/lib/workout-publication';
import { downloadWorkoutPhoto, uploadWorkoutPhoto } from '@/lib/remote/feed';
import WorkoutCamera from './WorkoutCamera';
import './workout-publication.css';
import './training-controls.css';

/** Photos are private Storage objects; only the publication references a path. */
export default function WorkoutPublication({ owner, workoutId, value, onChange, onBusy, onCameraOpen, disabled = false }: {
  owner?: string; workoutId: string; value: Publication; onChange: (value: Publication) => void;
  onBusy: (busy: boolean) => void; onCameraOpen?: (open: boolean) => void; disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const captionId = useId();
  const nativeCamera = useRef<HTMLInputElement>(null);
  const cameraButton = useRef<HTMLButtonElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const alive = useRef(true);
  const [preparing, setPreparing] = useState(false);
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const [previewRevision, setPreviewRevision] = useState(0);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { onCameraOpen?.(cameraOpen); return () => onCameraOpen?.(false); }, [cameraOpen, onCameraOpen]);
  useEffect(() => {
    const controller = new AbortController();
    let url = '';
    setPreview('');
    if (value.photoPath && owner) void downloadWorkoutPhoto(value.photoPath, controller.signal).then(blob => {
      if (controller.signal.aborted) return;
      url = URL.createObjectURL(blob); setPreview(url);
    }).catch(() => { if (!controller.signal.aborted) setError('No se ha podido cargar la foto. Puedes reintentar o quitarla.'); });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [value.photoPath, owner, previewRevision]);

  async function select(file: File): Promise<boolean> {
    if (!owner || preparing) return false;
    setPreparing(true); onBusy(true); setError('');
    try {
      const optimized = await prepareWorkoutPhoto(file);
      const path = await uploadWorkoutPhoto(owner, workoutId, optimized);
      if (!alive.current) return false;
      onChange({ ...value, photoPath: path });
      return true;
    } catch (reason) {
      if (alive.current) setError(reason instanceof Error ? reason.message : 'No se ha podido subir la foto. Puedes publicar el entrenamiento sin foto.');
      return false;
    } finally {
      if (alive.current) { setPreparing(false); onBusy(false); }
    }
  }

  const closeCamera = () => { setCameraOpen(false); requestAnimationFrame(() => { if (alive.current) cameraButton.current?.focus(); }); };

  return <section className="workout-publication" aria-label="Publicación del entrenamiento">
    <div className="workout-publish-setting"><div><strong><Globe size={18}/>Publicar en Comunidad</strong><p>{owner ? 'La publicación respeta la privacidad de tu perfil en Ajustes. Tus notas siempre son privadas.' : 'Necesitas una cuenta para publicar. Tu entrenamiento se guardará en este navegador.'}</p></div>
      <button type="button" role="switch" className="superset-switch workout-publish-switch" aria-label="Publicar en Comunidad" aria-checked={!!owner && value.published} disabled={!owner || disabled || preparing || cameraOpen} onClick={() => onChange({ ...value, published: !value.published })}><span className="superset-switch-track" aria-hidden="true"><span/></span><span className="superset-switch-state" aria-hidden="true">{owner && value.published ? 'Sí' : 'No'}</span></button>
    </div>
    <div className="workout-caption-setting"><label htmlFor={captionId}>Descripción de la publicación <small>Opcional</small></label><textarea id={captionId} rows={3} maxLength={1000} placeholder="Escribe una descripción" value={value.caption ?? ''} disabled={!owner || disabled || preparing || cameraOpen} onChange={event => onChange({ ...value, caption: event.target.value })}/><div><p>Este texto aparecerá en tu publicación.</p><small>{value.caption?.length ?? 0}/1000</small></div></div>
    <div className="workout-photo-setting"><strong><Camera size={18}/>Foto del entrenamiento <small>Opcional</small></strong>
      {preview && <img className="workout-photo-preview" src={preview} alt="Vista previa de la foto del entrenamiento" width={600} height={450}/>}
      <div className="workout-photo-actions"><button type="button" className="secondary" disabled={!owner || disabled || preparing || cameraOpen} onClick={() => input.current?.click()}><ImagePlus size={17}/>{value.photoPath ? 'Cambiar foto' : 'Añadir foto'}</button>
        <button ref={cameraButton} type="button" className="secondary" disabled={!owner || disabled || preparing || cameraOpen} onClick={() => { setError(''); setCameraOpen(true); }}><Camera size={17}/>Hacer foto</button>
        {value.photoPath && <button type="button" className="text-action" disabled={disabled || preparing || cameraOpen} onClick={() => { onChange({ ...value, photoPath: undefined }); setError(''); }}><Trash2 size={16}/>Quitar foto</button>}
      </div>
      {cameraOpen && <WorkoutCamera disabled={disabled || preparing} onClose={closeCamera} onUse={async file => { const saved = await select(file); if (saved && alive.current) closeCamera(); return saved; }} onNativeCamera={() => { closeCamera(); nativeCamera.current?.click(); }}/>}
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Foto del entrenamiento" hidden disabled={!owner || disabled || preparing} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void select(file); }}/>
      <input ref={nativeCamera} type="file" accept="image/*" capture="environment" aria-label="Foto con la cámara del dispositivo" hidden disabled={!owner || disabled || preparing} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void select(file); }}/>
      <p>JPG, PNG o WebP · hasta 8 MB. {value.published ? 'La foto acompañará a tu publicación.' : 'La foto también se guardará en privado.'}</p>
      {preparing && <p role="status">Preparando y guardando la foto…</p>}
      {error && <div role="alert"><p>{error}</p>{value.photoPath && <button type="button" className="text-action" onClick={() => { setError(''); setPreviewRevision(n => n + 1); }}>Reintentar foto</button>}</div>}
    </div>
  </section>;
}
