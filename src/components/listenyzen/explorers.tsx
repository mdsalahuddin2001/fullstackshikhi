'use client';

import { useState, type ReactNode } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, Database, GitBranch, LockKeyhole, RotateCcw, Search, Workflow } from 'lucide-react';
import models from '@/lib/listenyzen/models.json';
import routes from '@/lib/listenyzen/routes.json';

function Panel({ label, title, children }: { label: string; title: string; children: ReactNode }) {
  return <section className="ly-panel not-prose" aria-label={title}><div className="ly-panel-head"><span className="ly-eyebrow">{label}</span><h2>{title}</h2></div><div className="ly-panel-body">{children}</div></section>;
}

const systems = [
  { name: 'API', icon: Workflow, detail: 'Express receives browser requests and signed Meta webhooks. It authenticates, scopes access, enqueues webhook entries and serves Socket.IO.', file: 'src/app.ts → src/server.ts', links: ['MongoDB', 'Redis', 'Meta', 'Storage'] },
  { name: 'Worker', icon: GitBranch, detail: 'A separate process consumes BullMQ jobs, writes domain records, recalculates SLA and broadcasts through the Redis emitter. It has no HTTP listener.', file: 'src/worker.ts', links: ['Redis', 'MongoDB', 'Meta'] },
  { name: 'MongoDB', icon: Database, detail: 'Fourteen base collections store tenants, channel identities, conversations, support episodes and versioned settings. Mongoose references do not enforce foreign keys.', file: 'src/libraries/db/index.ts', links: ['API', 'Worker'] },
  { name: 'Redis', icon: GitBranch, detail: 'Holds the webhooks queue and transports realtime events between processes. It is not the HTTP authentication session store.', file: 'src/libraries/queue/index.ts', links: ['API', 'Worker'] },
  { name: 'Meta', icon: Workflow, detail: 'Facebook, Instagram and WhatsApp deliver events and accept outbound messages. Provider acceptance and local persistence are separate operations.', file: 'src/libraries/{facebook,instagram,whatsapp}', links: ['API', 'Worker'] },
  { name: 'Storage', icon: Database, detail: 'Message media uses S3-compatible storage; logos and avatars use local uploads. Storage keys are persistent identities; signed URLs expire.', file: 'src/libraries/aws/s3 + storage/local.ts', links: ['API'] },
];
export function SystemWalkthrough() {
  const [active, setActive] = useState('API');
  const item = systems.find(s => s.name === active)!;
  return <Panel label="01 / system map" title="Select a part of the backend"><div className="ly-system-grid">{systems.map(s => <button key={s.name} onClick={() => setActive(s.name)} aria-pressed={active === s.name} className="ly-system-node"><s.icon size={20} /><strong>{s.name}</strong><span>{active === s.name ? 'Selected' : item.links.includes(s.name) ? 'Connected' : 'Explore'}</span></button>)}</div><div className="ly-detail" aria-live="polite"><h3>{item.name}</h3><p>{item.detail}</p><code>{item.file}</code><p className="ly-caption">Connects with: {item.links.join(' · ')}</p></div></Panel>;
}

