import Link from 'next/link';
import { ArrowDown, ArrowRight, ArrowUpRight } from 'lucide-react';
import type * as PageTree from 'fumadocs-core/page-tree';
import { source } from '@/lib/source';
import { topics } from '@/lib/topics';
import { cn } from '@/lib/cn';

// Lessons of a topic, in meta.json order (the folder's index page is the series overview, not a lesson).
function lessonsOf(slug: string): PageTree.Item[] {
  const base = `/docs/${slug}`;
  const inTopic = (node: PageTree.Node) =>
    node.type === 'page' && (node.url === base || node.url.startsWith(`${base}/`));
  const folder = source
    .getPageTree()
    .children.find(
      (node): node is PageTree.Folder =>
        node.type === 'folder' && (node.index?.url === base || node.children.some(inTopic)),
    );
  return (
    folder?.children.filter((node): node is PageTree.Item => node.type === 'page' && node.url !== base) ?? []
  );
}

const pad = (n: number) => String(n).padStart(2, '0');

// Physical "key" buttons: a solid bottom edge that the button presses into.
const keyBase =
  'inline-flex items-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold transition-[transform,box-shadow,filter] duration-100 active:translate-y-[3px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
const keyPrimary = cn(
  keyBase,
  'bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.2),0_3px_0_color-mix(in_oklab,var(--primary)_55%,black)] hover:brightness-110 active:shadow-[inset_0_1px_0_rgb(255_255_255/0.2),0_0_0_transparent]',
);
const keySecondary = cn(
  keyBase,
  'border bg-card text-foreground shadow-[0_3px_0_var(--border)] hover:bg-accent active:shadow-none',
);

