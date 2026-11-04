'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw, SwitchCamera, X } from 'lucide-react';

function cameraError(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'No tenemos permiso para usar la cámara. Puedes permitirla en tu navegador y reintentar, o elegir una foto de tu galería.';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'No se ha encontrado una cámara en este dispositivo. Puedes añadir una foto de tu galería.';
  if (name === 'NotReadableError' || name === 'TrackStartError') return 'La cámara está ocupada o no se puede abrir. Cierra otras aplicaciones que la estén usando y reintenta.';
  return 'No se ha podido abrir la cámara. Puedes reintentar o añadir una foto de tu galería.';
}

/** The stream stays on this device. Only a photo explicitly accepted is uploaded. */
export default function WorkoutCamera({ onUse, onClose, onNativeCamera, disabled }: {
  onUse: (file: File) => Promise<boolean>; onClose: () => void; onNativeCamera: () => void; disabled: boolean;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [device, setDevice] = useState<string>();
  const [revision, setRevision] = useState(0);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mirrored, setMirrored] = useState(false);
  const [error, setError] = useState('');
  const [captured, setCaptured] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState('');
  const [capturing, setCapturing] = useState(false);
  const alive = useRef(true);
  const captureLock = useRef(false);

  function stopCamera() {
    const active = stream.current;
    stream.current = null;
    active?.getTracks().forEach(track => track.stop());
    if (video.current) video.current.srcObject = null;
  }

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (captured) { setLoading(false); return; }
    let cancelled = false;
    let acquired: MediaStream | undefined;
    const removed: (() => void)[] = [];
    setLoading(true); setReady(false); setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setLoading(false);
      setError(window.isSecureContext ? 'Este navegador no permite mostrar la cámara dentro de la app. Puedes usar la cámara del dispositivo o elegir una foto.' : 'La cámara necesita una conexión segura. Abre Cheesit mediante HTTPS o utiliza una foto de tu galería.');
      return;
    }
    void navigator.mediaDevices.getUserMedia({ audio: false, video: {
      ...(device ? { deviceId: { exact: device } } : { facingMode: { ideal: 'environment' } }),
      width: { ideal: 1600 }, height: { ideal: 1200 },
    } }).then(async media => {
      if (cancelled || document.visibilityState === 'hidden') { media.getTracks().forEach(track => track.stop()); return; }
      acquired = media; stream.current = media;
      const track = media.getVideoTracks()[0];
      setMirrored(track?.getSettings().facingMode === 'user');
      const ended = () => {
        if (!cancelled) { stopCamera(); setReady(false); setLoading(false); setError('La cámara se ha desconectado. Puedes reintentar o elegir una foto.'); }
      };
      track?.addEventListener('ended', ended);
      removed.push(() => track?.removeEventListener('ended', ended));
      const player = video.current;
      if (!player) { media.getTracks().forEach(item => item.stop()); return; }
      player.srcObject = media;
      await player.play();
      if (cancelled) return;
      setLoading(false);
      setReady(player.videoWidth > 0 && player.videoHeight > 0);
      // Device enumeration is optional; one camera is enough to take a photo.
      void navigator.mediaDevices.enumerateDevices?.().then(list => { if (!cancelled) setDevices(list.filter(item => item.kind === 'videoinput')); }).catch(() => undefined);
    }).catch(reason => {
      acquired?.getTracks().forEach(track => track.stop());
      if (!cancelled) { stream.current = null; setLoading(false); setReady(false); setError(cameraError(reason)); }
    });
    const hide = () => { if (document.visibilityState === 'hidden') { stopCamera(); close.current(); } };
    const leave = () => { stopCamera(); close.current(); };
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', leave);
    return () => {
      cancelled = true;
      removed.forEach(remove => remove());
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('pagehide', leave);
      acquired?.getTracks().forEach(track => track.stop());
      if (stream.current === acquired) stopCamera();
    };
  }, [captured, device, revision]);
  useEffect(() => {
    if (!captured) { setPhotoUrl(''); return; }
    const url = URL.createObjectURL(captured);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [captured]);

  async function capture() {
    const player = video.current;
    if (!player?.videoWidth || !ready || captureLock.current) return;
    captureLock.current = true; setCapturing(true); setError('');
    try {
      const scale = Math.min(1, 1600 / Math.max(player.videoWidth, player.videoHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(player.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(player.videoHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('No se ha podido tomar la foto.');
      context.drawImage(player, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('No se ha podido tomar la foto.')), 'image/jpeg', 0.9));
      if (!alive.current) return;
      stopCamera(); setReady(false); setCaptured(new File([blob], 'foto-del-entrenamiento.jpg', { type: 'image/jpeg' }));
    } catch { if (alive.current) setError('No se ha podido tomar la foto. Puedes volver a intentarlo.'); }
    finally { captureLock.current = false; if (alive.current) setCapturing(false); }
  }

  async function usePhoto() {
    if (!captured || captureLock.current || disabled) return;
    captureLock.current = true; setError('');
    try { if (!await onUse(captured) && alive.current) setError('No se ha podido guardar esta foto. Reintenta o cierra la cámara para continuar sin ella.'); }
    finally { captureLock.current = false; }
  }

  return <section className="workout-camera" aria-label="Cámara del entrenamiento">
    <header><strong><Camera size={17}/>{captured ? 'Revisar foto' : 'Cámara del entrenamiento'}</strong><button type="button" className="icon-button" aria-label="Cerrar cámara" disabled={disabled || capturing} onClick={onClose}><X size={20}/></button></header>
    {captured ? photoUrl && <img src={photoUrl} alt="Foto recién tomada" className="workout-camera-capture"/> : <video ref={video} className={mirrored ? 'workout-camera-video mirrored' : 'workout-camera-video'} autoPlay playsInline muted aria-label="Vista previa de la cámara" onLoadedData={() => { if (stream.current) setReady(true); }}/>}
    {loading && <p role="status">Abriendo cámara… Si tu navegador lo solicita, permite el acceso para tomar la foto.</p>}
    {error && <p className="error" role="alert">{error}</p>}
    <div className="workout-camera-actions">
      {captured ? <><button type="button" className="secondary" disabled={disabled} onClick={() => { setError(''); setCaptured(null); }}><RefreshCw size={16}/>Repetir foto</button><button type="button" className="primary" disabled={disabled} onClick={() => void usePhoto()}>Usar foto</button></> : <>
        <button type="button" className="primary" disabled={!ready || disabled || capturing} onClick={() => void capture()}><Camera size={17}/>{capturing ? 'Capturando…' : 'Tomar foto'}</button>
        {devices.length > 1 && <button type="button" className="secondary" disabled={loading || disabled || capturing} onClick={() => {
          const current = stream.current?.getVideoTracks()[0]?.getSettings().deviceId;
          const index = devices.findIndex(item => item.deviceId === current);
          setDevice(devices[(index + 1) % devices.length].deviceId);
        }}><SwitchCamera size={17}/>Cambiar cámara</button>}
        {error && <><button type="button" className="secondary" disabled={disabled} onClick={() => setRevision(n => n + 1)}>Reintentar cámara</button><button type="button" className="text-action" disabled={disabled} onClick={onNativeCamera}>Usar cámara del dispositivo</button></>}
      </>}
    </div>
    <p>{captured ? 'La cámara está apagada. Pulsa «Usar foto» para adjuntarla al entrenamiento.' : 'Solo se usa la cámara, sin micrófono. Podrás revisar la foto antes de adjuntarla.'}</p>
  </section>;
}
