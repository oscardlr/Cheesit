import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import './ability-details.css';

export default function AbilityDetails({ title, icon, children, className = '' }: { title: string; icon?: ReactNode; children: ReactNode; className?: string }) {
  return <details className={`ability-details ${className}`}>
    <summary>{icon}<span>{title}</span><ChevronDown className="ability-details-chevron" size={17} aria-hidden="true"/></summary>
    <div className="ability-details-body">{children}</div>
  </details>;
}
