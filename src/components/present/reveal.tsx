import type { ReactNode } from 'react';
import { Steps as FumaSteps } from 'fumadocs-ui/components/steps';

/**
 * In present mode, content appears one keypress at a time.
 * - `<Reveal>`: the whole block is one step.
 * - `<Reveal each>`: each child is a step; a Markdown list reveals item by item.
 */
export function Reveal({ each, children }: { each?: boolean; children: ReactNode }) {
  return each ? <div data-reveal-each="">{children}</div> : <div data-reveal="">{children}</div>;
}

/** Fumadocs `<Steps>` plus `reveal`, which shows one step per keypress in present mode. */
export function Steps({ reveal, children }: { reveal?: boolean; children: ReactNode }) {
  if (!reveal) return <FumaSteps>{children}</FumaSteps>;
  return (
    <div className="fd-steps" data-reveal-each="">
      {children}
    </div>
  );
}
