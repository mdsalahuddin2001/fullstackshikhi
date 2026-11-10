import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

// Listenyzen RBAC docs, generated from the Listenyzen source:
//   1. src/lib/listenyzen-rbac/catalogue.json: roles, the permission catalogue with its CASL rules,
//      the seeded Query manager set and every status move (imported from the real auth files);
//   2. src/lib/listenyzen-rbac/routes.json: every HTTP route and the gates found on it (static scan);
//   3. the code blocks between {/* source: path */} … {/* /source */} in content/docs/listenyzen-rbac.
//   node --no-warnings scripts/sync-listenyzen-rbac.mjs           # regenerate
//   node --no-warnings scripts/sync-listenyzen-rbac.mjs --check   # fail if anything drifted
// LISTENYZEN_DIR points at the Listenyzen checkout (default ~/Developer/Analyzen/listenyzen-v2.0).

const repo = process.env.LISTENYZEN_DIR ?? join(homedir(), 'Developer/Analyzen/listenyzen-v2.0');
const check = process.argv.includes('--check');
const pages = 'content/docs/listenyzen-rbac';
const data = 'src/lib/listenyzen-rbac';
const src = join(repo, 'server/src');
const problems = [];

const read = path => {
  const full = join(repo, path);
  if (!existsSync(full)) throw new Error(`Missing ${full}`);
  return readFileSync(full, 'utf8').replace(/\s+$/, '');
};
const revision = execFileSync('git', ['-C', repo, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();

const output = (file, value) => {
  const text = JSON.stringify(value, null, 2) + '\n';
  const path = join(data, file);
  if (check) {
    if (!existsSync(path) || readFileSync(path, 'utf8') !== text) problems.push(`${path} is out of date`);
  } else writeFileSync(path, text);
};

// ── 1. Catalogue: import the real modules (copied to .mts so Node strips the types) ─────────
const tmp = mkdtempSync(join(tmpdir(), 'lz-rbac-'));
copyFileSync(join(src, 'auth/permissions.ts'), join(tmp, 'permissions.mts'));
copyFileSync(join(src, 'auth/roles.ts'), join(tmp, 'roles.mts'));
writeFileSync(
  join(tmp, 'status-action.mts'),
  readFileSync(join(src, 'auth/status-action.ts'), 'utf8').replace("'@/auth/permissions'", "'./permissions.mts'")
);
const permissions = await import(join(tmp, 'permissions.mts'));
const roles = await import(join(tmp, 'roles.mts'));
const status = await import(join(tmp, 'status-action.mts'));
const STATUSES = ['pending', 'hold', 'unresolved', 'resolved'];

mkdirSync(data, { recursive: true });
output('catalogue.json', {
  revision,
  roles: roles.ROLE_VALUES,
  managerRoles: roles.MANAGER_ROLES,
  actions: permissions.ACTIONS,
  subjects: permissions.SUBJECTS,
  groups: permissions.PERMISSION_GROUPS,
  permissions: permissions.PERMISSIONS.map(p => ({ ...p, rules: permissions.rulesOf(p.key) })),
  seeded: permissions.QUERY_MANAGER_PERMISSIONS,
  statusMoves: STATUSES.flatMap(from => STATUSES.map(to => ({ from, to, needs: status.statusChangeActions(from, to) }))),
});

// ── 2. Routes: every router.<method>(…) and the gates in its middleware and handler ──────────
const MOUNTS = [
  ['auth/api.ts', { routes: '/auth' }],
  ['modules/company/api.ts', { routes: '/companies' }],
  ['modules/user/api.ts', { routes: '/users' }],
  ['modules/department/api.ts', { routes: '/departments' }],
  ['modules/team/api.ts', { routes: '/teams' }],
  ['modules/query-manager/api.ts', { routes: '/query-managers' }],
  ['modules/role/api.ts', { roleRoutes: '/company/roles', permissionRoutes: '/company/permissions' }],
  ['modules/brand/api.ts', { routes: '/brands' }],
  ['modules/brand/tags/api.ts', { registerTagRoutes: '/brands' }],
  ['modules/brand/meta-channels.ts', { registerMetaChannelRoutes: '/brands' }],
  ['modules/brand/whatsapp.ts', { registerWhatsAppRoutes: '/brands' }],
  ['modules/brand/whatsapp-templates.ts', { registerWhatsAppTemplateRoutes: '/brands' }],
  ['modules/fixed-reply/api.ts', { routes: '/brands/:brandId/fixed-replies' }],
  ['modules/settings/api.ts', { routes: '/brands/:brandId/settings' }],
  ['modules/settings/company-api.ts', { companyRoutes: '/company/settings' }],
  ['modules/conversation/api.ts', { routes: '/conversations' }],
  ['modules/conversation/media.ts', { registerMediaRoutes: '/conversations' }],
  ['modules/conversation/whatsapp-templates.ts', { registerWhatsAppTemplateRoutes: '/conversations' }],
  ['modules/session/api.ts', { routes: '/sessions' }],
  ['modules/comment/api.ts', { routes: '/comments' }],
  ['modules/file/api.ts', { routes: '/files' }],
  ['modules/overview/api.ts', { routes: '/brands/:brandId/overview', teamDataRoutes: '/brands/:brandId/overview' }],
  ['modules/overview/holds-api.ts', { registerHoldRoutes: '/brands/:brandId/overview' }],
  ['modules/overview/sla-queue-api.ts', { registerSlaQueueRoute: '/brands/:brandId/overview' }],
  ['modules/overview/landing-api.ts', { routes: '/overview' }],
  ['modules/overview/rollup/api.ts', { routes: '/admin/overview-rollups' }],
  ['modules/alert/api.ts', { ruleRoutes: '/company/alert-rules' }],
  ['modules/alert/personal-api.ts', { notificationRoutes: '/notifications', notificationSettingsRoutes: '/notification-settings' }],
  ['modules/webhook/index.ts', { defineRoutes: '/webhooks' }],
];

// Index just past the `)` that closes the `(` at `open`, skipping strings and comments.
const closeParen = (text, open) => {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === '/' && text[i + 1] === '/') i = text.indexOf('\n', i);
    else if (c === '/' && text[i + 1] === '*') i = text.indexOf('*/', i) + 1;
    else if (c === "'" || c === '"' || c === '`') {
      for (i++; i < text.length && text[i] !== c; i++) if (text[i] === '\\') i++;
    } else if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return i + 1;
  }
  return text.length;
};
const argsOf = (text, call) =>
  [...text.matchAll(new RegExp(`${call}\\(`, 'g'))].map(m => {
    const open = m.index + m[0].length - 1;
    return text.slice(open + 1, closeParen(text, open) - 1).replace(/\s+/g, ' ').trim();
  });

