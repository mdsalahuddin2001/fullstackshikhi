'use client';

import { use, useId, useSyncExternalStore } from 'react';
import { useTheme } from 'fumadocs-ui/provider/base';

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
  const { resolvedTheme } = useTheme();
  const { default: mermaid } = use(cachePromise('mermaid', () => import('mermaid')));

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'loose',
    fontFamily: 'inherit',
    themeCSS: 'margin: 1.5rem auto 0;',
    theme: 'base',
    darkMode: resolvedTheme === 'dark',
    themeVariables: themeFromCss(),
  });

  const { svg, bindFunctions } = use(
    cachePromise(`${chart}-${resolvedTheme}`, () =>
      mermaid.render(id.replaceAll(':', ''), chart.replaceAll('\\n', '\n')),
    ),
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
  };
}
