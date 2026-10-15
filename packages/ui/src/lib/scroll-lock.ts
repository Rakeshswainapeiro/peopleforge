/**
 * Stops the page scrolling behind a modal, without the page jumping sideways: the scrollbar's
 * width (0 with overlay scrollbars, e.g. macOS; ~15px on Windows) is added as padding while it
 * is hidden. Returns the function that restores the page exactly as it was.
 */
export function lockPageScroll(root: HTMLElement = document.documentElement): () => void {
  const previous = { overflow: root.style.overflow, padding: root.style.paddingInlineEnd };
  const scrollbar = window.innerWidth - root.clientWidth;
  root.style.overflow = 'hidden';
  if (scrollbar > 0) root.style.paddingInlineEnd = `${String(scrollbar)}px`;
  return () => {
    root.style.overflow = previous.overflow;
    root.style.paddingInlineEnd = previous.padding;
  };
}
