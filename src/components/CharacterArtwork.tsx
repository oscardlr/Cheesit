'use client';

import { type CSSProperties } from 'react';
import { GEAR } from '@/lib/gear';
import { CHARACTER_ART, CHARACTER_ATLAS, CHARACTER_VIEWBOX, type CharacterRect } from '@/lib/character-art';
import { useImageFailure } from '@/lib/use-image-failure';

/** Registered worn layers only. Catalog artwork lives in GearCatalogArtwork. */
export function AtlasImage({ source, target = source, id }: { source: CharacterRect; target?: CharacterRect; id: string }) {
  const [failed, fail] = useImageFailure(CHARACTER_ATLAS.src);
  const [x, y, width, height] = target;
  return <svg x={x} y={y} width={width} height={height} viewBox={source.join(' ')} preserveAspectRatio="xMidYMid meet" overflow="hidden" data-art-source={source.join(' ')}>
    {failed ? <g data-art-fallback={id}/> : <image href={CHARACTER_ATLAS.src} width={CHARACTER_ATLAS.width} height={CHARACTER_ATLAS.height} onError={fail}/>}
  </svg>;
}

export function CharacterGearArtwork({ gearId, worn = false, contentOnly = false, className = '' }: { gearId: string; worn?: boolean; contentOnly?: boolean; className?: string }) {
  const gear = GEAR.find(item => item.id === gearId), art = CHARACTER_ART[gearId];
  if (!gear || !art) return null;
  const content = <AtlasImage key={gearId} source={art.source} target={worn ? art.target : art.source} id={gearId}/>;
  if (contentOnly) return content;
  return <svg className={`${worn ? `character-equipped character-slot-${gear.slot}` : 'gear-sprite gear-forge'} rarity-${gear.rarity} ${className}`} viewBox={worn ? CHARACTER_VIEWBOX : art.source.join(' ')} preserveAspectRatio="xMidYMid meet" role="img" aria-label={gear.name} data-gear-id={gearId} data-rarity={gear.rarity} data-collection={gear.collection} data-avatar-fit={worn ? 'registered' : undefined} style={{ backgroundImage: 'none', '--gear-aura': { common: '#aeb8cc', rare: '#58aaff', epic: '#b68aff', legendary: '#ffcf63' }[gear.rarity] } as CSSProperties}>
    {!worn && <g className="gear-art-placeholder" aria-hidden="true"><rect x={art.source[0]} y={art.source[1]} width={art.source[2]} height={art.source[3]} rx="8" fill="currentColor" opacity=".05"/></g>}
    {content}
  </svg>;
}
