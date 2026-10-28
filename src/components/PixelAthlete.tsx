'use client';

import './arcade-experience.css';

export default function PixelAthlete({ pose = 'idle', className = '', animated = true }: {
  pose?: 'bench' | 'victory' | 'climb' | 'idle'; className?: string; animated?: boolean;
}) {
  return <span className={`pixel-athlete pixel-athlete-${pose} ${animated ? 'pixel-athlete-animated' : ''} ${className}`} aria-hidden="true"><span /></span>;
}