export default function HomePage() {
  const syllabus = topics.map((topic) => ({ ...topic, lessons: lessonsOf(topic.slug) }));
  const lessonCount = syllabus.reduce((sum, t) => sum + t.lessons.length, 0);
  const liveCount = syllabus.filter((t) => t.lessons.length > 0).length;

  return (
    <main className="flex flex-1 flex-col">
      <section className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 pt-16 pb-14 sm:pt-24 lg:grid-cols-[1fr_1.05fr]">
        <div>
          <p className="font-mono text-xs tracking-wide text-muted-foreground uppercase">
            বাংলা video series · written edition
          </p>
          <h1 className="mt-5 text-4xl leading-[1.15] font-semibold tracking-tight text-balance sm:text-5xl">
            Fullstack শিখুন বাংলায়,
            <span className="block text-muted-foreground">query plan থেকে production পর্যন্ত।</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted-foreground">
            প্রতিটি lesson একটি video-র লিখিত রূপ: চালিয়ে দেখার মতো code, diagram, আর “কেন” প্রশ্নের
            উত্তর।
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Link href="/docs/postgresql" className={keyPrimary}>
              <PostgresMark /> PostgreSQL দিয়ে শুরু <ArrowRight className="size-4" />
            </Link>
            <Link href="#topics" className={keySecondary}>
              Syllabus <ArrowDown className="size-4" />
            </Link>
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            Lesson-এর ভেতরে <Kbd>P</Kbd> চাপলে present mode, video-তে দেখানোর জন্য।
          </p>
        </div>

        <Terminal />
      </section>

      <div className="border-y bg-muted/40">
        <dl className="mx-auto flex max-w-6xl flex-wrap gap-x-10 gap-y-3 px-4 py-4 font-mono text-sm">
          <Fact label="lessons" value={pad(lessonCount)} />
          <Fact label="series live" value={`${liveCount}/${topics.length}`} />
          <Fact label="language" value="বাংলা + English" />
          <Fact label="diagrams" value="Mermaid" />
        </dl>
      </div>

      <section id="topics" className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-16 sm:py-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="text-3xl font-semibold tracking-tight">Syllabus</h2>
          <p className="text-sm text-muted-foreground">একটা series বেছে নিন, প্রথম lesson থেকে শুরু করুন।</p>
        </div>

        <ol className="mt-10 border-t">
          {syllabus.map((topic, i) => {
            const live = topic.lessons.length > 0;
            return (
              <li
                key={topic.slug}
                className="grid gap-x-6 gap-y-5 border-b py-8 md:grid-cols-[3rem_minmax(0,1fr)_minmax(0,1.2fr)]"
              >
                <span className="font-mono text-sm text-muted-foreground tabular-nums">{pad(i + 1)}</span>

                <div className={cn(!live && 'opacity-60')}>
                  <Link href={`/docs/${topic.slug}`} className="group inline-flex items-center gap-3">
                    <topic.logo className="size-8 shrink-0" style={{ color: topic.color }} />
                    <span className="text-2xl font-semibold tracking-tight group-hover:underline group-hover:underline-offset-4">
                      {topic.title}
                    </span>
                  </Link>
                  <p className="mt-3 max-w-sm text-muted-foreground">{topic.description}</p>
                  <p className="mt-4 font-mono text-xs text-muted-foreground">{topic.tags.join(' · ')}</p>
                </div>

                {live ? (
                  <ol className="grid content-start gap-px overflow-hidden rounded-lg border bg-border">
                    {topic.lessons.map((lesson, j) => (
                      <li key={lesson.url}>
                        <Link
                          href={lesson.url}
                          className="group flex items-center gap-4 bg-card px-4 py-3 text-sm transition-colors hover:bg-accent"
                        >
                          <span className="font-mono text-xs text-muted-foreground tabular-nums">
                            {pad(j + 1)}
                          </span>
                          <span className="flex-1">{lesson.name}</span>
                          <ArrowUpRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                        </Link>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className="flex items-center rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
                    <span className="me-3 inline-block size-1.5 rounded-full bg-muted-foreground/60" />
                    Lessons আসছে, video-র সাথে সাথে যোগ হবে।
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </section>
    </main>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="mx-0.5 inline-flex min-w-6 items-center justify-center rounded-md border bg-card px-1.5 font-mono text-xs text-foreground shadow-[0_2px_0_var(--border)]">
      {children}
    </kbd>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function PostgresMark() {
  const Logo = topics[0].logo;
  return <Logo className="size-4" />;
}

// Output from the Index lesson (content/docs/postgresql/indexes.mdx), cost columns trimmed.
function Terminal() {
  const prompt = <span className="text-[#7ee787]">books=#</span>;
  return (
    <figure className="min-w-0">
      <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0d1117] text-[#c9d1d9] shadow-2xl shadow-black/20">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5 font-mono text-xs text-[#8b949e]">
          <span>psql · books</span>
          <span>1,000,000 rows</span>
        </div>
        <pre className="overflow-x-auto p-4 font-mono text-[12.5px] leading-relaxed">
          {prompt} EXPLAIN ANALYZE SELECT * FROM books{'\n'}
          {'        '}WHERE isbn = <span className="text-[#a5d6ff]">&apos;978-0132350884&apos;</span>;{'\n'}
          <span className="text-[#8b949e]">
            {' '}Seq Scan on books (actual time=41.207..85.114 rows=1){'\n'}
            {'   '}Rows Removed by Filter: 999999{'\n'}
          </span>
          {' '}Execution Time: <span className="rounded bg-[#f85149]/15 px-1 text-[#ff7b72]">85.312 ms</span>
          {'\n\n'}
          {prompt} CREATE INDEX idx_books_isbn ON books (isbn);{'\n'}
          <span className="text-[#8b949e]">CREATE INDEX</span>
          {'\n\n'}
          {prompt} EXPLAIN ANALYZE SELECT * FROM books{'\n'}
          {'        '}WHERE isbn = <span className="text-[#a5d6ff]">&apos;978-0132350884&apos;</span>;{'\n'}
          <span className="text-[#8b949e]">
            {' '}Index Scan using idx_books_isbn on books (actual time=0.025..0.026 rows=1){'\n'}
          </span>
          {' '}Execution Time: <span className="rounded bg-[#3fb950]/15 px-1 text-[#7ee787]">0.041 ms</span>
        </pre>
      </div>
      <figcaption className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>একটা index, ~2000× দ্রুত query।</span>
        <Link
          href="/docs/postgresql/indexes"
          className="inline-flex items-center gap-1 font-medium text-foreground hover:underline hover:underline-offset-4"
        >
          Index lesson <ArrowRight className="size-3.5" />
        </Link>
      </figcaption>
    </figure>
  );
}
