import { ArrowUpRight, type LucideIcon } from 'lucide-react';

export default function SectionCards({ cards, label }: {
  cards: { label: string; icon: LucideIcon; artwork?: string; open: () => void }[];
  label: string;
}) {
  return <div className="section-cards" role="group" aria-label={label}>
    {cards.map(({ label, icon: Icon, artwork, open }) => (
      <button type="button" key={label} className="section-card" onClick={open}>
        <Icon size={27} aria-hidden="true"/>
        {artwork && (
          <img
            className="section-card-art"
            src={`/assets/${artwork}.png`}
            alt=""
            width={480}
            height={480}
            decoding="async"
          />
        )}
        <strong>{label}</strong>
        {!artwork && <ArrowUpRight size={16} aria-hidden="true"/>}
      </button>
    ))}
  </div>;
}
