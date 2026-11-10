import { AbilityBuilder, createMongoAbility, type MongoAbility } from '@casl/ability';
import catalogue from './catalogue.json';
import routeData from './routes.json';

// Listenyzen's authorization rules for the study pages, built from catalogue.json (generated from
// the real auth files by scripts/sync-listenyzen-rbac.mjs). `defineAbility` mirrors
// server/src/auth/ability.ts line for line; the gate and scope helpers mirror
// middlewares/auth, auth/tenant.ts and auth/reply-access.ts.

export type Action = (typeof catalogue.actions)[number];
export type Subject = (typeof catalogue.subjects)[number];
export type Role = 'super_admin' | 'company_owner' | 'company_admin' | 'query_manager';
export type AppAbility = MongoAbility<[string, string]>;

export interface Permission {
  key: string;
  label: string;
  group: string;
  description: string;
  rules: { action: string | string[]; subject: string | string[] }[];
}

export const PERMISSIONS = catalogue.permissions as Permission[];
export const SEEDED = catalogue.seeded as string[];
export const ACTIONS = catalogue.actions as string[];
export const SUBJECTS = catalogue.subjects as string[];
export const GROUPS = catalogue.groups as string[];
export const REVISION = catalogue.revision;
export const STATUS_MOVES = catalogue.statusMoves as { from: string; to: string; needs: string[] }[];
export const ADMIN_TIER: Role[] = ['super_admin', 'company_owner', 'company_admin'];
export const ROLE_LABEL: Record<Role, string> = {
  super_admin: 'Super admin',
  company_owner: 'Company owner',
  company_admin: 'Company admin',
  query_manager: 'Query manager',
};

/** server/src/auth/ability.ts `defineAbility`. */
export const defineAbility = (holder: { adminTier: true } | { adminTier: false; permissions: readonly string[] }): AppAbility => {
  const { can, cannot, build } = new AbilityBuilder<AppAbility>(createMongoAbility);
  if (holder.adminTier) {
    can('manage', 'all');
    cannot(['claim', 'forward'], ['Conversation', 'Comment']);
    return build();
  }
  for (const key of holder.permissions) {
    for (const rule of PERMISSIONS.find(p => p.key === key)?.rules ?? []) can(rule.action, rule.subject);
  }
  return build();
};

/** server/src/auth/ability.ts `abilityFor`: tier from the token, permissions from the role. */
export const abilityOf = (role: Role, permissions: readonly string[]): AppAbility =>
  ADMIN_TIER.includes(role) ? defineAbility({ adminTier: true }) : defineAbility({ adminTier: false, permissions });

export interface RouteGate {
  method: string;
  path: string;
  file: string;
  authenticated: boolean;
  limiter: boolean;
  roles: Role[] | null;
  ability: [string, string][] | null;
  inlineAbility: [string, string][] | null;
  statusGuard: boolean;
  act: boolean;
  claim: boolean;
}
export const ROUTES = routeData.routes as RouteGate[];

/** The route's static gates for a caller: `authorize(...roles)`, then `requireAbility` (any of). */
export const routeVerdict = (
  route: RouteGate,
  role: Role,
  ability: AppAbility
): { ok: boolean; status?: 401 | 403; reason: string } => {
  if (!route.authenticated) return { ok: true, reason: 'Public: no sign-in needed' };
  if (route.roles && !route.roles.includes(role)) return { ok: false, status: 403, reason: `Role list: ${route.roles.join(', ')}` };
  if (route.ability && !route.ability.some(([a, s]) => ability.can(a, s))) {
    return { ok: false, status: 403, reason: `Needs ${route.ability.map(([a, s]) => `${a} ${s}`).join(' or ')}` };
  }
  return { ok: true, reason: route.act ? 'Passes, if they hold the query' : 'Passes' };
};

/** auth/tenant.ts `getBrandScope`, as the filter object it returns. */
export const brandScope = (user: { role: Role; companyId?: string; departmentId?: string; teamId?: string; id: string }): Record<string, unknown> => {
  if (user.role === 'super_admin') return {};
  const scope = { companyId: user.companyId ?? '' };
  if (user.role !== 'query_manager') return scope;
  return {
    ...scope,
    $or: [
      ...(user.departmentId ? [{ departmentIds: user.departmentId }] : []),
      ...(user.teamId ? [{ teamIds: user.teamId }] : []),
      { queryManagerIds: user.id },
    ],
  };
};

export type Assignee = 'me' | 'someone' | 'myTeam' | 'myDepartment' | 'otherTeam' | 'none';
export const ASSIGNEE_LABEL: Record<Assignee, string> = {
  me: 'Me, personally',
  someone: 'Another query manager',
  myTeam: 'My team (pool)',
  myDepartment: 'My department (pool)',
  otherTeam: "Another team's pool",
  none: 'Nobody (unassigned)',
};

/** auth/reply-access.ts `assertCanAct`: null when allowed, else the 403 message. */
export const actGate = (role: Role, assignee: Assignee): string | null => {
  if (role !== 'query_manager') return null;
  if (assignee === 'me') return null;
  if (assignee === 'none') return 'This conversation is unassigned: take it with Assign to me first';
  if (assignee === 'someone') return 'This conversation is assigned to someone else';
  return 'This conversation is pooled: take it with Assign to me first';
};

/** auth/reply-access.ts `claimableFilter`: may the caller take it? */
export const claimable = (assignee: Assignee): boolean => ['none', 'myTeam', 'myDepartment'].includes(assignee);

/** auth/status-action.ts `statusChangeActions`. */
export const statusNeeds = (from: string, to: string): string[] => STATUS_MOVES.find(m => m.from === from && m.to === to)?.needs ?? [];
