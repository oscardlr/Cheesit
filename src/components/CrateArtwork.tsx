import { MASTER_CRATE_ID } from '@/lib/game';
import './crate-artwork.css';

const artwork = {
  [MASTER_CRATE_ID]: '/assets/grind-chest-master.webp',
  starter: '/assets/grind-chest-iron.png',
  charged: '/assets/grind-chest-energy.png',
  legend: '/assets/grind-chest-legend.png',
};

/** Level rewards share the chest design of their corresponding reward tier. */
export default function CrateArtwork({ crateId, className = '' }: { crateId: string; className?: string }) {
  const level = Number(crateId.split(':').at(-1));
  const tier = crateId.startsWith('level:') ? level % 10 === 0 ? 'legend' : level % 5 === 0 ? 'charged' : 'starter' : crateId;
  const src = artwork[tier as keyof typeof artwork] ?? artwork.starter;
  const isMaster = tier === MASTER_CRATE_ID;
  return <img className={`crate-illustration ${isMaster ? 'crate-illustration-master ' : ''}${className}`} src={src} alt="" width={isMaster ? 640 : 1254} height={isMaster ? 427 : 1254} decoding="async" draggable={false} />;
}
