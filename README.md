# Learn Fullstack

Teaching docs for YouTube: PostgreSQL, Redis, fullstack development and AI. Content can be Bangla, English, or mixed.

Built with Next.js + [Fumadocs](https://fumadocs.dev).

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm build        # production build
pnpm lint
pnpm types:check
```

Content lives in `content/docs/**/*.mdx`. See `PROGRESS.md` for build status.

## Search indexing

Search indexing is disabled site-wide while internal material is hosted here.
The root layout emits `noindex, nofollow` metadata, and `next.config.mjs`
sets the same policy in an `X-Robots-Tag` header for every path, including
Markdown exports and downloads. Deploy these changes for them to take effect.

Do not add a `robots.txt` crawl block: crawlers must be able to fetch a URL to
see its `noindex` directive. Existing Google results disappear after recrawling;
urgent removal requires Google's Search Console removal tools. See
[Google's noindex guidance](https://developers.google.com/search/docs/crawling-indexing/block-indexing).

This is not access control. Internal content needs authentication or hosting-level
access protection to prevent public access. To enable indexing later, review the
content and remove both the metadata and response-header restrictions.