const flows = {
  read: [
    ['Browser request', 'GET /api/v1/conversations?brandId=…&limit=20', 'The client sends its access cookie. This path reads domain data; it does not contact Meta.'],
    ['Global middleware', 'server.ts', 'Cookie parsing, security headers, CORS, rate limiting and request context precede the feature route.'],
    ['Identity & role', 'authenticate → authorize', 'Verify JWT and active-company access, then require an allowed route role.'],
    ['Parsed contract', 'validateQuery(listConversationsSchema)', 'Coerce the limit, validate ObjectIds and reject unsupported cursor parameters.'],
    ['Brand visibility', 'getBrandById(id, getBrandScope(user))', 'Apply tenant scope and direct/department brand access. Inaccessible brands return 404.'],
    ['Database read', 'listConversations → QueryBuilder', 'Mandatory brand filter, optional assignment/tags, descending lastMessageAt + _id cursor.'],
    ['Response', 'paginatedSuccessResponse', 'Return data and pagination at the top level. Completion logging records duration and status.'],
  ],
  webhook: [
    ['Provider delivery', 'POST /api/v1/webhooks/facebook', 'Meta sends one or more entries. Each entry can contain multiple events.'],
    ['Verify signature', 'receive → raw-body HMAC', 'Verify original request bytes. Invalid signatures return 403.'],
    ['Durable handoff', 'enqueueBulk → Redis webhooks queue', 'Enqueue one job per entry. Failure returns 500 so the sender can retry.'],
    ['Acknowledge', 'HTTP 200 to Meta', 'Acknowledgment means queued, not yet visible in the inbox.'],
    ['Consume', 'worker.ts → processFbEntry', 'Resolve operational brand, dispatch events, retry an entry when processing fails.'],
    ['Persist & derive', 'Message → Session → SLA', 'Deduplicate provider IDs, update domain records and derived state. Multi-document writes are not atomic.'],
    ['Realtime delivery', 'Redis emitter → API → brand room', 'The agent receives the event. A missed socket event does not undo persistence.'],
  ],
};
export function RequestFlow() {
  const [kind, setKind] = useState<'read' | 'webhook'>('read');
  const [step, setStep] = useState(0);
  const flow = flows[kind];
  return <Panel label="02 / trace a request" title="Follow the execution, one step at a time"><div className="ly-segment">{(['read', 'webhook'] as const).map(k => <button key={k} aria-pressed={kind === k} onClick={() => { setKind(k); setStep(0); }}>{k === 'read' ? 'Inbox read' : 'Incoming webhook'}</button>)}</div><ol className="ly-flow">{flow.map(([name], i) => <li key={name}><button aria-current={step === i ? 'step' : undefined} onClick={() => setStep(i)}><span>{String(i + 1).padStart(2, '0')}</span>{name}</button></li>)}</ol><div className="ly-detail" aria-live="polite"><span className="ly-eyebrow">Step {step + 1} of {flow.length}</span><h3>{flow[step][0]}</h3><code>{flow[step][1]}</code><p>{flow[step][2]}</p></div><div className="ly-controls"><button disabled={step === 0} onClick={() => setStep(step - 1)}><ChevronLeft size={16} /> Previous</button><button disabled={step === flow.length - 1} onClick={() => setStep(step + 1)}>Next <ChevronRight size={16} /></button></div></Panel>;
}

export function EntityExplorer() {
  const [selected, setSelected] = useState('Conversation');
  const [query, setQuery] = useState('');
  const model = models.find(m => m.name === selected)!;
  const visible = models.filter(m => m.name.toLowerCase().includes(query.toLowerCase()));
  return <Panel label="03 / schema explorer" title="Inspect an entity and its neighbors"><label className="ly-search"><Search size={17} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a model…" aria-label="Find a model" /></label><div className="ly-entity-layout"><div className="ly-model-list" aria-label="Models">{visible.map(m => <button key={m.name} aria-pressed={selected === m.name} onClick={() => setSelected(m.name)}><Database size={15} />{m.name}<span>{m.fields.length}</span></button>)}{visible.length === 0 && <p>No model matches.</p>}</div><div className="ly-detail" aria-live="polite"><h3>{model.name}</h3><code>{model.source}</code><p className="ly-caption">Related entities — select one to continue exploring. These are references and usage relationships, not enforced foreign keys.</p><div className="ly-chips">{model.relations.map(r => <button key={r} onClick={() => setSelected(r)}>{r}<ArrowRight size={12} /></button>)}</div><div className="ly-table-scroll"><table><thead><tr><th>Field</th><th>Declared type</th></tr></thead><tbody>{model.fields.map(f => <tr key={f.name}><td><code>{f.name}</code></td><td><code>{f.type}</code></td></tr>)}</tbody></table></div><p className="ly-caption">Top-level interface fields; ? means optional. Nested channel objects and runtime constraints are documented below. Common audit fields come from baseSchema.</p></div></div></Panel>;
}