const ACT = /loadActionableConversation|ensureActionableComment|ensureReplyableComment|ensureSendableConversation|deliverText|deliverAttachment|applyAgentReaction|updateComment\b|\{\s*act:\s*true/;
const CLAIM = /claimForCaller|forwardForCaller|claimableFilter/;

// Role lists as written in the route files, resolved to role names.
const ROLE_NAME = Object.fromEntries(Object.entries({ SUPER_ADMIN: 0, COMPANY_OWNER: 1, COMPANY_ADMIN: 2, QUERY_MANAGER: 3 }).map(([k, i]) => [k, roles.ROLE_VALUES[i]]));
const GLOBAL_LISTS = { MANAGER_ROLES: roles.MANAGER_ROLES.map(r => `ROLES.${r.toUpperCase()}`).join(', '), ROLE_VALUES: roles.ROLE_VALUES.map(r => `ROLES.${r.toUpperCase()}`).join(', ') };
const rolesOf = expr =>
  expr ? [...new Set([...expr.matchAll(/ROLES\.([A-Z_]+)/g)].map(m => ROLE_NAME[m[1]]).filter(Boolean))] : null;
const checksOf = expr => (expr ? [...expr.matchAll(/\['(\w+)',\s*'(\w+)'\]/g)].map(m => [m[1], m[2]]) : null);

const routes = [];
for (const [file, prefixes] of MOUNTS) {
  const raw = read(join('server/src', file));
  // Inline `...NAME` spreads of this file's array constants (role lists, middleware guards).
  const lists = { ...GLOBAL_LISTS };
  for (const m of raw.matchAll(/const (\w+)\s*(?::[^=]+)?=\s*\[([\s\S]*?)\](?:\s*as const)?;/g)) lists[m[1]] = m[2];
  let text = raw;
  for (let i = 0; i < 3; i++) text = text.replace(/\.\.\.(\w+)/g, (m, name) => (name in lists ? lists[name] : m));
  for (const m of text.matchAll(/router\.(get|post|put|patch|delete)\(/g)) {
    const open = m.index + m[0].length - 1;
    const block = text.slice(m.index, closeParen(text, open));
    const before = text.slice(0, m.index);
    const fn = [...before.matchAll(/(?:const|function)\s+(\w+)\s*=?\s*(?:\(|async)/g)]
      .map(x => x[1])
      .reverse()
      .find(name => name in prefixes);
    const prefix = prefixes[fn] ?? Object.values(prefixes)[0];
    let path = block.match(/^router\.\w+\(\s*(['`])([^'`]*)\1/)?.[2] ?? '?';
    const paths = [];
    if (path.includes('${')) {
      // A route registered in a loop over an object's keys (e.g. the three history logs).
      const keys = [...before.slice(-1200).matchAll(/^\s+'([a-z-]+)':/gm)].map(k => k[1]);
      for (const key of keys) paths.push(path.replace(/\$\{\w+\}/, key));
    } else paths.push(path);
    const nth = [...text.slice(0, m.index).matchAll(/router\.(get|post|put|patch|delete)\(/g)].length;
    const line = raw.slice(0, [...raw.matchAll(/router\.(get|post|put|patch|delete)\(/g)][nth]?.index ?? 0).split('\n').length;
    const authorize = argsOf(block, 'authorize').join(' | ');
    const ability = argsOf(block, 'requireAbility').join(' ; ');
    const inline = argsOf(block, 'assertCan').map(a => a.replace(/^req,\s*/, '').replace(/,\s*'[^']*'\s*$/, '')).join(' ; ');
    for (const p of paths) {
      routes.push({
        method: m[1].toUpperCase(),
        path: `/api/v1${prefix}${p === '/' ? '' : p}`,
        file: `server/src/${file}:${line}`,
        authenticated: /(?<![.\w])authenticate\b/.test(block),
        limiter: /authLimiter/.test(block),
        roles: rolesOf(authorize),
        ability: checksOf(ability),
        inlineAbility: checksOf(inline),
        statusGuard: /statusMoveGuard/.test(block),
        act: ACT.test(block),
        claim: CLAIM.test(block),
      });
    }
  }
}
output('routes.json', { revision, routes });

// ── 3. Verbatim source blocks in the pages ─────────────────────────────────────────────────
const block = path => {
  const code = read(path);
  const fence = '`'.repeat(Math.max(3, ...[...code.matchAll(/`{3,}/g)].map(m => m[0].length + 1)));
  const lang = path.endsWith('.tsx') ? 'tsx' : 'ts';
  return `{/* source: ${path} */}\n${fence}${lang} title="${path}" lineNumbers\n${code}\n${fence}\n{/* /source */}`;
};
let blocks = 0;
if (existsSync(pages)) {
  for (const name of readdirSync(pages).filter(file => file.endsWith('.mdx'))) {
    const file = join(pages, name);
    const before = readFileSync(file, 'utf8');
    const after = before.replace(/\{\/\* source: (\S+) \*\/\}[\s\S]*?\{\/\* \/source \*\/\}/g, (_, path) => {
      blocks += 1;
      return block(path);
    });
    if (after === before) continue;
    if (check) problems.push(`${file}: source code differs from ${repo}`);
    else writeFileSync(file, after);
  }
}

// ── 4. Parity: the docs' model.ts must give the answers Listenyzen's own ability test expects ──
const modelTs = readFileSync('src/lib/listenyzen-rbac/model.ts', 'utf8').replace(
  /from '\.\/(catalogue|routes)\.json';/g,
  (_, name) => `from '${join(process.cwd(), data, name)}.json' with { type: 'json' };`
);
const modelFile = join(process.cwd(), data, '.model-check.mts');
writeFileSync(modelFile, modelTs);
let model;
try {
  model = await import(modelFile);
} finally {
  (await import('node:fs')).rmSync(modelFile, { force: true });
}
const testText = read('server/test/role-ability.test.ts');
const pairs = name =>
  [...(testText.match(new RegExp(`const ${name}[^=]*=\\s*\\[([\\s\\S]*?)\\];`))?.[1] ?? '').matchAll(/\['(\w+)',\s*'(\w+)'\]/g)].map(m => [m[1], m[2]]);
const allowed = pairs('ALLOWED_TODAY');
const denied = pairs('DENIED_TODAY');
if (!allowed.length || !denied.length) problems.push('Could not read ALLOWED_TODAY / DENIED_TODAY from role-ability.test.ts');
const seeded = model.abilityOf('query_manager', model.SEEDED);
const admin = model.abilityOf('company_admin', []);
for (const [a, s] of allowed) if (!seeded.can(a, s)) problems.push(`model.ts: seeded role should be able to ${a} ${s}`);
for (const [a, s] of denied) if (seeded.can(a, s)) problems.push(`model.ts: seeded role should NOT be able to ${a} ${s}`);
for (const [a, s] of [...allowed, ...denied]) {
  const expected = !(a === 'claim' || a === 'forward');
  if (admin.can(a, s) !== expected) problems.push(`model.ts: admin tier ${a} ${s} should be ${expected}`);
}
const parity = `${allowed.length + denied.length} ability expectations from role-ability.test.ts`;

console.log(`revision ${revision}: ${routes.length} routes, ${permissions.PERMISSION_KEYS.length} permissions, ${blocks} source blocks, ${parity}`);
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
