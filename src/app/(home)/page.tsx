import Link from 'next/link';
import type { CSSProperties } from 'react';
import { ArrowDown } from 'lucide-react';
import { lessonsOf } from '@/lib/lessons';
import { topics } from '@/lib/topics';
import { ComingSoonCard, TopicCard } from '@/components/topic-card';
import { keyButton } from '@/lib/key-button';

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col">
      <section className="mx-auto w-full max-w-6xl px-4 pt-16 pb-12 fill-mode-both motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-700 sm:pt-24">
        <p className="font-mono text-xs tracking-wide text-muted-foreground uppercase">
          বাংলা video series · written edition
        </p>
        <h1 className="mt-5 max-w-3xl text-4xl leading-[1.15] font-semibold tracking-tight text-balance sm:text-6xl">
          Fullstack শিখুন বাংলায়,
          <span className="block text-muted-foreground">শুরু হচ্ছে PostgreSQL দিয়ে।</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
          প্রতিটি lesson একটি video-র লিখিত রূপ: চালিয়ে দেখার মতো code, diagram, আর “কেন” প্রশ্নের উত্তর।
        </p>
        <div className="mt-9">
          <Link
            href="#topics"
            className={keyButton}
            style={{ '--key': 'var(--primary)', '--key-fg': 'var(--primary-foreground)' } as CSSProperties}
          >
            কী শিখবেন, দেখুন <ArrowDown className="size-4" />
          </Link>
        </div>
      </section>

      <section id="topics" className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 pb-20">
        <div className="grid gap-5 md:grid-cols-2">
          {topics.map((topic, i) => (
            <TopicCard key={topic.slug} slug={topic.slug} live={lessonsOf(topic.slug).length > 0} index={i} />
          ))}
          <ComingSoonCard index={topics.length} />
        </div>
      </section>
    </main>
  );
}