export function AccessSimulator() {
  const [role, setRole] = useState('query_manager');
  const [sameTenant, setSameTenant] = useState(true);
  const [brandAccess, setBrandAccess] = useState(true);
  const [active, setActive] = useState(true);
  const [assigned, setAssigned] = useState('self');
  const superAdmin = role === 'super_admin';
  const agent = role === 'query_manager';
  const identity = active || superAdmin;
  const visible = identity && (superAdmin || sameTenant) && (!agent || brandAccess);
  const actionable = visible && (!agent || assigned === 'self');
  const claimable = visible && agent && ['none', 'department', 'team'].includes(assigned);
  const result = !identity ? '401 · Company inactive' : !visible ? '404 · Resource not visible' : !actionable ? '403 · Assignment policy denies action' : 'Allowed · Domain checks can continue';
  return <Panel label="04 / access decision" title="Why can this agent read but not reply?"><p className="ly-caption">Illustrates a non-resolved customer conversation with a valid JWT and current pool membership. Sending still requires an active brand, usable channel credentials and provider acceptance.</p><div className="ly-form-grid"><label>Caller role<select value={role} onChange={e => setRole(e.target.value)}>{['query_manager', 'company_admin', 'company_owner', 'super_admin'].map(r => <option key={r}>{r}</option>)}</select></label><label>Current assignment<select value={assigned} onChange={e => setAssigned(e.target.value)}><option value="self">This agent</option><option value="department">This agent’s department pool</option><option value="team">This agent’s team pool</option><option value="other">Someone else</option><option value="none">Unassigned</option></select></label></div><div className="ly-toggles">{[[active, setActive, 'Caller’s company is active'], [sameTenant, setSameTenant, 'Resource is in the caller’s company'], [brandAccess, setBrandAccess, 'Agent has direct, team or department brand access']] .map(([value, setter, label]) => <label key={String(label)}><input type="checkbox" checked={value as boolean} onChange={e => (setter as (v: boolean) => void)(e.target.checked)} />{label as string}</label>)}</div><div className="ly-verdict" aria-live="polite"><LockKeyhole size={20} /><div><strong>{result}</strong><p>Read: {visible ? 'allowed' : 'denied'} · Modify: {actionable ? 'allowed' : 'denied'} · Claim: {claimable ? 'available' : 'not available'} · Reassign: {visible && !agent ? 'allowed for managers' : 'denied'}</p></div></div><p className="ly-caption">Query managers must claim their pool before modifying work. Owners/admins remain company-scoped. Brand visibility and mutation permission are separate decisions.</p></Panel>;
}

export function SessionSimulator() {
  const [status, setStatus] = useState('resolved');
  const [event, setEvent] = useState('incoming');
  const opens = status === 'none' || (status === 'resolved' && event !== 'outgoing');
  const resumes = (status === 'unresolved' && event === 'incoming') || (status === 'hold' && event !== 'incoming');
  return <Panel label="05 / episode boundary" title="Does this message open a new session?"><div className="ly-form-grid"><label>Latest session<select value={status} onChange={e => setStatus(e.target.value)}>{['none', 'pending', 'resolved', 'unresolved', 'hold'].map(v => <option key={v}>{v}</option>)}</select></label><label>Next message<select value={event} onChange={e => setEvent(e.target.value)}><option value="incoming">Customer message</option><option value="outgoing">Ordinary agent reply / echo</option><option value="reengagement">Explicit re-engagement send</option></select></label></div><div className="ly-episode" aria-live="polite"><div><span>Before</span><strong>{status === 'none' ? 'No episode' : 'Session #3'}</strong><small>{status}</small></div><ArrowRight /><div data-new={opens}><span>After</span><strong>{opens ? `Session #${status === 'none' ? 1 : 4}` : 'Session #3'}</strong><small>{opens ? 'pending · new episode' : `${resumes ? 'pending' : status} · continued`}</small></div></div><p>{opens ? 'A new pending episode is created and its summary is synchronized onto the conversation.' : resumes ? 'The same episode returns to pending: a customer message reopens unresolved work, and a qualifying agent reply ends hold. This example assumes a new, non-automatic message sent after the status change.' : 'The message stays in the latest episode. A customer message does not end hold; an agent reply does not reopen unresolved work. Ordinary replies after resolution do not automatically reopen it.'}</p><p className="ly-caption">Public comment threads follow a different rule: a late customer reply does not reopen their resolved SLA cycle.</p></Panel>;
}

