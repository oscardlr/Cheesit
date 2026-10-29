'use client';

import { useEffect, useState } from 'react';

const probes = new Map<string, Promise<boolean>>();
/** SVG load errors can precede hydration. One shared probe also catches that case. */
export function useImageFailure(src: string) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    let probe = probes.get(src);
    if (!probe) {
      probe = new Promise<boolean>(resolve => {
        const image = new window.Image();
        image.onload = () => resolve(true);
        image.onerror = () => resolve(false);
        image.src = src;
      });
      probes.set(src, probe);
    }
    void probe.then(isLoaded => { if (active) { setFailed(!isLoaded); setLoaded(isLoaded); } });
    return () => { active = false; };
  }, [src]);
  return [failed, () => { setFailed(true); setLoaded(false); }, loaded] as const;
}
