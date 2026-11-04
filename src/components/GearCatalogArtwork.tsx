'use client';

import { useId, type CSSProperties } from 'react';
import { GEAR } from '@/lib/gear';
import { GEAR_CATALOG_ART } from '@/lib/gear-catalog-art';
import { useImageFailure } from '@/lib/use-image-failure';

export default function GearCatalogArtwork({ gearId, className = '' }: { gearId: string; className?: string }) {
  const id = useId(), gear = GEAR.find(g => g.id === gearId), art = GEAR_CATALOG_ART[gearId];
  const [failed, fail] = useImageFailure(art?.src ?? '');
  if (!gear) return null;
  if (!art || failed) return <span className={`gear-sprite gear-catalog-missing ${className}`} role="img" aria-label={`${gear.name}: imagen original no disponible`}>Imagen original no disponible</span>;
  return <svg className={`gear-sprite gear-catalog rarity-${gear.rarity} ${className}`} viewBox={art.source.join(' ')} preserveAspectRatio="xMidYMid meet" role="img" aria-label={gear.name} data-gear-id={gearId} data-catalog-source={art.src} style={{ backgroundImage: 'none', '--gear-aura': { common: '#aeb8cc', rare: '#58aaff', epic: '#b68aff', legendary: '#ffcf63' }[gear.rarity] } as CSSProperties}>
    {art.clip && <defs><clipPath id={id}><path d={art.clip}/></clipPath></defs>}
    <svg x={art.source[0]} y={art.source[1]} width={art.source[2]} height={art.source[3]} viewBox={art.source.join(' ')} overflow="hidden" preserveAspectRatio="xMidYMid meet">
      <image href={art.src} width={art.width} height={art.height} clipPath={art.clip ? `url(#${id})` : undefined} onError={fail}/>
    </svg>
  </svg>;
}
