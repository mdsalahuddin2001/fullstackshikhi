import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // Keep all responses, including downloads and Markdown, out of search indexes.
  async headers() {
    return [{
      source: '/:path*',
      headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
    }];
  },
  // Topics are chosen on the home page; there is no docs landing page.
  async redirects() {
    return [{ source: '/docs', destination: '/', permanent: false }];
  },
};

export default withMDX(config);
