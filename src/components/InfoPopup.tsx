'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Info, X } from 'lucide-react';
import './info-popup.css';

export default function InfoPopup({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <>
    <button type="button" className="info-popup-trigger" aria-label={`Información sobre ${title}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}><Info size={19} aria-hidden="true"/></button>
    {open && createPortal(<InfoDialog id={id} title={title} onClose={() => setOpen(false)}>{children}</InfoDialog>, document.body)}
  </>;
}

function InfoDialog({ id, title, children, onClose }: { id: string; title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const overflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = 'hidden';
    return () => { dialog?.close(); document.body.style.overflow = overflow; };
  }, []);
  return <dialog ref={ref} className="info-popup" aria-labelledby={`${id}-title`} aria-describedby={`${id}-body`} onClose={event => { if (!event.currentTarget.open) onClose(); }} onClick={event => {
    if (event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) ref.current?.close();
  }}>
    <header><h2 id={`${id}-title`}>{title}</h2><button type="button" className="info-popup-close" aria-label="Cerrar información" onClick={() => ref.current?.close()}><X size={21} aria-hidden="true"/></button></header>
    <div className="info-popup-body" id={`${id}-body`}>{children}</div>
  </dialog>;
}
