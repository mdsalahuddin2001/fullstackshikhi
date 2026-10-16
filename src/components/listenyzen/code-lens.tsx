'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import tours from '@/lib/listenyzen/code-tours.json';

/** Source excerpts are static: selecting a step only highlights and explains a line. */
export function CodeLens({ tour }: { tour: keyof typeof tours }) {
  const data = tours[tour];
  const [step, setStep] = useState(0);
  const note = data.notes[step];
  return (
    <section className="ly-panel not-prose" aria-label={data.title}>
      <div className="ly-panel-head">
        <span className="ly-eyebrow">Code lens · actual repository source</span>
        <h2>{data.title}</h2>
      </div>
      <div className="ly-panel-body">
        <p className="ly-caption"><code>{data.file}</code> · starts at line {data.line}</p>
        <div className="ly-chips" aria-label="Explanation steps">
          {data.notes.map((item, i) => (
            <button key={item.label} aria-pressed={i === step} onClick={() => setStep(i)}>
              {i + 1}. {item.label}
            </button>
          ))}
        </div>
        <div className="ly-detail" aria-live="polite">
          <span className="ly-eyebrow">Line {data.line + note.line}</span>
          <h3>{note.label}</h3>
          <p>{note.detail}</p>
        </div>
        <pre className="ly-source" tabIndex={0} aria-label={`${data.title}, source code`}>
          <code>{data.code.split('\n').map((line, i) => (
            <span key={i} className="ly-source-line" data-highlight={i === note.line}>
              <span aria-hidden="true" className="ly-line-number">{data.line + i}</span>
              <span>{line || ' '}</span>{'\n'}
            </span>
          ))}</code>
        </pre>
        <div className="ly-controls">
          <button disabled={step === 0} onClick={() => setStep(step - 1)}><ChevronLeft size={16} />Previous explanation</button>
          <button disabled={step === data.notes.length - 1} onClick={() => setStep(step + 1)}>Next explanation<ChevronRight size={16} /></button>
        </div>
        <p className="ly-caption">Read-only excerpt from revision aebd2800. Imports and surrounding declarations are in the source file; this panel does not execute backend code.</p>
      </div>
    </section>
  );
}
