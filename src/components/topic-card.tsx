'use client';

import Link from 'next/link';
import type { CSSProperties, PointerEvent } from 'react';
import { ArrowRight, Plus } from 'lucide-react';
import { topics } from '@/lib/topics';
import { cn } from '@/lib/cn';
import { keyButton } from '@/lib/key-button';

// One easing for every hover motion so the card, glow and watermark move together.
const ease = 'ease-[cubic-bezier(0.22,1,0.36,1)]';

// The spotlight follows the pointer via --x/--y; set directly on the element to skip React renders.
function trackPointer(e: PointerEvent<HTMLElement>) {
  const rect = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty('--x', `${e.clientX - rect.left}px`);
  e.currentTarget.style.setProperty('--y', `${e.clientY - rect.top}px`);
}

export function TopicCard({ slug, live, index }: { slug: string; live: boolean; index: number }) {
  const topic = topics.find((t) => t.slug === slug)!;
  const { brand } = topic;
  // --brand switches with the theme; topics without a brand use the site blue.
  const colors = {
    '--brand-light': brand?.light ?? 'var(--primary)',
    '--brand-dark': brand?.dark ?? 'var(--primary)',
    '--brand-fg-light': brand?.lightForeground ?? 'var(--primary-foreground)',
    '--brand-fg-dark': brand?.darkForeground ?? 'var(--primary-foreground)',
  } as CSSProperties;

  return (
    <div
      className="group relative isolate fill-mode-both [--brand-fg:var(--brand-fg-light)] [--brand:var(--brand-light)] dark:[--brand-fg:var(--brand-fg-dark)] dark:[--brand:var(--brand-dark)] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-6 motion-safe:duration-700"
      style={{ ...colors, animationDelay: `${150 + index * 90}ms` }}
    >
      {/* Colored glow under the card; only its opacity animates, which stays smooth. */}
      <div
        aria-hidden
        className={cn(
          'absolute inset-x-8 top-10 -bottom-2 -z-10 rounded-3xl bg-(--brand) opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-25',
          ease,
        )}
      />
      <Link
        href={`/docs/${topic.slug}`}
        onPointerMove={trackPointer}
        style={{ '--key': 'var(--brand)', '--key-fg': 'var(--brand-fg)' } as CSSProperties}
        className={cn(
          'relative isolate flex h-full min-h-80 flex-col overflow-hidden rounded-2xl border bg-card p-7 outline-none will-change-transform transition-[translate,border-color] duration-500 group-hover:-translate-y-1.5 group-hover:border-[color-mix(in_oklab,var(--brand)_45%,var(--border))] focus-visible:ring-2 focus-visible:ring-ring sm:p-9',
          ease,
        )}
      >
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_100%_0%,color-mix(in_oklab,var(--brand)_14%,transparent),transparent_60%)]"
        />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-[radial-gradient(420px_circle_at_var(--x,50%)_var(--y,0%),color-mix(in_oklab,var(--brand)_16%,transparent),transparent_65%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        />
        <topic.logo
          className={cn(
            'absolute -right-10 -bottom-12 -z-10 size-64 text-(--brand) opacity-[0.06] will-change-transform transition-[rotate,scale,opacity] duration-700 group-hover:scale-110 group-hover:-rotate-6 group-hover:opacity-10',
            ease,
          )}
        />

        <div className="flex items-start justify-between gap-4">
          <span
            className={cn(
              'flex size-16 items-center justify-center rounded-2xl border bg-[color-mix(in_oklab,var(--brand)_10%,var(--card))] transition-[rotate,scale] duration-500 group-hover:scale-105 group-hover:-rotate-3',
              ease,
            )}
          >
            <topic.logo className="size-9 text-(--brand)" />
          </span>
          {!live && (
            <span className="rounded-full border border-dashed px-2.5 py-1 font-mono text-xs text-muted-foreground">
              coming soon
            </span>
          )}
        </div>

        <h2 className="mt-7 text-3xl font-semibold tracking-tight">{topic.title}</h2>
        <p className="mt-3 max-w-sm text-muted-foreground">{topic.description}</p>
        <p className="mt-4 font-mono text-xs text-muted-foreground">{topic.tags.join(' · ')}</p>

        <div className="mt-auto pt-8">
          <span className={cn(keyButton, 'group-hover:brightness-110')}>
            শুরু করুন
            <ArrowRight className={cn('size-4 transition-transform duration-500 group-hover:translate-x-1', ease)} />
          </span>
        </div>
      </Link>
    </div>
  );
}

// Placeholder beside the live topics until the next series is planned. Not a link.
export function ComingSoonCard({ index }: { index: number }) {
  return (
    <div
      className="relative isolate flex h-full min-h-80 flex-col overflow-hidden rounded-2xl border border-dashed p-7 fill-mode-both motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-6 motion-safe:duration-700 sm:p-9"
      style={{ animationDelay: `${150 + index * 90}ms` }}
    >
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_1px_1px,var(--border)_1px,transparent_0)] bg-size-[20px_20px] mask-[radial-gradient(ellipse_at_100%_0%,black,transparent_70%)]"
      />
      <span className="flex size-16 items-center justify-center rounded-2xl border border-dashed text-muted-foreground">
        <Plus className="size-7" />
      </span>
      <h2 className="mt-7 text-3xl font-semibold tracking-tight text-muted-foreground">More coming soon</h2>
      <p className="mt-3 max-w-sm text-muted-foreground">
        PostgreSQL series শেষ হলে পরের topic শুরু হবে, video-র সাথে সাথে।
      </p>
      <p className="mt-auto pt-8 font-mono text-xs tracking-wide text-muted-foreground uppercase">next series · planning</p>
    </div>
  );
}
