'use client';

import { useState } from 'react';
import { Search, Copy, Check, ChevronDown } from 'lucide-react';
import contracts from '@/lib/listenyzen/api-reference.json';

type Endpoint = (typeof contracts)[number];
const format = (value: unknown) => typeof value === 'string' ? value : JSON.stringify(value, null, 2);

function Example({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setError(false);
      setTimeout(() => setCopied(false), 1800);
    } catch { setError(true); }
  }
  return <div className="ly-api-example">
    <div className="ly-api-example-head"><strong>{label}</strong><button type="button" onClick={copy} aria-label={`Copy ${label}`}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Copied' : 'Copy'}</button></div>
    {error && <p role="status">Clipboard unavailable. Select and copy the text below.</p>}
    <pre tabIndex={0} aria-label={label}><code>{value}</code></pre>
  </div>;
}

function EndpointDetail({ endpoint: e }: { endpoint: Endpoint }) {
  const [view, setView] = useState('Examples');
  return <div className="ly-api-detail">
    <p><strong>Access:</strong> {e.auth}</p>
    <p className="ly-caption">Source: <code>{e.source}</code></p>
    <div className="ly-segment" aria-label="Endpoint detail view">
      {['Examples', 'Validation', 'Errors & behavior', 'Handler code'].map(tab => <button type="button" key={tab} aria-pressed={view === tab} onClick={() => setView(tab)}>{tab}</button>)}
    </div>
    {view === 'Examples' && <>
      <p className="ly-caption">Illustrative values · entity fields abbreviated · requests are never executed here.</p>
      <Example label={`Request · ${e.requestType}`} value={e.request} />
      <Example label={`Response · HTTP ${e.status} · ${e.contentType}`} value={format(e.response)} />
    </>}
    {view === 'Validation' && <>
      <p>Path placeholders identify existing records. The curl example substitutes fictional IDs. These are the route’s validation declarations; referenced constants and shared schemas live in their source modules.</p>
      {e.validation.length ? e.validation.map((v, i) => <div key={`${v.kind}-${i}`}><p className="ly-caption">{v.file}</p><Example label={`${v.kind} · ${v.name}`} value={v.code} /></div>) : <p>No validateBody/validateQuery/validateParams declaration in this handler. Provider verification, upload middleware and service checks may still validate inputs.</p>}
    </>}
    {view === 'Errors & behavior' && <>
      <ul>{e.notes.map((note, i) => <li key={i}>{note}</li>)}</ul>
      <p>Shared middleware and service failures also apply. The following are literal errors in the route handler, where present.</p>
      {e.errors.map((error, i) => <Example key={i} label={`Error example · HTTP ${error.status}`} value={format({ success: false, status: 'error', message: error.message })} />)}
      {!e.errors.length && <p>See the shared errors below and the called service for additional failure paths.</p>}
    </>}
    {view === 'Handler code' && <Example label={e.source} value={e.handler || 'See server/src/routes.ts for this health handler.'} />}
  </div>;
}

export function ApiReference() {
  const [query, setQuery] = useState('');
  const [method, setMethod] = useState('ALL');
  const [group, setGroup] = useState('ALL');
  const [selected, setSelected] = useState<string | null>(null);
  const groups = [...new Set(contracts.map(e => e.group))].sort();
  const found = contracts.filter(e => (method === 'ALL' || e.method === method) && (group === 'ALL' || e.group === group) && `${e.path} ${e.group}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="ly-panel ly-api not-prose" aria-label="Complete API reference">
    <div className="ly-panel-head"><span className="ly-eyebrow">113 operations / source-derived examples</span><h2>Explore requests and responses</h2></div>
    <div className="ly-panel-body">
      <label className="ly-search"><Search size={17} /><input aria-label="Search API endpoints" placeholder="Search endpoints, e.g. assignment or templates…" value={query} onChange={e => setQuery(e.target.value)} /></label>
      <div className="ly-form-grid ly-api-filters">
        <label>Method<select value={method} onChange={e => setMethod(e.target.value)}>{['ALL', 'GET', 'POST', 'PATCH', 'PUT', 'DELETE'].map(m => <option key={m}>{m}</option>)}</select></label>
        <label>Feature<select value={group} onChange={e => setGroup(e.target.value)}>{['ALL', ...groups].map(g => <option key={g} value={g}>{g === 'ALL' ? 'All features' : g}</option>)}</select></label>
      </div>
      <p className="ly-caption" aria-live="polite">{found.length} of {contracts.length} operations. Select a route to read its examples.</p>
      <div className="ly-api-list">{found.map(e => {
        const key = `${e.method} ${e.path}`;
        const open = selected === key;
        return <article key={key}>
          <button type="button" className="ly-api-heading" aria-expanded={open} onClick={() => setSelected(open ? null : key)}>
            <span className="ly-method" data-method={e.method}>{e.method}</span><code>{e.path}</code><ChevronDown size={16} aria-hidden="true" />
          </button>
          {open && <EndpointDetail endpoint={e} />}
        </article>;
      })}</div>
      {!found.length && <p>No endpoints match. Clear the search or select all features.</p>}
    </div>
  </section>;
}
