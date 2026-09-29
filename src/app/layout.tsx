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

// Latin glyphs come from Inter; Bangla glyphs fall through to Noto Sans Bengali.
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

// Self-hosted (Google Fonts' Bengali subset, OFL) so we can set size-adjust: at equal font-size,
// Bangla reads smaller than Latin. 108% matches it to Inter; measured side by side on 2026-09-29.
const notoBengali = localFont({
  src: '../fonts/NotoSansBengali-Variable.woff2',
  weight: '100 900',
  variable: '--font-bengali',
  display: 'swap',
  declarations: [
    { prop: 'size-adjust', value: '108%' },
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
      className={`${inter.variable} ${notoBengali.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body className="flex flex-col min-h-screen">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
