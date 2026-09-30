import { source } from '@/lib/source';
import { DocsBody, DocsPage, MarkdownCopyButton, ViewOptionsPopover } from 'fumadocs-ui/layouts/docs/page';
import { notFound } from 'next/navigation';
import { findNeighbour } from 'fumadocs-core/page-tree';
import { PresentController, PresentToggle } from '@/components/present/present-mode';
import { getMDXComponents } from '@/components/mdx';
import { LessonHeader, LessonNav } from '@/components/lesson-chrome';
import type { Metadata } from 'next';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import { getPageImageUrl, getPageMarkdownUrl, gitConfig } from '@/lib/shared';
import { topics } from '@/lib/topics';

// Swaps the site brand for the topic's. Set on :root because the sidebar sits outside the page;
// rendered after global.css, so it wins over its :root/.dark tokens.
function TopicBrand({ slug }: { slug?: string }) {
  const brand = topics.find((t) => t.slug === slug)?.brand;
  if (!brand) return null;
  const vars = (color: string, fg: string) =>
    ['primary', 'sidebar-primary'].map((k) => `--${k}:${color};--${k}-foreground:${fg};`).join('') +
    `--ring:${color};--sidebar-ring:${color};`;
  return (
    <style>{`:root{${vars(brand.light, brand.lightForeground)}}:root.dark{${vars(brand.dark, brand.darkForeground)}}`}</style>
  );
}

export default async function Page(props: PageProps<'/docs/[[...slug]]'>) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const MDX = page.data.body;
  const markdownUrl = getPageMarkdownUrl(page).url;
  const neighbours = findNeighbour(source.getPageTree(), page.url);

  return (
    <DocsPage toc={page.data.toc} full={page.data.full} footer={{ enabled: false }}>
      <TopicBrand slug={page.slugs[0]} />
      <LessonHeader
        topicSlug={page.slugs[0]}
        url={page.url}
        title={page.data.title}
        description={page.data.description}
        actions={
          <>
            <PresentToggle />
            <MarkdownCopyButton markdownUrl={markdownUrl} />
            <ViewOptionsPopover
              markdownUrl={markdownUrl}
              githubUrl={`https://github.com/${gitConfig.user}/${gitConfig.repo}/blob/${gitConfig.branch}/content/docs/${page.path}`}
            />
          </>
        }
      />
      <DocsBody>
        <MDX
          components={getMDXComponents({
            // this allows you to link to other pages with relative file paths
            a: createRelativeLink(source, page),
          })}
        />
      </DocsBody>
      <LessonNav previous={neighbours.previous} next={neighbours.next} />
      <PresentController prev={neighbours.previous?.url} next={neighbours.next?.url} />
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: PageProps<'/docs/[[...slug]]'>): Promise<Metadata> {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  return {
    title: page.data.title,
    description: page.data.description,
    openGraph: {
      images: getPageImageUrl(page).url,
    },
  };
}
