'use client';

import { useMemo, useState } from 'react';
import {
  ACTIONS,
  ADMIN_TIER,
  ASSIGNEE_LABEL,
  GROUPS,
  PERMISSIONS,
  REVISION,
  ROLE_LABEL,
  ROUTES,
  SEEDED,
  STATUS_MOVES,
  SUBJECTS,
  abilityOf,
  actGate,
  brandScope,
  claimable,
  routeVerdict,
  statusNeeds,
  type AppAbility,
  type Assignee,
  type Role,
} from '@/lib/listenyzen-rbac/model';

// Interactive study tools for the Listenyzen RBAC docs. Every answer comes from the real CASL
// engine (@casl/ability, the version Listenyzen pins) running the real permission catalogue.

const ROLES: Role[] = ['super_admin', 'company_owner', 'company_admin', 'query_manager'];

const PRESETS: Record<string, { label: string; permissions: string[] }> = {
  seeded: { label: 'Seeded “Query manager” role', permissions: SEEDED },
  readOnly: { label: 'Read-only agent (custom)', permissions: ['conversation.read', 'comment.read'] },
  supervisor: {
    label: 'Supervisor (custom)',
    permissions: [...SEEDED, 'conversation.assign', 'analytics.brand_health.read', 'analytics.scorecard.read.all', 'brand.sla.read'],
  },
  none: { label: 'A role with no permissions', permissions: [] },
};

function RoleSelect({ value, onChange, label = 'Signed-in role' }: { value: Role; onChange: (r: Role) => void; label?: string }) {
  return (
    <label className="rb-field">
      {label}
      <select value={value} onChange={e => onChange(e.target.value as Role)}>
        {ROLES.map(r => (
          <option key={r} value={r}>
            {ROLE_LABEL[r]}
          </option>
        ))}
      </select>
    </label>
  );
}

function PresetSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="rb-field">
      Their company role
      <select value={value} onChange={e => onChange(e.target.value)}>
        {Object.entries(PRESETS).map(([k, p]) => (
          <option key={k} value={k}>
            {p.label}
          </option>
        ))}
      </select>
    </label>
  );
}

const Yes = ({ ok }: { ok: boolean }) => <span className="rb-yes" data-ok={ok}>{ok ? '✓' : '✗'}</span>;

