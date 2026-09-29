import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
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
            className="inline-flex items-center gap-1.5 text-sm text-fd-muted-foreground transition-colors hover:text-fd-foreground"
          >
            <ArrowLeft className="size-3.5" />
            All topics
          </Link>
        ),
      }}
      {...baseOptions()}
    >
      {children}
    </DocsLayout>
  );
}
