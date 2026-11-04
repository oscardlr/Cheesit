'use client';

import { useEffect, useId, useState } from 'react';
import { groupWith, supersetLabel, ungroup } from '@/lib/training-features';
import './training-controls.css';

export default function SupersetControl<T extends { id: string; supersetId?: string }>({ items, item, name, onChange, onAlternate }: {
  items: T[]; item: T; name: (item: T) => string; onChange: (items: T[]) => void; onAlternate?: (id: string) => void;
}) {
  const [pendingEnabled, setPendingEnabled] = useState(false);
  const optionsId = useId();
  const label = supersetLabel(items, item.id);
  // A group created from another exercise completes this local setup too.
  useEffect(() => { if (label) setPendingEnabled(false); }, [label]);
  const enabled = Boolean(label) || pendingEnabled;
  const members = items.filter(e => item.supersetId && e.supersetId === item.supersetId);
  const next = members[(members.findIndex(e => e.id === item.id) + 1) % Math.max(1, members.length)];
  const available = items.filter(e => e.id !== item.id && (!item.supersetId || e.supersetId !== item.supersetId));

  return <div className="superset-controls">
    <button type="button" className="superset-switch" role="switch" aria-label={`Superserie de ${name(item)}`} aria-checked={enabled} aria-controls={optionsId} onClick={() => {
      setPendingEnabled(!enabled);
      if (enabled && item.supersetId) onChange(ungroup(items, item.id));
    }}><span>Superserie</span><span className="superset-switch-track" aria-hidden="true"><span/></span><span className="superset-switch-state" aria-hidden="true">{enabled ? 'Sí' : 'No'}</span></button>
    {label && <div className="superset-membership"><strong className="superset-badge">{label} · Superserie</strong>{onAlternate && next && <button type="button" className="text-action" onClick={() => onAlternate(next.id)}>Ir a {supersetLabel(items, next.id)} →</button>}</div>}
    <div id={optionsId} className="superset-exercises" hidden={!enabled} role="group" aria-label={`Elegir ejercicio para la superserie de ${name(item)}`}>
      <span>{label ? 'Añadir otro ejercicio' : 'Elegir ejercicio'}</span>
      {available.length ? <div className="superset-exercise-buttons">{available.map(e => <button type="button" className="secondary" key={e.id} onClick={() => {
        onChange(groupWith(items, item.id, e.id));
        setPendingEnabled(false);
      }}>{name(e)}</button>)}</div> : <p className="muted">{label ? 'Todos los ejercicios ya están en esta superserie.' : 'Añade otro ejercicio para crear una superserie.'}</p>}
    </div>
  </div>;
}