export function SlaClock() {
  const [firstWait, setFirstWait] = useState(35);
  const [silence, setSilence] = useState(90);
  const [secondWait, setSecondWait] = useState(20);
  const [target, setTarget] = useState(60);
  const charged = firstWait + secondWait;
  const total = charged + silence;
  const ratio = charged / target;
  return <Panel label="06 / resolution clock" title="Resolution charges pending time and pauses on hold"><p className="ly-caption">A completed timeline entirely within business hours: pending, then an explicit hold, then pending until wrap-up. Pending time includes customer silence after a reply.</p><div className="ly-sliders">{[{ label: 'Pending before hold', value: firstWait, set: setFirstWait, max: 120 }, { label: 'Explicit hold duration', value: silence, set: setSilence, max: 240 }, { label: 'Pending after hold', value: secondWait, set: setSecondWait, max: 120 }, { label: 'Resolution target', value: target, set: setTarget, max: 240 }].map(s => <label key={s.label}><span>{s.label}<strong>{s.value} min</strong></span><input type="range" min={s.label === 'Resolution target' ? 5 : 0} max={s.max} value={s.value} onChange={e => s.set(Number(e.target.value))} /></label>)}</div><div className="ly-timeline" aria-label={`${firstWait} minutes charged, ${silence} minutes paused, ${secondWait} minutes charged`}><span style={{ flex: Math.max(firstWait, 1) }}>Pending</span><span className="ly-paused" style={{ flex: Math.max(silence, 1) }}>Paused</span><span style={{ flex: Math.max(secondWait, 1) }}>Pending</span></div><div className="ly-stats" aria-live="polite"><div><strong>{total}<small>min</small></strong><span>Elapsed</span></div><div><strong>{charged}<small>min</small></strong><span>Charged</span></div><div><strong>{Math.round(ratio * 100)}<small>%</small></strong><span>{ratio > 1 ? 'Target breached' : ratio > .8 ? 'Past 80% threshold' : 'Within target'}</span></div></div><p className="ly-caption">Changing the paused interval changes elapsed time, never charged time. Exactly 100% is still on time for this completed resolution calculation. Actual records project dueAt during pending spans using historical business hours.</p><button onClick={() => { setFirstWait(35); setSilence(90); setSecondWait(20); setTarget(60); }}><RotateCcw size={14} /> Reset example</button></Panel>;
}

export function EndpointExplorer() {
  const [query, setQuery] = useState('');
  const [method, setMethod] = useState('ALL');
  const [selected, setSelected] = useState<string | null>(null);
  const found = routes.filter(r => (method === 'ALL' || r.method === method) && r.path.toLowerCase().includes(query.toLowerCase()));
  return <Panel label="07 / route catalog" title="Find the entry point for your change"><div className="ly-form-grid"><label className="ly-search"><Search size={17} /><input placeholder="Search path, feature or action…" aria-label="Search endpoints" value={query} onChange={e => setQuery(e.target.value)} /></label><label>Method<select value={method} onChange={e => setMethod(e.target.value)}>{['ALL', 'GET', 'POST', 'PATCH', 'PUT', 'DELETE'].map(m => <option key={m}>{m}</option>)}</select></label></div><p className="ly-caption" aria-live="polite">{found.length} of {routes.length} routes · Reference only; no requests are sent.</p><div className="ly-route-list">{found.map(r => { const id = r.method + r.path; return <div key={id}><button aria-expanded={selected === id} onClick={() => setSelected(selected === id ? null : id)}><span className="ly-method" data-method={r.method}>{r.method}</span><code>{r.path}</code><ChevronRight size={14} /></button>{selected === id && <div className="ly-route-detail"><strong>{r.method === 'GET' ? 'Read / verification entry point' : 'State-changing or integration entry point'}</strong><p>Locate this literal path in the corresponding feature router. Inspect its middleware, Zod validation and service calls before changing the contract.</p><p className="ly-caption">Do not infer authorization from the HTTP method: webhook, OAuth and generic file routes have distinct access behavior. See the security chapter.</p></div>}</div>; })}{!found.length && <p>No endpoints match. Try “sessions” or “whatsapp”.</p>}</div></Panel>;
}
