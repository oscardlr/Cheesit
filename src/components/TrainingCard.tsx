'use client';
import { createPortal } from 'react-dom';
import { useEffect, useId, useRef, useState } from 'react';
import type { Appearance } from '@/lib/training-features';
import { CHARACTER_MASKS, CHARACTER_MASTER } from '@/lib/character-art';

export function AppearanceArtwork({ appearance }: { appearance: Appearance | null }) {
  const uid = useId().replace(/:/g, ''), hand = appearance?.layers.some(l => l.replacesHand);
  const layer = (l: NonNullable<Appearance>['layers'][number], foreground = false) => <g key={`${l.id}-${foreground}`} clipPath={foreground ? `url(#${uid}-${l.id})` : undefined}><svg x={l.target[0]} y={l.target[1]} width={l.target[2]} height={l.target[3]} viewBox={l.source.join(' ')} preserveAspectRatio="none"><image href={appearance!.atlas} width={appearance!.atlasWidth} height={appearance!.atlasHeight}/></svg></g>;
  return <g><ellipse cx={appearance?.companion ? 370 : 302} cy="440" rx={appearance?.companion ? 204 : 112} ry="19" fill="#d8ff3e" opacity=".28"/><svg x="170" y="142" width="265" height="335" viewBox="-60 -60 1265 1494"><defs><mask id={`${uid}-hand`}><rect x="-60" y="-60" width="1265" height="1494" fill="white"/><path d={CHARACTER_MASKS.handReplacement} fill="black"/></mask>{appearance?.layers.filter(l => l.foregroundMask).map(l => <clipPath key={l.id} id={`${uid}-${l.id}`}><path d={l.foregroundMask}/></clipPath>)}</defs>{appearance?.layers.filter(l => l.order === 0).map(l => layer(l))}<image href={appearance?.base ?? CHARACTER_MASTER.src} width="1145" height="1374" mask={hand ? `url(#${uid}-hand)` : undefined}/>{appearance?.layers.filter(l => l.order !== 0).map(l => layer(l))}{appearance?.layers.filter(l => l.foregroundMask).map(l => layer(l, true))}</svg>{appearance?.companion && <image href={appearance.companion} x="410" y="270" width="150" height="170" preserveAspectRatio="xMidYMid meet"/>}{!appearance && <text x="310" y="470" textAnchor="middle" fill="#bbb0c8" fontSize="13">Ilustración · apariencia histórica no registrada</text>}</g>;
}
const wrap = (text: string, size = 45) => {
  const lines: string[] = []; let line = '';
  for (const word of text.split(/\s+/)) { if (`${line} ${word}`.trim().length > size && line) { lines.push(line); line = word; } else line = `${line} ${word}`.trim(); }
  if (line) lines.push(line); return lines;
};
export default function TrainingCard({ title, description, date, appearance, identity, onClose }: { title: string; description: string; date: string; appearance: Appearance | null; identity?: string; onClose: () => void }) {
  const [showData, setShowData] = useState(true), [showDate, setShowDate] = useState(true), [showName, setShowName] = useState(false), [showArt, setShowArt] = useState(true), [status, setStatus] = useState(''), [busy, setBusy] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null), dialogRef = useRef<HTMLElement>(null);
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; dialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus(); const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = overflow; previous?.focus(); }; }, []);
  const titleLines = wrap(showData ? title : 'Un momento en Cheesit', 28).slice(0, 3);
  const limit = Math.max(3, Math.floor((775 - (558 + titleLines.length * 35)) / 23) + 1);
  const wrapped = wrap(description), lines = showData ? wrapped.slice(0, limit).map((line, i) => i === limit - 1 && wrapped.length > limit ? `${line.slice(0, -1)}…` : line) : ['Cada sesión escribe tu historia.'];
  const makeImage = async () => {
    if (!svgRef.current) throw new Error('No se ha cargado la previsualización.');
    const clone = svgRef.current.cloneNode(true) as SVGSVGElement;
    // Inline local assets so the exported PNG is self-contained and works offline after assets are cached.
    await Promise.all(Array.from(clone.querySelectorAll('image')).map(async image => {
      const href = image.getAttribute('href'); if (!href) return;
      const response = await fetch(href); if (!response.ok) throw new Error('Falta una imagen del personaje. Conecta y vuelve a intentarlo.');
      const blob = await response.blob();
      const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob); });
      image.setAttribute('href', data);
    }));
    const source = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' }), url = URL.createObjectURL(source);
    try {
      const img = new Image(); img.src = url; await img.decode();
      const canvas = document.createElement('canvas'); canvas.width = 1240; canvas.height = 1760;
      const context = canvas.getContext('2d'); if (!context) throw new Error('Tu navegador no permite exportar imágenes.');
      context.drawImage(img, 0, 0, 1240, 1760);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('No se pudo crear la imagen.')), 'image/png'));
      return new File([blob], 'mi-momento-cheesit.png', { type: 'image/png' });
    } finally { URL.revokeObjectURL(url); }
  };
  const exportImage = async (share: boolean) => { setBusy(true); setStatus('Preparando imagen…'); try { const file = await makeImage(); if (share) { if (!navigator.canShare?.({ files: [file] })) { setStatus('Este navegador no permite compartir archivos. Usa Descargar imagen y elige dónde compartirla.'); return; } await navigator.share({ files: [file] }); setStatus('Acción de compartir completada.'); } else { const url = URL.createObjectURL(file), a = document.createElement('a'); a.href = url; a.download = file.name; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); setStatus('Imagen descargada.'); } } catch (e) { setStatus(e instanceof Error && e.name === 'AbortError' ? 'Compartir cancelado.' : e instanceof Error ? e.message : 'No se ha podido exportar.'); } finally { setBusy(false); } };
  return createPortal(<div className="modal-shade training-preview-shade" onKeyDown={e => { if (e.key === 'Escape') onClose(); if (e.key === 'Tab') { const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input') ?? []); const first = controls[0], last = controls.at(-1); if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); } } }}><section ref={dialogRef} className="modal training-preview" role="dialog" aria-modal="true" aria-label="Previsualizar imagen"><div className="modal-head"><h2>Tu imagen, tus datos</h2><button className="icon-button" aria-label="Cerrar previsualización" onClick={onClose}>×</button></div><p>Privado por defecto. La imagen incluye solo lo que elijas aquí. Compartir abre una acción explícita de tu dispositivo.</p><div className="card-options">{[[showData, setShowData, 'Incluir título y datos'], [showDate, setShowDate, 'Incluir fecha o periodo'], [showName, setShowName, 'Incluir nombre del perfil'], [showArt, setShowArt, 'Incluir personaje y Cheesit']] .map(([checked, setter, label]) => <label className="check-label" key={label as string}><input type="checkbox" checked={checked as boolean} onChange={e => (setter as (v: boolean) => void)(e.target.checked)}/>{label as string}</label>)}</div><svg ref={svgRef} className="training-card-image" xmlns="http://www.w3.org/2000/svg" width="620" height="880" viewBox="0 0 620 880" role="img" aria-label="Previsualización de tu imagen"><rect width="620" height="880" rx="28" fill="#1b1425"/><rect x="24" y="24" width="572" height="832" rx="20" fill="#281d38" stroke="#74538e"/><text x="54" y="75" fill="#d8ff3e" fontSize="22" fontFamily="sans-serif" fontWeight="700">CHEESIT · TU HISTORIA</text>{showArt && <AppearanceArtwork appearance={appearance}/>}<g fontFamily="sans-serif">{titleLines.map((line, i) => <text x="54" y={510 + i * 35} fill="white" fontSize="28" fontWeight="700" key={i}>{line}</text>)}{showDate && <text x="54" y={520 + titleLines.length * 35} fill="#d8ff3e" fontSize="17">{date}</text>}{lines.map((line, i) => <text x="54" y={558 + titleLines.length * 35 + i * 23} fill="#e0d5ec" fontSize="18" key={i}>{line}</text>)}{showName && <text x="54" y="812" fill="#d8ff3e" fontSize="19">{(identity?.trim() || 'Atleta Cheesit').slice(0, 40)}</text>}</g></svg><div className="feature-actions"><button className="primary" disabled={busy} onClick={() => void exportImage(false)}>Descargar imagen PNG</button><button className="secondary" disabled={busy} onClick={() => void exportImage(true)}>Compartir imagen…</button></div>{status && <p role="status">{status}</p>}</section></div>, document.body);
}
