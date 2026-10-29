'use client';

import { useEffect, useRef, useState } from 'react';

type Watch = { visible: boolean; update: (running: boolean) => void };
const watches = new Map<Element, Watch>();
let observer: IntersectionObserver | undefined;
const publishVisibility = () => watches.forEach(watch => watch.update(watch.visible && document.visibilityState !== 'hidden'));

/** One observer and page visibility listener shared by every mounted portrait. */
export function useVisibleMotion(enabled: boolean) {
  const ref = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || !enabled) return;
    if (!watches.size) document.addEventListener('visibilitychange', publishVisibility);
    if (!observer && typeof IntersectionObserver !== 'undefined') observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const watch = watches.get(entry.target);
        if (watch) { watch.visible = entry.isIntersecting; watch.update(entry.isIntersecting && document.visibilityState !== 'hidden'); }
      }
    });
    watches.set(element, { visible: false, update: setVisible });
    if (observer) observer.observe(element);
    else { watches.get(element)!.visible = true; publishVisibility(); }
    return () => {
      observer?.unobserve(element);
      watches.delete(element);
      if (!watches.size) { observer?.disconnect(); observer = undefined; document.removeEventListener('visibilitychange', publishVisibility); }
    };
  }, [enabled]);
  return { ref, running: enabled && visible };
}
