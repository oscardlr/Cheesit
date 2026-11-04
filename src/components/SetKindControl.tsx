'use client';

import type { SetKind } from '@/lib/model';
import './training-controls.css';

export default function SetKindControl({ label, value = 'work', onChange }: {
  label: string; value?: SetKind; onChange: (kind: SetKind) => void;
}) {
  return <div className="set-kind-control" role="group" aria-label={label}>
    <span className="set-kind-title">Tipo de serie</span>
    <div className="set-kind-buttons">
      <button type="button" aria-pressed={value === 'work'} onClick={() => { if (value !== 'work') onChange('work'); }}>Serie de trabajo</button>
      <button type="button" className="warmup-choice" aria-pressed={value === 'warmup'} onClick={() => { if (value !== 'warmup') onChange('warmup'); }}>Calentamiento</button>
    </div>
  </div>;
}
