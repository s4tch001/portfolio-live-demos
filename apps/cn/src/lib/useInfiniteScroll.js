import { useState, useEffect, useRef } from 'react';

// Client-side "scroll to load more" pagination. Renders only the first
// `initialCount` items of `items` and reveals another `pageSize` each time the
// returned `sentinelRef` element scrolls into view. It never fetches — it just
// slices an array that is already in memory (the caller keeps loading data the
// same way it always has).
//
// Reset-to-first-page is driven by `resetKey` (defaults to the `items`
// reference): whenever it changes — a new search, month, or filter — the list
// starts again from the top. Keep `resetKey` a primitive (string/number) when
// the `items` reference is rebuilt on every render, so the page count survives
// unrelated re-renders.
//
// Usage: render `sentinelRef` on an element at the end of the list, but only
// while `hasMore` is true.
export function useInfiniteScroll(items, options = {}) {
  const { pageSize = 24, initialCount = pageSize, resetKey = items } = options;
  const [count, setCount] = useState(initialCount);
  const sentinelRef = useRef(null);

  // New list (or a bigger required first page) → back to the top.
  useEffect(() => {
    setCount(initialCount);
  }, [resetKey, initialCount, pageSize]);

  const total = items.length;
  const hasMore = count < total;

  // Re-create the observer whenever the page grows (`count`) so a short list
  // that doesn't fill the viewport keeps revealing pages until it does or
  // everything is shown — not just a single extra page.
  useEffect(() => {
    if (!hasMore) return undefined;
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setCount((c) => c + pageSize);
        }
      },
      { rootMargin: '250px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, pageSize, count]);

  const visible = hasMore ? items.slice(0, count) : items;
  return { visible, hasMore, sentinelRef };
}
