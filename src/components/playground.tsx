import type { ReactNode } from 'react';
import { Play } from 'lucide-react';

/**
 * Placeholder for runnable code. Wrap a code block now; when live execution
 * lands (e.g. PGlite for SQL), only this component changes, not the content.
 */
export function Playground({ lang, children }: { lang?: string; children: ReactNode }) {
  return (
    <div className="not-prose my-4 overflow-hidden rounded-xl border bg-fd-card" data-playground={lang}>
      <div className="flex items-center justify-between border-b px-3 py-1.5 text-xs text-fd-muted-foreground">
        <span>Playground{lang ? ` · ${lang}` : ''}</span>
        <button
          type="button"
          disabled
          title="Live execution coming soon"
          className="inline-flex items-center gap-1 opacity-50"
        >
          <Play className="size-3" /> Run
        </button>
      </div>
      <div className="[&_figure]:m-0 [&_figure]:rounded-none [&_figure]:border-0 [&_figure]:shadow-none">{children}</div>
    </div>
  );
}
