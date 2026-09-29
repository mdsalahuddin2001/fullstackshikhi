import Link from 'next/link';
import { ChevronRight, House } from 'lucide-react';
import { source } from '@/lib/source';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { baseOptions } from '@/lib/layout.shared';

// Each topic folder is a root (meta.json `root: true`), so the sidebar shows only the
// current topic. Topics are picked on the home page, hence no tab switcher.
export default function Layout({ children }: LayoutProps<'/docs'>) {
  return (
    <DocsLayout
      tree={source.getPageTree()}
      tabs={false}
      sidebar={{
        banner: (
          <Link
            href="/#topics"
            className="group flex items-center gap-2.5 rounded-lg border bg-fd-card p-1.5 pe-2.5 text-sm font-medium text-fd-foreground transition-colors hover:border-fd-primary/40 hover:bg-fd-primary/5"
          >
            <span className="flex size-7 items-center justify-center rounded-md bg-fd-primary/12 text-fd-primary transition-colors group-hover:bg-fd-primary group-hover:text-fd-primary-foreground">
              <House className="size-4" />
            </span>
            All topics
            <ChevronRight className="ms-auto size-4 text-fd-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
        ),
      }}
      {...baseOptions()}
    >
      {children}
    </DocsLayout>
  );
}
