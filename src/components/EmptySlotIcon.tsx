import { Hand } from 'lucide-react';
import type { GearSlot } from '@/lib/gear';

/** Shared 24px line vocabulary, including categories without a Lucide symbol. */
export default function EmptySlotIcon({ slot }: { slot: GearSlot | 'companion' }) {
  if (slot === 'hand') return <Hand className="empty-slot-icon" size={28} strokeWidth={1.7} aria-hidden="true"/>;
  return <svg className="empty-slot-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {slot === 'head' && <><path d="M8 21v-4c-3-2-4-5-3-8a7 7 0 0 1 13 0l2 4h-3v5h-4v3"/><path d="M15 9h.01"/></>}
    {slot === 'top' && <><path d="m8 3-5 4 3 5 2-1-1 10h10l-1-10 2 1 3-5-5-4"/><path d="M8 3c0 5 8 5 8 0M12 9v7M9 12l3 1 3-1"/></>}
    {slot === 'back' && <><path d="m8 3-5 4 3 5 2-1-1 10h10l-1-10 2 1 3-5-5-4M8 3h8M12 4v13"/><path d="m7 7 3 3m7-3-3 3M9 18h6"/></>}
    {slot === 'bottom' && <><path d="M6 3h12l2 18h-6l-2-11-2 11H4L6 3ZM6 6h12M12 3v7"/><path d="m6 7 3 3m9-3-3 3"/></>}
    {slot === 'companion' && <><circle cx="12" cy="4" r="2.5"/><path d="M8.5 8.5h7L14 13l4 6h-4l-1 3h-2l-1-3H6l4-6-1.5-4.5ZM8.5 8.5 6 14m9.5-5.5L18 14"/></>}
  </svg>;
}
