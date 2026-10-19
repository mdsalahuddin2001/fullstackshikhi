'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';

const chapters = [
  ['lab', 'Set up the lab'], ['foundations', 'Explain the fundamentals'],
  ['sql', 'Write SQL confidently'], ['design', 'Design valid data'],
  ['joins', 'Join and report'], ['advanced-sql', 'Use advanced SQL'],
  ['concurrency', 'Handle concurrent changes'], ['performance', 'Measure and tune'],
  ['backend', 'Connect an application'], ['orm-migrations', 'Migrate safely'],
  ['production', 'Back up and restore'], ['scaling', 'Isolate and scale'],
  ['advanced-modeling', 'Model time, money, and ranges'],
  ['reliable-workflows', 'Design retry-safe workflows'],
  ['search', 'Build full-text and fuzzy search'],
  ['bulk-data', 'Import and backfill safely'],
  ['operations-debugging', 'Investigate production waits'],
  ['api-project', 'Run and test the reservation API'],
  ['projects', 'Complete the three capstones'],
] as const;
const key = 'postgresql-handbook-progress-v1';
const event = 'handbook-progress-change';
function subscribe(callback: () => void) {
  window.addEventListener('storage', callback);
  window.addEventListener(event, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(event, callback);
  };
}
let memory = '';
let storageUnavailable = false;
function snapshot() {
  if (storageUnavailable) return memory;
  try { return localStorage.getItem(key) ?? ''; } catch { return memory; }
}
function read(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string' && chapters.some(([slug]) => slug === item)) : [];
  } catch { return []; }
}
  function toggle(slug: string) {
    const next = new Set(read(snapshot()));
    if (next.has(slug)) next.delete(slug); else next.add(slug);
    memory = JSON.stringify([...next]);
    try { localStorage.setItem(key, memory); } catch { storageUnavailable = true; }
    window.dispatchEvent(new Event(event));
  }

export function HandbookProgress() {
  const value = useSyncExternalStore(subscribe, snapshot, () => '');
  const completed = new Set(read(value));
  return (
    <section aria-label="Your handbook progress" className="not-prose my-8 rounded-2xl border bg-fd-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Your field notes, your progress</h2>
        <span aria-live="polite" className="font-mono text-sm">{completed.size} / {chapters.length} checkpoints</span>
      </div>
      <progress aria-label="Completed handbook checkpoints" value={completed.size} max={chapters.length} className="my-4 h-2 w-full accent-fd-primary" />
      <div className="grid gap-3 sm:grid-cols-2">
        {chapters.map(([slug, label], index) => (
          <div key={slug} className="flex items-center gap-3 rounded-lg border p-3">
            <input type="checkbox" aria-label={`Mark ${label} complete`} checked={completed.has(slug)} onChange={() => toggle(slug)} className="size-4 accent-fd-primary" />
            <Link href={`/docs/postgresql-handbook/${slug}`} className="text-sm hover:underline"><span className="mr-2 font-mono text-fd-muted-foreground">{String(index + 1).padStart(2, '0')}</span>{label}</Link>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-fd-muted-foreground">Saved in this browser when storage is available. Mark complete after solving and explaining the exercise; uncheck to revisit.</p>
    </section>
  );
}
