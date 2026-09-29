'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { Presentation, X } from 'lucide-react';
import {
  clearRevealAll,
  isPresent,
  markRevealAll,
  restorePresent,
  setPresent,
  shouldRevealAll,
  subscribePresent,
} from './store';

// Matches the markup produced by <Reveal> and <Steps reveal> (see reveal.tsx).
const REVEAL_SELECTOR = [
  '[data-reveal]',
  '[data-reveal-each] > :not(ul, ol)',
  '[data-reveal-each] > :is(ul, ol) > li',
].join(', ');

function getRevealItems() {
  return Array.from(document.querySelectorAll<HTMLElement>(REVEAL_SELECTOR));
}

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

function usePresent() {
  return useSyncExternalStore(subscribePresent, isPresent, () => false);
}

/** Mounted once per docs page; handles keys, reveal state and prev/next navigation. */
export function PresentController({ prev, next }: { prev?: string; next?: string }) {
  const router = useRouter();
  const present = usePresent();
  // Infinity = everything shown; clamped against the real item count when applied.
  const [revealed, setRevealed] = useState(() => (shouldRevealAll() ? Infinity : 0));
  const counterRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    restorePresent();
    clearRevealAll();
    // Entering present mode always starts the page from the first step.
    return subscribePresent(() => {
      if (isPresent()) setRevealed(0);
    });
  }, []);

  // Sync reveal attributes (and the counter) onto the DOM; items live in server-rendered MDX.
  useEffect(() => {
    const items = getRevealItems();
    if (counterRef.current) {
      counterRef.current.textContent = items.length
        ? `${Math.min(revealed, items.length)}/${items.length}`
        : '';
    }
    items.forEach((item, i) => {
      if (present) item.dataset.revealState = i < revealed ? 'shown' : 'hidden';
      else delete item.dataset.revealState;
    });
    if (present && revealed > 0 && revealed !== Infinity) {
      items[revealed - 1]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [present, revealed]);

  const forward = useCallback(() => {
    const count = getRevealItems().length;
    const current = Math.min(revealed, count);
    if (current < count) setRevealed(current + 1);
    else if (next) router.push(next);
  }, [revealed, next, router]);

  const backward = useCallback(() => {
    const current = Math.min(revealed, getRevealItems().length);
    if (current > 0) setRevealed(current - 1);
    else if (prev) {
      markRevealAll();
      router.push(prev);
    }
  }, [revealed, prev, router]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;

      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        setPresent(!isPresent());
        return;
      }
      if (!isPresent()) return;

      if (e.key === 'Escape') setPresent(false);
      else if (e.key === 'ArrowRight' || e.key === 'PageDown') forward();
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') backward();
      else return;
      e.preventDefault();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [forward, backward]);

  if (!present) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-full border bg-fd-card px-4 py-2 text-xs text-fd-muted-foreground opacity-40 shadow-sm transition-opacity hover:opacity-100">
      <span ref={counterRef} className="tabular-nums empty:hidden" />
      <span>← → navigate · Esc exit</span>
      <button
        type="button"
        aria-label="Exit present mode"
        onClick={() => setPresent(false)}
        className="hover:text-fd-foreground"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

export function PresentToggle() {
  return (
    <button
      type="button"
      onClick={() => setPresent(true)}
      className="inline-flex items-center gap-2 rounded-lg border px-2 py-1.5 text-sm text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground"
    >
      <Presentation className="size-3.5" />
      Present
      <kbd className="rounded border px-1 font-mono text-xs">P</kbd>
    </button>
  );
}
