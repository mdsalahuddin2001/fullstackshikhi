import type * as PageTree from 'fumadocs-core/page-tree';
import { source } from '@/lib/source';

// Lessons of a topic, in meta.json order. The folder's index page is the series overview, not a lesson.
export function lessonsOf(slug: string): PageTree.Item[] {
  const base = `/docs/${slug}`;
  const folder = source
    .getPageTree()
    .children.find(
      (node): node is PageTree.Folder =>
        node.type === 'folder' &&
        (node.index?.url === base ||
          node.children.some((child) => child.type === 'page' && child.url.startsWith(`${base}/`))),
    );
  return (
    folder?.children.filter((node): node is PageTree.Item => node.type === 'page' && node.url !== base) ?? []
  );
}
