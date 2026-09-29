import Link from 'next/link';
import { ArrowRight, Code2, Footprints, Workflow } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { topics } from '@/lib/topics';

const features = [
  {
    icon: Footprints,
    title: 'ধাপে ধাপে',
    description: 'Every lesson builds one idea at a time, the same order as the video.',
  },
  {
    icon: Code2,
    title: 'Real code',
    description: 'Copy-ready snippets with the important lines highlighted.',
  },
  {
    icon: Workflow,
    title: 'Diagrams',
    description: 'Architecture and request flows drawn out, not just described.',
  },
];

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col">
      <section className="relative overflow-hidden border-b">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,color-mix(in_oklch,var(--primary)_18%,transparent),transparent)]"
        />
        <div className="relative mx-auto flex max-w-5xl flex-col items-center px-4 py-20 text-center sm:py-28">
          <Badge variant="outline" className="mb-6">
            বাংলা + English lessons
          </Badge>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
            Learn fullstack, one concept at a time
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-balance text-muted-foreground">
            PostgreSQL, Redis, Next.js আর AI — video‑র সাথে মিলিয়ে লেখা, পরিষ্কার ব্যাখ্যা আর কাজের code সহ।
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Link href="/docs" className={buttonVariants({ size: 'lg', className: 'px-4' })}>
              Start here <ArrowRight data-icon="inline-end" />
            </Link>
            <Link
              href="#topics"
              className={buttonVariants({ size: 'lg', variant: 'secondary', className: 'px-4' })}
            >
              Browse topics
            </Link>
          </div>
        </div>
      </section>

      <section id="topics" className="mx-auto w-full max-w-5xl scroll-mt-20 px-4 py-16 sm:py-20">
        <h2 className="text-2xl font-semibold tracking-tight">Topics</h2>
        <p className="mt-2 text-muted-foreground">Pick a series and start from the first lesson.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {topics.map((topic) => (
            <Link key={topic.slug} href={`/docs/${topic.slug}`} className="group rounded-xl outline-none">
              <Card className="h-full transition-colors group-hover:ring-primary/40 group-focus-visible:ring-2 group-focus-visible:ring-ring">
                <CardHeader>
                  <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <topic.icon className="size-5" />
                  </div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    {topic.title}
                    <ArrowRight className="size-4 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                  </CardTitle>
                  <CardDescription className="text-sm leading-relaxed">{topic.description}</CardDescription>
                </CardHeader>
                <CardFooter className="mt-auto flex flex-wrap gap-1.5 border-t bg-transparent py-3">
                  {topic.tags.map((tag) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </CardFooter>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section className="border-t bg-muted/40">
        <div className="mx-auto grid max-w-5xl gap-8 px-4 py-16 sm:grid-cols-3">
          {features.map((feature) => (
            <div key={feature.title}>
              <feature.icon className="size-5 text-primary" />
              <h3 className="mt-3 font-medium">{feature.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
