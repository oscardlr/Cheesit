import './crate-artwork.css';

const artwork = {
  starter: '/assets/grind-chest-iron.png',
  charged: '/assets/grind-chest-energy.png',
  legend: '/assets/grind-chest-legend.png',
};

/** Level rewards share the chest design of their corresponding reward tier. */
export default function CrateArtwork({ crateId, className = '' }: { crateId: string; className?: string }) {
  const level = Number(crateId.split(':')[1]);
  const tier = crateId.startsWith('level:') ? level % 10 === 0 ? 'legend' : level % 5 === 0 ? 'charged' : 'starter' : crateId;
  const src = artwork[tier as keyof typeof artwork] ?? artwork.starter;
  return <img className={`crate-illustration ${className}`} src={src} alt="" width={1254} height={1254} decoding="async" draggable={false} />;
}
