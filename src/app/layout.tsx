import { RootProvider } from 'fumadocs-ui/provider/next';
import './global.css';
import { Inter, JetBrains_Mono } from 'next/font/google';
import localFont from 'next/font/local';
import type { Metadata } from 'next';
import { appName } from '@/lib/shared';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: { template: `%s | ${appName}`, default: appName },
};

// Latin glyphs come from Inter; Bangla glyphs fall through to Hind Siliguri.
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

// Hind Siliguri, self-hosted (Google Fonts' Bengali subset, OFL) so we can set size-adjust: at
// equal font-size Bangla reads smaller than Latin; 105% matches it to Inter (measured 2026-09-29).
const bengali = localFont({
  src: [
    { path: '../fonts/HindSiliguri-400.woff2', weight: '400' },
    { path: '../fonts/HindSiliguri-500.woff2', weight: '500' },
    { path: '../fonts/HindSiliguri-600.woff2', weight: '600' },
    { path: '../fonts/HindSiliguri-700.woff2', weight: '700' },
  ],
  variable: '--font-bengali',
  display: 'swap',
  declarations: [
    { prop: 'size-adjust', value: '105%' },
    {
      prop: 'unicode-range',
      value:
        'U+0951-0952, U+0964-0965, U+0980-09FE, U+1CD0, U+1CD2, U+1CD5-1CD6, U+1CD8, U+1CE1, U+1CEA, U+1CED, U+1CF2, U+1CF5-1CF7, U+200C-200D, U+20B9, U+25CC, U+A8F1',
    },
  ],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
});

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${bengali.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body className="flex flex-col min-h-screen">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
