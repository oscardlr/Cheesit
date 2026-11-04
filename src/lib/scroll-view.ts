/** Scroll the visible view and its scrollable ancestors without remounting it. */
export function scrollViewToTop(view: HTMLElement | null) {
  if (!view) return;
  const containers = new Set<Element>([view, ...view.querySelectorAll('*')]);
  for (let parent = view.parentElement; parent; parent = parent.parentElement) containers.add(parent);
  if (document.scrollingElement) containers.add(document.scrollingElement);
  const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
  for (const container of containers) {
    if (container.scrollTop <= 0 || container.scrollHeight <= container.clientHeight) continue;
    if (container !== document.scrollingElement && !/(auto|scroll|overlay)/.test(getComputedStyle(container).overflowY)) continue;
    container.scrollTo({ top: 0, behavior });
  }
}
