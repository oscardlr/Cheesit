'use client';

import { useImageFailure } from '@/lib/use-image-failure';
import './arcade-experience.css';

// The artwork is not a regular 2 × 2 sprite sheet: the bench and stairs cross
// the nominal cell boundaries. Keep each complete illustration in its own
// source viewport and preserve its aspect ratio instead of stretching a cell.
export const ATHLETE_POSES = {
  bench: '32 87 689 486',
  victory: '758 42 391 567',
  climb: '76 657 595 549',
  idle: '787 639 318 575',
} as const;

export default function PixelAthlete({ pose = 'idle', className = '', animated = true }: {
  pose?: 'bench' | 'victory' | 'climb' | 'idle'; className?: string; animated?: boolean;
}) {
  const [failed, fail] = useImageFailure('/assets/grind-athlete.png');
  return <span className={`pixel-athlete pixel-athlete-${pose} ${animated ? 'pixel-athlete-animated' : ''} ${className}`} aria-hidden="true" data-art-failed={failed || undefined}>
    <span className="pixel-athlete-art">
      {failed ? <svg viewBox="0 0 100 100" focusable="false" className="pixel-athlete-fallback"><path d="M20 35h12v30H20zM10 42h10v16H10zM32 46h36v8H32zM68 35h12v30H68zM80 42h10v16H80z" fill="currentColor" /></svg>
        : <svg viewBox={ATHLETE_POSES[pose]} preserveAspectRatio="xMidYMid meet" focusable="false"><image href="/assets/grind-athlete.png" width="1254" height="1254" onError={fail} /></svg>}
    </span>
  </span>;
}
