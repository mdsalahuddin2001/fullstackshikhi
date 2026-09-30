import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type * as PageTree from 'fumadocs-core/page-tree';
import { DocsDescription, DocsTitle } from 'fumadocs-ui/layouts/docs/page';
import { topics } from '@/lib/topics';
import { lessonsOf } from '@/lib/lessons';
import { keyButton } from '@/lib/key-button';
import { cn } from '@/lib/cn';

// Home page visual language on docs pages: brand wash, watermark logo, mono eyebrow, key buttons.
// Colors read --color-fd-primary, which TopicBrand has already set to the topic's brand.

const pad = (n: number) => String(n).padStart(2, '0');
const ease = 'ease-[cubic-bezier(0.22,1,0.36,1)]';

interface LessonHeaderProps {
  topicSlug: string;
  url: string;
  title: ReactNode;
  description: ReactNode;
  /** Page actions (Present, Copy Markdown, …). */
  actions: ReactNode;
}

export function LessonHeader({ topicSlug, url, title, description, actions }: LessonHeaderProps) {
  const topic = topics.find((t) => t.slug === topicSlug);
  const Logo = topic?.logo;
  const label = topic?.title ?? topicSlug.charAt(0).toUpperCase() + topicSlug.slice(1);
  const lessons = lessonsOf(topicSlug);
  const isOverview = url === `/docs/${topicSlug}`;
  const number = lessons.findIndex((l) => l.url === url) + 1;

  return (
    <header
      className={cn(
        'relative isolate overflow-hidden rounded-2xl border bg-fd-card p-6 sm:p-8',
        isOverview && 'sm:py-12',
      )}
    >
      <div
        aria-hidden
        data-present-hide
        className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_100%_0%,color-mix(in_oklab,var(--color-fd-primary)_14%,transparent),transparent_60%)]"
      />
      {Logo && (
        <Logo
          data-present-hide
          className={cn(
            'absolute -z-10 text-fd-primary opacity-[0.07]',
            isOverview ? '-right-12 -bottom-16 size-80' : '-right-8 -bottom-12 size-52',
          )}
        />
      )}

      <p className="flex items-center gap-2 font-mono text-xs tracking-wide text-fd-muted-foreground uppercase">
        {Logo && <Logo className="size-4 text-fd-primary" />}
        {label}
        <span aria-hidden>·</span>
        {isOverview ? 'Series overview' : number > 0 ? `Lesson ${pad(number)} / ${pad(lessons.length)}` : 'Guide'}
      </p>

      <DocsTitle className={cn('mt-4 tracking-tight', isOverview && 'text-4xl sm:text-5xl')}>{title}</DocsTitle>
      <DocsDescription className="mt-3 mb-0 max-w-2xl">{description}</DocsDescription>

      {isOverview && (
        <div className="mt-8 flex flex-wrap items-center gap-4" data-present-hide>
          {lessons.length > 0 ? (
            <>
              <Link
                href={lessons[0].url}
                className={keyButton}
                style={{ '--key': 'var(--color-fd-primary)', '--key-fg': 'var(--color-fd-primary-foreground)' } as CSSProperties}
              >
                প্রথম lesson শুরু করুন <ArrowRight className="size-4" />
              </Link>
              <span className="font-mono text-sm text-fd-muted-foreground">{lessons.length} lessons</span>
            </>
          ) : (
            <span className="rounded-full border border-dashed px-3 py-1 font-mono text-xs text-fd-muted-foreground">
              coming soon
            </span>
          )}
        </div>
      )}

      <div data-present-hide data-lesson-actions className="mt-6 flex flex-wrap items-center gap-2">
        {actions}
      </div>
    </header>
  );
}

export function LessonNav({ previous, next }: { previous?: PageTree.Item; next?: PageTree.Item }) {
  if (!previous && !next) return null;
  return (
    <nav aria-label="Lesson navigation" className="mt-4 grid gap-4 sm:grid-cols-2">
      {previous && <NavCard item={previous} direction="previous" />}
      {next && <NavCard item={next} direction="next" />}
    </nav>
  );
}

function NavCard({ item, direction }: { item: PageTree.Item; direction: 'previous' | 'next' }) {
  const isNext = direction === 'next';
  const Arrow = isNext ? ArrowRight : ArrowLeft;
  return (
    <Link
      href={item.url}
      className={cn(
        'group relative isolate flex flex-col gap-2 overflow-hidden rounded-xl border bg-fd-card p-5 not-prose transition-[translate,border-color] duration-500 hover:-translate-y-1 hover:border-[color-mix(in_oklab,var(--color-fd-primary)_45%,var(--color-fd-border))]',
        ease,
        isNext && 'items-end text-end sm:col-start-2',
      )}
    >
      <div
        aria-hidden
        className={cn(
          'absolute inset-0 -z-10 opacity-0 transition-opacity duration-500 group-hover:opacity-100',
          isNext
            ? 'bg-[radial-gradient(circle_at_100%_0%,color-mix(in_oklab,var(--color-fd-primary)_14%,transparent),transparent_70%)]'
            : 'bg-[radial-gradient(circle_at_0%_0%,color-mix(in_oklab,var(--color-fd-primary)_14%,transparent),transparent_70%)]',
        )}
      />
      <span className="inline-flex items-center gap-1.5 font-mono text-xs tracking-wide text-fd-muted-foreground uppercase">
        {!isNext && <Arrow className={cn('size-3.5 transition-transform duration-500 group-hover:-translate-x-1', ease)} />}
        {isNext ? 'পরের lesson' : 'আগের lesson'}
        {isNext && <Arrow className={cn('size-3.5 transition-transform duration-500 group-hover:translate-x-1', ease)} />}
      </span>
      <span className="font-semibold text-fd-foreground">{item.name}</span>
    </Link>
  );
}
