import { useEffect, useRef, type ReactNode } from 'react';

const SCROLL_THRESHOLD = 8;
const MOBILE_NAV = '(max-width: 760px)';

export default function ScrollNavigation({ view, children }: { view: string; children: ReactNode }) {
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const mobile = window.matchMedia(MOBILE_NAV);
    const root = document.scrollingElement;
    const positions = new WeakMap<Element, number>();
    let source: Element | null = null;
    let direction = 0;
    let distance = 0;
    const reset = () => {
      nav.removeAttribute('data-scroll-hidden');
      if (root) positions.set(root, Math.max(0, root.scrollTop));
      source = null;
      direction = 0;
      distance = 0;
    };

    const onScroll = (event: Event) => {
      const target = event.target === document ? root : event.target;
      if (!(target instanceof Element)) return;
      const max = Math.max(0, target.scrollHeight - target.clientHeight);
      // Clamp rubber-band offsets before calculating direction.
      const position = Math.max(0, Math.min(max, target.scrollTop));
      const previous = positions.get(target) ?? 0;
      positions.set(target, position);
      if (!mobile.matches || position === previous) return;

      const delta = position - previous;
      const nextDirection = Math.sign(delta);
      if (source !== target || direction !== nextDirection) distance = 0;
      source = target;
      direction = nextDirection;
      distance += Math.abs(delta);

      if (position === 0 || distance >= SCROLL_THRESHOLD) {
        nav.toggleAttribute('data-scroll-hidden', position > 0 && direction > 0);
        distance = 0;
      }
    };

    reset();
    // Capture also receives non-bubbling scroll events from nested lists.
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    mobile.addEventListener('change', reset);
    return () => {
      document.removeEventListener('scroll', onScroll, true);
      mobile.removeEventListener('change', reset);
    };
  }, [view]);

  return <nav ref={navRef} className="bottom-nav training-navigation" aria-label="Navegación principal">
    {children}
  </nav>;
}
