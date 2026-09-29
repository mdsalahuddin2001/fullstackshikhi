import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // Topics are chosen on the home page; there is no docs landing page.
  async redirects() {
    return [{ source: '/docs', destination: '/', permanent: false }];
  },
};

export default withMDX(config);
