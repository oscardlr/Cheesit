import { useId, type CSSProperties } from 'react';
import { GEAR } from '@/lib/gear';
import { GEAR_ART, GEAR_ART_ATLAS } from '@/lib/gear-art';
import { AVATAR_SLOT_ORDER, AVATAR_VIEWBOX, SHORTS_SILHOUETTE, TORSO_SILHOUETTE, type SpriteRect } from '@/lib/avatar-fit';

const aura = { common: '#aeb8cc', rare: '#58aaff', epic: '#b68aff', legendary: '#ffcf63' };

/** Crop before scaling: transparent icon padding must never reveal a neighbouring cell. */
function AtlasSprite({ source, target = source, sourceClip }: { source: SpriteRect; target?: SpriteRect; sourceClip?: string }) {
  const id = useId();
  const [x, y, width, height] = target;
  return <svg x={x} y={y} width={width} height={height} viewBox={source.join(' ')} preserveAspectRatio="none" overflow="hidden">
    {sourceClip && <defs><clipPath id={`${id}-source`}><path d={sourceClip}/></clipPath></defs>}
    <g clipPath={sourceClip ? `url(#${id}-source)` : undefined}>
      <image href={GEAR_ART_ATLAS.src} width={GEAR_ART_ATLAS.width} height={GEAR_ART_ATLAS.height} style={{ imageRendering: 'pixelated' }}/>
    </g>
  </svg>;
}

/** Inventory and articulated equipment use the same original raster sprite. */
export function GearArtwork({ gearId, worn = false, contentOnly = false, className = '' }: { gearId: string; worn?: boolean; contentOnly?: boolean; className?: string }) {
  const id = useId();
  const gear = GEAR.find(item => item.id === gearId);
  const art = GEAR_ART[gearId];
  if (!gear || !art || gear.artwork !== 'forge') return null;

  const silhouette = art.silhouette === 'torso' ? TORSO_SILHOUETTE : art.silhouette === 'shorts' ? SHORTS_SILHOUETTE : undefined;
  const fitted = <g shapeRendering="crispEdges" data-artwork="raster-atlas">
    {silhouette && <defs><clipPath id={`${id}-body`}><path d={silhouette}/></clipPath></defs>}
    <g clipPath={silhouette ? `url(#${id}-body)` : undefined}>
      {art.fabric && <path d={silhouette ?? SHORTS_SILHOUETTE} fill={art.fabric}/>}
      <AtlasSprite source={art.source} target={art.bounds} sourceClip={art.sourceClip}/>
    </g>
  </g>;
  if (contentOnly) return fitted;

  const style = {
    '--gear-aura': aura[gear.rarity],
    backgroundImage: 'none',
    imageRendering: 'pixelated',
    ...(worn ? { zIndex: gear.slot === 'back' ? 0 : AVATAR_SLOT_ORDER[gear.slot] + 2 } : {}),
  } as CSSProperties;
  return <svg
    className={`${worn ? `character-equipped character-slot-${gear.slot} character-gear-${gear.id}` : 'gear-sprite gear-forge'} rarity-${gear.rarity} ${className}`}
    viewBox={worn ? AVATAR_VIEWBOX : art.source.join(' ')}
    preserveAspectRatio="xMidYMid meet" shapeRendering="crispEdges" style={style} role="img" aria-label={gear.name}
    data-gear-id={gear.id} data-rarity={gear.rarity} data-collection={gear.collection} data-avatar-fit={worn ? 'anatomical' : undefined}
  >{worn ? fitted : <AtlasSprite source={art.source} sourceClip={art.sourceClip}/>}</svg>;
}
