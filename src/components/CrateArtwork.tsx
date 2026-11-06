import { MASTER_CRATE_ID } from '@/lib/game';
import './crate-artwork.css';

const artwork = {
  ascent: '/assets/grind-chest-ascent.webp',
  [MASTER_CRATE_ID]: '/assets/grind-chest-master.webp',
  starter: '/assets/grind-chest-iron.png',
  charged: '/assets/grind-chest-energy.png',
  legend: '/assets/grind-chest-legend.png',
};

export default function CrateArtwork({ crateId, className = '' }: { crateId: string; className?: string }) {
  const tier = crateId.startsWith('level:') ? 'ascent' : crateId;
  const src = artwork[tier as keyof typeof artwork] ?? artwork.starter;
  const size = tier === 'ascent' ? 512 : tier === MASTER_CRATE_ID ? 640 : 1254;
  return <img className={`crate-illustration ${className}`} src={src} alt="" width={size} height={size} decoding="async" draggable={false} />;
}
