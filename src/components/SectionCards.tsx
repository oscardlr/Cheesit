import { ArrowUpRight, type LucideIcon } from 'lucide-react';

export default function SectionCards({ cards, label }: {
  cards: { label: string; icon: LucideIcon; open: () => void }[];
  label: string;
}) {
  return <div className="section-cards" role="group" aria-label={label}>
    {cards.map(({ label, icon: Icon, open }) => (
      <button type="button" key={label} className="section-card" onClick={open}>
        <Icon size={27} aria-hidden="true"/>
        <strong>{label}</strong>
        <ArrowUpRight size={16} aria-hidden="true"/>
      </button>
    ))}
  </div>;
}