/** Tick permissions, watch the CASL rules and the action × subject grid change. */
export function PermissionPlayground() {
  const [role, setRole] = useState<Role>('query_manager');
  const [keys, setKeys] = useState<string[]>(SEEDED);
  const [action, setAction] = useState('reply');
  const [subject, setSubject] = useState('Conversation');
  const ability = useMemo(() => abilityOf(role, keys), [role, keys]);
  const admin = ADMIN_TIER.includes(role);
  const toggle = (key: string) => setKeys(k => (k.includes(key) ? k.filter(x => x !== key) : [...k, key]));
  const shownActions = ACTIONS.filter(a => a !== 'manage');
  const shownSubjects = SUBJECTS.filter(s => s !== 'all');
  const rule = ability.relevantRuleFor(action, subject);

  return (
    <div className="rb-panel not-prose">
      <div className="rb-head">
        <RoleSelect value={role} onChange={setRole} />
        {!admin && (
          <div className="rb-buttons">
            {Object.entries(PRESETS).map(([k, p]) => (
              <button key={k} onClick={() => setKeys(p.permissions)}>
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="rb-grid2">
        <div>
          <h4>Permissions {admin ? '(ignored for the admin tier)' : `(${keys.length} of ${PERMISSIONS.length})`}</h4>
          {GROUPS.map(group => (
            <fieldset key={group} disabled={admin} className="rb-group">
              <legend>{group}</legend>
              {PERMISSIONS.filter(p => p.group === group).map(p => (
                <label key={p.key} title={p.description}>
                  <input type="checkbox" checked={admin || keys.includes(p.key)} onChange={() => toggle(p.key)} />
                  <span>{p.label}</span>
                  <code>{p.key}</code>
                </label>
              ))}
            </fieldset>
          ))}
        </div>
        <div>
          <h4>Ask CASL</h4>
          <div className="rb-ask">
            <code>ability.can(</code>
            <select value={action} onChange={e => setAction(e.target.value)}>
              {ACTIONS.map(a => (
                <option key={a}>{a}</option>
              ))}
            </select>
            <code>,</code>
            <select value={subject} onChange={e => setSubject(e.target.value)}>
              {SUBJECTS.map(s => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <code>)</code>
            <strong data-ok={ability.can(action, subject)}>{String(ability.can(action, subject))}</strong>
          </div>
          <p className="rb-note">
            {rule
              ? `Decided by the rule ${rule.inverted ? 'cannot' : 'can'}(${JSON.stringify(rule.action)}, ${JSON.stringify(rule.subject)}).`
              : 'No rule matches, so the answer is no (CASL denies by default).'}
          </p>
          <h4>The rules the server sends the client ({ability.rules.length})</h4>
          <pre className="rb-pre">{JSON.stringify(ability.rules, null, 1)}</pre>
        </div>
      </div>
      <h4>Everything this ability allows</h4>
      <div className="lz-scroll">
        <table className="rb-matrix">
          <thead>
            <tr>
              <th />
              {shownSubjects.map(s => (
                <th key={s}>
                  <span>{s}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shownActions.map(a => (
              <tr key={a}>
                <th>{a}</th>
                {shownSubjects.map(s => (
                  <td key={s} data-ok={ability.can(a, s)}>
                    {ability.can(a, s) ? '✓' : ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Every HTTP route and its gates, with a verdict for the chosen caller. */
export function RouteGates() {
  const [role, setRole] = useState<Role>('query_manager');
  const [preset, setPreset] = useState('seeded');
  const [query, setQuery] = useState('');
  const [only, setOnly] = useState<'all' | 'denied' | 'open'>('all');
  const ability = useMemo(() => abilityOf(role, PRESETS[preset].permissions), [role, preset]);
  const rows = ROUTES.map(r => ({ r, v: routeVerdict(r, role, ability) }))
    .filter(({ r }) => `${r.method} ${r.path}`.toLowerCase().includes(query.toLowerCase()))
    .filter(({ r, v }) => (only === 'denied' ? !v.ok : only === 'open' ? !r.authenticated : true));
  return (
    <div className="rb-panel not-prose">
      <div className="rb-head">
        <RoleSelect value={role} onChange={setRole} />
        {role === 'query_manager' && <PresetSelect value={preset} onChange={setPreset} />}
        <label className="rb-field">
          Search
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="/sessions, overview, POST…" />
        </label>
        <label className="rb-field">
          Show
          <select value={only} onChange={e => setOnly(e.target.value as typeof only)}>
            <option value="all">All routes</option>
            <option value="denied">Denied for this caller</option>
            <option value="open">Public (no sign-in)</option>
          </select>
        </label>
      </div>
      <p className="rb-note">
        {rows.length} of {ROUTES.length} routes · Listenyzen {REVISION} · found by a static scan of the route files. Brand scope and record checks inside services are not listed.
      </p>
      <div className="lz-scroll rb-routes">
        <table>
          <thead>
            <tr>
              <th>Route</th>
              <th>Gate</th>
              <th>Also checked</th>
              <th>Verdict</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ r, v }) => (
              <tr key={r.method + r.path + r.file}>
                <td>
                  <span className="rb-method" data-m={r.method}>
                    {r.method}
                  </span>{' '}
                  <code>{r.path}</code>
                </td>
                <td>
                  {!r.authenticated && <b className="rb-tag" data-k="open">public</b>}
                  {r.roles && <b className="rb-tag" data-k="role">roles: {r.roles.map(x => ROLE_LABEL[x]).join(', ')}</b>}
                  {r.ability && <b className="rb-tag" data-k="ability">{r.ability.map(([a, s]) => `${a} ${s}`).join(' or ')}</b>}
                  {r.authenticated && !r.roles && !r.ability && <b className="rb-tag">any signed-in user</b>}
                </td>
                <td>
                  {r.act && <b className="rb-tag" data-k="act">holds the query</b>}
                  {r.claim && <b className="rb-tag" data-k="act">claimable / held</b>}
                  {r.statusGuard && <b className="rb-tag" data-k="act">status move</b>}
                  {r.limiter && <b className="rb-tag">rate limit</b>}
                </td>
                <td>
                  <Yes ok={v.ok} /> <small>{v.reason}</small>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface Operation {
  label: string;
  route: string;
  checks: [string, string][];
  roles?: Role[];
  act?: boolean;
  claim?: boolean;
  forward?: boolean;
  move?: [string, string];
  subject?: 'Conversation' | 'Comment';
}

const OPERATIONS: Operation[] = [
  { label: 'Read a DM thread', route: 'GET /api/v1/conversations/:id', checks: [['read', 'Conversation']] },
  { label: 'Reply to the customer', route: 'POST /api/v1/conversations/:id/messages', checks: [['reply', 'Conversation']], act: true },
  { label: 'Assign to me (claim)', route: 'POST /api/v1/conversations/:id/claim', checks: [['claim', 'Conversation']], claim: true },
  { label: 'Forward to a teammate', route: 'POST /api/v1/conversations/:id/forward', checks: [['forward', 'Conversation']], forward: true },
  { label: 'Route it to someone (assign)', route: 'PATCH /api/v1/sessions/:id/assignment', checks: [['assign', 'Conversation']] },
  { label: 'Put on hold (pending → hold)', route: 'PATCH /api/v1/sessions/:id/status', checks: [['read', 'Conversation']], act: true, move: ['pending', 'hold'], subject: 'Conversation' },
  { label: 'Wrap up as resolved', route: 'PATCH /api/v1/sessions/:id/wrap-up', checks: [['wrapUp', 'Conversation']], act: true, move: ['pending', 'resolved'], subject: 'Conversation' },
  { label: 'Reopen (resolved → pending)', route: 'PATCH /api/v1/sessions/:id/status', checks: [['read', 'Conversation']], act: true, move: ['resolved', 'pending'], subject: 'Conversation' },
  { label: 'Add an internal note', route: 'POST /api/v1/sessions/:id/notes', checks: [['create', 'Note']], act: true },
  { label: 'Hide a comment', route: 'POST /api/v1/comments/:id/hide', checks: [['hide', 'Comment']], act: true },
  { label: 'See Team Performance', route: 'GET /api/v1/brands/:brandId/overview/team', checks: [['read', 'TeamFigures']] },
  { label: 'Change SLA targets', route: 'PUT /api/v1/brands/:brandId/settings/:type', checks: [['update', 'SlaSettings']] },
  { label: 'List the company’s users', route: 'GET /api/v1/users', checks: [], roles: ['super_admin', 'company_owner', 'company_admin'] },
];

type Step = { name: string; ok: boolean | null; detail: string; code?: string };

/** Pick a person and an action; walk every gate in order and see where it stops. */
export function RequestSimulator() {
  const [token, setToken] = useState<'valid' | 'expired' | 'missing' | 'forged'>('valid');
  const [role, setRole] = useState<Role>('query_manager');
  const [preset, setPreset] = useState('seeded');
  const [company, setCompany] = useState(true);
  const [brand, setBrand] = useState<'granted' | 'notGranted' | 'otherCompany'>('granted');
  const [assignee, setAssignee] = useState<Assignee>('me');
  const [op, setOp] = useState(1);
  const operation = OPERATIONS[op];
  const ability: AppAbility = useMemo(() => abilityOf(role, PRESETS[preset].permissions), [role, preset]);

  const steps: Step[] = [];
  let stopped: { code: number; message: string } | null = null;
  const push = (s: Step, fail?: { code: number; message: string }) => {
    if (stopped) return steps.push({ ...s, ok: null, detail: 'Not reached' });
    steps.push(s);
    if (s.ok === false && fail) stopped = fail;
  };

  push(
    { name: '1 · authenticate: read and verify the access token', ok: token === 'valid', detail: { valid: 'Signature valid and not expired: req.user is set from its claims.', expired: 'jwt.verify throws TokenExpiredError (logged at info: routine every 15 min). The client refreshes and retries.', missing: 'No Bearer header and no access_token cookie.', forged: 'jwt.verify fails on the signature (logged as a warning).' }[token] },
    { code: 401, message: 'Unauthenticated (every failure inside authenticate is reported the same way)' }
  );
  const companyOk = role === 'super_admin' || company;
  push(
    { name: '2 · company is active (assertActiveCompanyAccess)', ok: companyOk, detail: role === 'super_admin' ? 'Super admins belong to no company: always passes.' : company ? 'Company exists and is active.' : 'The company was suspended: takes effect on this very request, even with a fresh token.' },
    { code: 401, message: 'Unauthenticated' }
  );
  if (operation.roles) {
    const ok = operation.roles.includes(role);
    push({ name: '3 · authorize(...roles): role list', ok, detail: `Allowed: ${operation.roles.map(r => ROLE_LABEL[r]).join(', ')}.`, code: `authorize(${operation.roles.map(r => `'${r}'`).join(', ')})` }, { code: 403, message: 'You do not have permission to access this resource' });
  } else {
    const ok = operation.checks.some(([a, s]) => ability.can(a, s));
    push(
      {
        name: '3 · requireAbility: CASL permission',
        ok,
        detail: ADMIN_TIER.includes(role) ? 'Admin tier: can(manage, all), except claim and forward.' : ok ? `Their role grants ${operation.checks.map(c => c.join(' ')).join(' or ')}.` : `Their role does not grant ${operation.checks.map(c => c.join(' ')).join(' or ')}.`,
        code: `requireAbility(${operation.checks.map(([a, s]) => `['${a}', '${s}']`).join(', ')})`,
      },
      { code: 403, message: 'You do not have permission to do this' }
    );
  }
  // Super admin: {} (every brand). Owner / admin: their company. Query manager: their grants too.
  const visible = role === 'super_admin' ? true : role === 'query_manager' ? brand === 'granted' : brand !== 'otherCompany';
  push(
    { name: '4 · brand scope: can they see this brand at all?', ok: visible, detail: brand === 'otherCompany' && role !== 'super_admin' ? 'Another company’s brand: the { companyId } filter matches nothing.' : role === 'query_manager' && brand === 'notGranted' ? 'No department, team or personal grant on the brand: the $or filter matches nothing.' : 'The brand matches the scope filter.' },
    { code: 404, message: 'Brand not found / Conversation not found (404, not 403: it doesn’t reveal the record exists)' }
  );
  if (operation.claim) {
    const ok = assignee === 'me' || claimable(assignee);
    push(
      { name: '5 · claimableFilter: unassigned or one of my pools', ok, detail: assignee === 'me' ? 'Already theirs: answered as already claimed, nothing written.' : ok ? 'The atomic update matches: it is theirs now. Two agents at once: one wins.' : 'Held by another person or another pool: the update matches nothing.' },
      { code: 409, message: 'Someone else has this conversation' }
    );
  }
  if (operation.forward) {
    const ok = assignee === 'me';
    push({ name: '5 · holdsQuery: only the holder forwards', ok, detail: ok ? 'They hold it personally.' : 'Only the current personal holder can forward.' }, { code: 403, message: 'Only the query manager this is assigned to can forward it' });
  }
  if (operation.act) {
    const err = actGate(role, assignee);
    push({ name: '5 · act gate (assertCanAct): do they hold the query?', ok: !err, detail: err ?? (role === 'query_manager' ? 'Assigned to them personally.' : 'Owners and admins may act on any query.') }, { code: 403, message: err ?? '' });
  }
  if (operation.move && operation.subject) {
    const needs = statusNeeds(...operation.move);
    const missing = needs.filter(a => !ability.can(a, operation.subject!));
    push({ name: `6 · status move ${operation.move[0]} → ${operation.move[1]} (statusMoveGuard)`, ok: !missing.length, detail: `Needs ${needs.map(a => `${a} ${operation.subject}`).join(' + ')}${missing.length ? `; missing ${missing.join(', ')}` : ''}.` }, { code: 403, message: 'You do not have permission to do this' });
  }
  const done = stopped as { code: number; message: string } | null;

  return (
    <div className="rb-panel not-prose">
      <div className="rb-head rb-wrap">
        <label className="rb-field">
          Action
          <select value={op} onChange={e => setOp(Number(e.target.value))}>
            {OPERATIONS.map((o, i) => (
              <option key={o.label} value={i}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <RoleSelect value={role} onChange={setRole} />
        {role === 'query_manager' && <PresetSelect value={preset} onChange={setPreset} />}
        <label className="rb-field">
          Access token
          <select value={token} onChange={e => setToken(e.target.value as typeof token)}>
            <option value="valid">Valid</option>
            <option value="expired">Expired (after 15 min)</option>
            <option value="missing">Missing</option>
            <option value="forged">Bad signature</option>
          </select>
        </label>
        <label className="rb-field">
          Company
          <select value={String(company)} onChange={e => setCompany(e.target.value === 'true')}>
            <option value="true">Active</option>
            <option value="false">Suspended</option>
          </select>
        </label>
        <label className="rb-field">
          The brand
          <select value={brand} onChange={e => setBrand(e.target.value as typeof brand)}>
            <option value="granted">Granted to their department / team / them</option>
            <option value="notGranted">Same company, not granted</option>
            <option value="otherCompany">Belongs to another company</option>
          </select>
        </label>
        <label className="rb-field">
          Query held by
          <select value={assignee} onChange={e => setAssignee(e.target.value as Assignee)}>
            {Object.entries(ASSIGNEE_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="rb-note">
        <code>{operation.route}</code>
      </p>
      <ol className="rb-steps">
        {steps.map(s => (
          <li key={s.name} data-ok={s.ok === null ? 'skip' : String(s.ok)}>
            <strong>{s.name}</strong>
            {s.code && <code>{s.code}</code>}
            <span>{s.detail}</span>
          </li>
        ))}
      </ol>
      <div className="rb-result" data-ok={!done}>
        {done ? (
          <>
            <b>HTTP {done.code}</b> {done.message}
          </>
        ) : (
          <>
            <b>Allowed</b> the handler runs.
          </>
        )}
      </div>
    </div>
  );
}

/** Build the brand-visibility filter for a caller and see which brands it matches. */
export function BrandScopeSimulator() {
  const [role, setRole] = useState<Role>('query_manager');
  const [dept, setDept] = useState(true);
  const [team, setTeam] = useState(true);
  const user = { id: 'u_sadia', role, companyId: role === 'super_admin' ? undefined : 'c_acme', departmentId: dept ? 'd_support' : undefined, teamId: team ? 't_day' : undefined };
  const filter = brandScope(user);
  const brands = [
    { name: 'Acme Foods', companyId: 'c_acme', departmentIds: ['d_support'], teamIds: [], queryManagerIds: [] },
    { name: 'Acme Drinks', companyId: 'c_acme', departmentIds: [], teamIds: ['t_day'], queryManagerIds: [] },
    { name: 'Acme Pets', companyId: 'c_acme', departmentIds: [], teamIds: [], queryManagerIds: ['u_sadia'] },
    { name: 'Acme Labs', companyId: 'c_acme', departmentIds: ['d_sales'], teamIds: [], queryManagerIds: [] },
    { name: 'Zeta Shoes', companyId: 'c_zeta', departmentIds: ['d_support'], teamIds: [], queryManagerIds: [] },
  ];
  const matches = (b: (typeof brands)[number]) => {
    if (filter.companyId !== undefined && b.companyId !== filter.companyId) return false;
    const or = filter.$or as Record<string, string>[] | undefined;
    if (!or) return true;
    return or.some(clause => Object.entries(clause).every(([field, value]) => (b[field as 'teamIds'] as string[]).includes(value)));
  };
  return (
    <div className="rb-panel not-prose">
      <div className="rb-head">
        <RoleSelect value={role} onChange={setRole} />
        {role === 'query_manager' && (
          <>
            <label className="rb-check">
              <input type="checkbox" checked={dept} onChange={e => setDept(e.target.checked)} /> departmentId in token
            </label>
            <label className="rb-check">
              <input type="checkbox" checked={team} onChange={e => setTeam(e.target.checked)} /> teamId in token
            </label>
          </>
        )}
      </div>
      <div className="rb-grid2">
        <div>
          <h4>getBrandScope(user) returns</h4>
          <pre className="rb-pre">{JSON.stringify(filter, null, 2)}</pre>
        </div>
        <div>
          <h4>brands.find(filter)</h4>
          <ul className="rb-brands">
            {brands.map(b => (
              <li key={b.name} data-ok={matches(b)}>
                <Yes ok={matches(b)} /> <strong>{b.name}</strong>
                <small>
                  {b.companyId === 'c_acme' ? 'Acme' : 'Zeta (other company)'} · {b.departmentIds.length ? `dept ${b.departmentIds.join(', ')}` : ''}
                  {b.teamIds.length ? `team ${b.teamIds.join(', ')}` : ''}
                  {b.queryManagerIds.length ? 'granted to Sadia by name' : ''}
                </small>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/** The access token's three parts, decoded. Illustrative claims, not a real token. */
export function TokenAnatomy() {
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    sub: '670000000000000000000032',
    email: 'sadia@acme.example',
    name: 'Sadia Islam',
    role: 'query_manager',
    companyId: '670000000000000000000001',
    departmentId: '670000000000000000000021',
    teamId: '670000000000000000000041',
    iat: 1762753200,
    exp: 1762754100,
  };
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const signature = 'k3Wq_illustrative_signature_9pXz';
  return (
    <div className="rb-panel not-prose">
      <p className="rb-token">
        <span data-p="h">{b64(header)}</span>.<span data-p="p">{b64(payload)}</span>.<span data-p="s">{signature}</span>
      </p>
      <div className="rb-grid3">
        <div data-p="h">
          <h4>Header</h4>
          <pre className="rb-pre">{JSON.stringify(header, null, 2)}</pre>
          <p>Algorithm: HMAC-SHA256 with a shared secret (jsonwebtoken&apos;s default).</p>
        </div>
        <div data-p="p">
          <h4>Payload (claims)</h4>
          <pre className="rb-pre">{JSON.stringify(payload, null, 2)}</pre>
          <p>
            Readable by anyone who has the token: base64, <b>not encrypted</b>. <code>exp − iat</code> = 900 s = 15 min.
          </p>
        </div>
        <div data-p="s">
          <h4>Signature</h4>
          <pre className="rb-pre">{'HMACSHA256(header + "." + payload, ACCESS_TOKEN_SECRET)'}</pre>
          <p>Change one character of the payload and verification fails. That is why the server can trust the role inside.</p>
        </div>
      </div>
    </div>
  );
}

/** Every manual status move and the permissions it needs (auth/status-action.ts). */
export function StatusMoveMatrix() {
  const statuses = ['pending', 'hold', 'unresolved', 'resolved'];
  return (
    <div className="lz-scroll not-prose">
      <table className="rb-matrix rb-moves">
        <thead>
          <tr>
            <th>from ↓ · to →</th>
            {statuses.map(s => (
              <th key={s}>{s}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {statuses.map(from => (
            <tr key={from}>
              <th>{from}</th>
              {statuses.map(to => {
                const needs = STATUS_MOVES.find(m => m.from === from && m.to === to)?.needs ?? [];
                return (
                  <td key={to} data-k={needs.join('+')}>
                    {needs.join(' + ')}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
