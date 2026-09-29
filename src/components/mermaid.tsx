'use client';

import { use, useId, useSyncExternalStore } from 'react';

export function Mermaid({ chart }: { chart: string }) {
  // Mermaid renders in the browser only; skip it during SSR.
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  if (!mounted) return null;
  return <MermaidContent chart={chart} />;
}

const noopSubscribe = () => () => {};

// Follow the class on <html>, not next-themes state: React learns about a theme change before
// the `.dark` class is swapped, so CSS tokens read at that moment would still be the old theme.
function subscribeHtmlClass(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}

const getHtmlTheme = () => (document.documentElement.classList.contains('dark') ? 'dark' : 'light');

const cache = new Map<string, Promise<unknown>>();

function cachePromise<T>(key: string, setPromise: () => Promise<T>): Promise<T> {
  const cached = cache.get(key);
  if (cached) return cached as Promise<T>;

  const promise = setPromise();
  cache.set(key, promise);
  return promise;
}

function MermaidContent({ chart }: { chart: string }) {
  const id = useId();
  const theme = useSyncExternalStore(subscribeHtmlClass, getHtmlTheme, () => 'light');
  const { default: mermaid } = use(cachePromise('mermaid', () => import('mermaid')));

  const { svg, bindFunctions } = use(
    cachePromise(`${chart}-${theme}`, () => {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'loose',
        fontFamily: 'inherit',
        themeCSS: 'margin: 1.5rem auto 0;',
        theme: 'base',
        darkMode: theme === 'dark',
        themeVariables: themeFromCss(),
      });
      return mermaid.render(id.replaceAll(':', ''), chart.replaceAll('\\n', '\n'));
    }),
  );

  return (
    <div
      ref={(container) => {
        if (container) bindFunctions?.(container);
      }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

// Mermaid only parses hex/rgb, while the site theme is oklch; paint each token to a pixel to convert.
function toHex(cssColor: string): string {
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  if (!ctx) return cssColor;
  ctx.fillStyle = cssColor;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function mix(a: string, b: string): string {
  const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [ca, cb] = [channels(a), channels(b)];
  return `#${ca.map((v, i) => Math.round((v + cb[i]) / 2).toString(16).padStart(2, '0')).join('')}`;
}

function themeFromCss() {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string) => toHex(style.getPropertyValue(name).trim());
  const background = token('--background');
  const foreground = token('--foreground');
  const card = token('--card');
  const border = token('--border');
  const primary = token('--primary');
  const muted = token('--muted-foreground');

  return {
    background,
    primaryColor: card,
    primaryTextColor: foreground,
    primaryBorderColor: primary,
    secondaryColor: token('--secondary'),
    tertiaryColor: token('--muted'),
    lineColor: muted,
    textColor: foreground,
    mainBkg: card,
    nodeBorder: primary,
    clusterBkg: token('--muted'),
    clusterBorder: border,
    edgeLabelBackground: background,
    actorBkg: card,
    actorBorder: primary,
    actorTextColor: foreground,
    actorLineColor: border,
    signalColor: foreground,
    signalTextColor: foreground,
    labelBoxBkgColor: card,
    labelBoxBorderColor: border,
    noteBkgColor: token('--accent'),
    noteBorderColor: border,
    noteTextColor: foreground,
    // ER diagram attribute rows (defaults lighten mainBkg, which is unreadable in dark mode).
    rowOdd: card,
    rowEven: mix(card, token('--muted')),
  };
}
