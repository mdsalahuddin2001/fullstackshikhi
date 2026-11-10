# Progress

## Project
YouTube teaching docs site (presentation alternative). Next.js 16 + Fumadocs 16, MDX, Tailwind v4, pnpm. Single site, no i18n routing; content can be Bangla, English or mixed. Deploy target: Vercel. Live code (`<Playground>`) deferred.

## Decisions
| Decision | Choice | Why |
|---|---|---|
| Framework | Next.js + Fumadocs (over Astro/Starlight) | Owner knows Next.js; full React for future interactivity |
| Fonts | Inter (English) → **Hind Siliguri** (Bangla, per-glyph fallback) → JetBrains Mono (code). Hind self-hosted in `src/fonts/` (Bengali subset, weights 400/500/600/700, OFL) via `next/font/local` with `size-adjust: 105%` + Bengali `unicode-range` | Content is mostly Bangla; at equal font-size Bangla reads smaller than Latin. Owner first picked Noto Sans Bengali +108% from a side-by-side, then switched to Hind Siliguri (2026-09-29). Font-inspector extensions report the first family (Inter); DevTools → Computed → Rendered Fonts shows the real per-glyph font |
| Prose line-height | 1.75 | Bangla vowel signs clip at tighter leading |
| Search | Orama (built-in) | Bangla tokenization is weak; revisit if needed |
| TypeScript | 6.0.x (not 7) | typescript-eslint supports `<6.1.0` only |
| UI kit | shadcn/ui (Base UI primitives, `nova` preset) + Fumadocs `shadcn.css` preset | One token set themes both; Base UI matches `@fumadocs/base-ui` |
| Brand | Indigo primary (`oklch(0.511 0.262 276.966)` light / `oklch(0.673 0.182 276.935)` dark), neutral grays | Defaults chosen by owner ("go with defaults") |
| Sidebar | Each topic is a root folder (`root: true`), tab switcher off (`tabs={false}`); sidebar shows only the current topic + "← All topics" | Owner: topics are chosen only on the home page |
| MDX config | Collections via `fumadocs-mdx/macro` in `src/lib/source.ts`; global plugins in `source.config.ts` | Scaffold default |

## Phase 1: Scaffold ✅ (2026-09-29)
- Scaffolded with `create-fumadocs-app` (template `+next+fuma-docs-mdx`, `src/`, ESLint, Orama).
- Fonts wired in `src/app/layout.tsx` + `@theme` in `src/app/global.css`.
- Mermaid: `remarkMdxMermaid` converts ```` ```mermaid ```` blocks → `src/components/mermaid.tsx` (client-only, theme-aware).
- MDX components: ImageZoom (all images), Steps/Step, Tabs/Tab, Mermaid (`src/components/mdx.tsx`).
- Code blocks: Fumadocs defaults already include Shiki `[!code highlight]`, `[!code word:x]`, `[!code ++/--]`, `[!code focus]`, `title="..."`. No extra deps needed.
- `metadataBase` from `NEXT_PUBLIC_SITE_URL` (set on Vercel).
- Smoke-test page: `content/docs/test.mdx` (replaced in Phase 3).
- QA: `pnpm lint`, `pnpm types:check`, `pnpm build` pass. Rendered HTML verified via curl (fonts, highlight/diff classes, Bangla text, steps, mermaid source). **Visual check in a browser not done** (Chrome extension unavailable).

## Phase 2: Teaching features ✅ (2026-09-29)
**Present mode** (`src/components/present/`)
- `P` toggles, `Esc` exits, "Present" button in each page's action row. Ignored while typing in inputs or with modifier keys.
- State = `<html data-present>` (survives client navigation) + `sessionStorage` (survives reload). `store.ts` is the only writer.
- CSS (`global.css`): root font 125% (≈20px, all rem-based UI scales), sidebar/TOC/subnav hidden, grid columns zeroed via `--fd-*` vars on `#nd-docs-layout`. Anything with `data-present-hide` is hidden.
- `→`/`PageDown`: reveal next item, then go to next page. `←`/`PageUp`: hide last item, then go to previous page **with all items revealed** (slide-style back).
- Prev/next from `findNeighbour(source.getPageTree(), page.url)` in `docs/[[...slug]]/page.tsx`; `PresentController` mounts per page.
- Entering present mode always restarts the page at step 0. Revealed item scrolls to screen center.
- Floating pill (bottom-right, 40% opacity): `n/total`, key hints, exit button.

**Reveal** (`src/components/present/reveal.tsx`) — no effect outside present mode
- `<Reveal>` block = one step. `<Reveal each>` = each child is a step; a Markdown list reveals per `<li>`.
- `<Steps reveal>` = one step per `<Step>`; connector line grows with revealed steps.

**Playground** (`src/components/playground.tsx`): `<Playground lang="sql">` wraps a code block with a header + disabled Run button. Swap the implementation later; MDX stays the same.

**Other:** added `src/app/icon.svg` (favicon was 404).

**QA:** lint, typecheck, build pass. Headless Chrome (Playwright, scratchpad only, not a project dependency) — 14/14 checks: Mermaid SVG renders, Bangla font stack, enter/exit, 20px font, sidebar hidden, reveal forward/back, cross-page nav both directions, reload restore, reveal-all on back, restart at 0 on re-enter, zero console errors. Screenshots reviewed in light, dark and present mode.

**Known limits**
- On hard reload, present mode is restored after hydration (brief flash of the normal layout). Client navigation has no flash.
- Reveal hides content via opacity, so hidden steps still take up space (keeps layout stable while recording).

## Phase 3: Design ✅ (2026-09-29)
- **shadcn/ui** initialised (`components.json`, style `base-nova`, utils alias → existing `@/lib/cn`; the `cn` package already merges Tailwind classes). Added `button`, `card`, `badge`, `separator` in `src/components/ui`. Removed the Geist font and the self-referencing `--font-sans` that init injected.
- **Theme:** `global.css` imports `fumadocs-ui/css/shadcn.css`, so every Fumadocs color reads shadcn vars (`--primary`, `--border`…). **To retheme, edit only the `:root` / `.dark` blocks** (or paste a tweakcn theme there). Explicit `@custom-variant dark` for `.dark` class.
- **Mermaid** uses theme `base` with variables read from the CSS tokens at render time (oklch → hex via canvas, since Mermaid can't parse oklch).
- **Home page** (`src/app/(home)/page.tsx`): hero with gradient glow, CTA buttons, topic cards from `src/lib/topics.ts`, feature strip.
- **Nav:** logo mark (theme-colored SVG) + "Docs" link (top nav only).
- **Content structure:** `content/docs/{postgresql,redis,nextjs,ai}/` with `meta.json` (title, icon) and a stub `index.mdx`; `guide/components.mdx` (was `test.mdx`); root `meta.json` orders sidebar with "Series" / "Resources" separators. `index.mdx` is now "Start here".
- **Typography:** tighter heading tracking; `h2` gets a top rule + spacing as a section break.
- **`<YouTube id="…" />`** component (youtube-nocookie, lazy, 16:9, hidden in present mode).
- **Present mode:** content column centered at max 52rem.
- **QA:** lint, typecheck, build pass; 14/14 Playwright behavior checks (URLs updated for the moved page); zero console errors; screenshots reviewed — home (light/dark/mobile), docs (light/dark/mobile), topic page, present mode.

### Phase 3b: Topic-scoped docs ✅ (2026-09-29)
- Topic folders (`postgresql`, `redis`, `nextjs`, `ai`, `guide`) are root folders; `src/app/docs/layout.tsx` sets `tabs={false}` and a sidebar banner linking to `/#topics`.
- Removed `content/docs/index.mdx` ("Start here") and root `meta.json`; `/docs` → `/` redirect (`next.config.mjs`, non-permanent).
- Removed the header "Docs" link; home CTA is now "Start with PostgreSQL" → `/docs/postgresql`.
- Authoring guide is a root folder that isn't linked from the home page (URL only): `guide/components`, new `guide/present-mode` (key reference).
- Prev/next (page footer + present-mode arrows) stay inside the topic — `findNeighbour` defaults to `separateRoot: true`.
- QA: lint/typecheck/build pass; 20/20 Playwright checks (added: first/last-page boundaries within a topic, back-navigation reveal-all via real navigation, `/docs` redirect, sidebar scoped, no switcher, footer doesn't cross topics); zero console errors.
- Note: search still returns results from every topic.

## Phase 4: Content template + guide ⏳
- ✅ (2026-09-29) **PostgreSQL series** — mostly-Bangla prose, English technical terms, SQL in English. `content/docs/postgresql/`: `index` (overview + ER diagram), `introduction` (setup Tabs: Docker/macOS/Windows, `psql`), `tables-and-types` (IDENTITY, types table, constraints, ER), `crud` (INSERT/SELECT/UPDATE/DELETE, JOIN, Playground, safe-UPDATE diff), `indexes` (B-tree diagram, EXPLAIN ANALYZE before/after, multi-column, costs), `transactions` (BEGIN/COMMIT/ROLLBACK, ACID, `FOR UPDATE` sequence diagram, isolation levels). Order set in `meta.json`.
  - Data integrity: SQL/behavior per PostgreSQL docs; EXPLAIN outputs and timings labelled **উদাহরণ (illustrative)**; sample book prices/stock labelled as made up. `orders` simplified (direct `book_id`) and noted in the lesson. No YouTube embeds (no real IDs yet).
  - QA: all 6 pages 200, every Mermaid block renders, no literal `[!code` markers, zero console errors (light + dark); screenshots reviewed (overview, tabs, types table dark, EXPLAIN, sequence diagram dark, mobile CRUD, present mode).
- ✅ (2026-10-03) **Foundations part (owner's 19-topic outline)** — sidebar now has `---Foundations---` / `---Hands-on---` separators in `meta.json`; 10 lessons + overview.
  - `index` → "PostgreSQL for Developers": Welcome, What You'll Learn (Part 1/Part 2 cards), `shop` ER.
  - 01 `data-and-database` (was `fundamentals`; owner's draft prose kept): Data, data types, Data → Information → Decision (মাসুদ + shop example), Database, Why apps need databases (RAM vs persistence, Excel problems).
  - 02 `dbms`: owner's DBMS/CRUD walkthrough moved to the shop domain, DBMS-solves-Excel table, popular DBMS, Database vs DBMS (+server).
  - 03 `relational-databases`: types (same product in 3 models, Tabs), Relational vs Non-Relational, relational DB (Codd 1970, 1:1/1:N/M:N), tables/rows/columns/cell/schema/PK/FK.
  - 04 `sql`: SQL (SEQUEL/ANSI 1986/ISO 1987), declarative, JOIN preview, DDL/DML/DCL/TCL, SQL vs NoSQL (same query + same order in both models).
  - 05 `what-is-postgresql`: history, PostgreSQL vs SQL, Why PostgreSQL, PG vs MySQL vs MongoDB, where PG fits (architecture + order flow). Sources cited inline: postgresql.org/about (SQL:2023 170/177 as of v18), docs history page, PostgreSQL licence, MySQL Community (GPL), MongoDB SSPL. "Best for" row labelled as common opinion, not benchmark.
  - `introduction` → "Installation ও setup" only; database renamed `bookstore` → `shop`.
- **Writing style (owner, 2026-10-03):** Banglish — Bangla prose, English tech terms mostly in Bangla script (ডাটাবেস, টেবিল, কুয়েরি), English in parentheses on first use, code/identifiers English. Example domain: **online shop** (`shop`: categories, products, customers, orders, order_items, reviews) so advanced lessons can extend it.
- ✅ (2026-10-03) **Hands-on lessons migrated to `shop`**: `tables-and-types` (categories/products with `sku`, `CHECK (stock >= 0)`; new customers/orders/order_items section with composite PK + `unit_price` snapshot; ALTER examples changed), `crud`, `indexes` (`sku` lookup, `(category_id, price)` composite), `transactions` (real orders + order_items flow; "simplified orders" note removed). Domain-only edits — prose style of these 4 not converted to Banglish.
  - QA: lint/typecheck/build pass; 11 pages × light/dark: 200, all Mermaid render, zero console errors, no raw `[!code`; no mobile h-scroll; sidebar separators; cross-lesson anchor resolves; `/docs/postgresql/fundamentals` now 404 (no redirect added). Screenshots reviewed.
- Authoring guide stays as an unlinked topic (decided in 3b); `CONTENT_GUIDE.md` covers the repo side.
- `CONTENT_GUIDE.md`: adding a series/lesson, frontmatter, meta.json, components (Reveal, Steps reveal, Playground, YouTube, Mermaid, code annotations), present-mode keys.
- Final QA, commit.

## Version log — repeated fixes
### `src/components/mermaid.tsx` + ER styles in `global.css`
- v1 (Phase 1): theme `default`/`dark` by color scheme.
- v2 (Phase 3): theme `base`, variables read from CSS tokens (oklch → hex via canvas).
- v3 (2026-09-29): ER tables — dark mode odd rows were light gray under white text (Mermaid derives `rowOdd` = mainBkg lightened 75%). Now `rowOdd` = card, `rowEven` = card/muted mix; `global.css` sets neutral ER grid lines + muted header row (`!important`, since Mermaid's rules are id-scoped). Note: Mermaid's `themeCSS` drops nested rules, so ER CSS lives in `global.css`.
- v4 (2026-09-29): **theme toggle on an open page rendered diagrams with the previous theme's colors** (fresh loads were fine). Cause: next-themes updates React state before swapping the `.dark` class, so tokens were read stale and then cached. Now the theme key comes from the `<html>` class via `MutationObserver` + `useSyncExternalStore`, and `mermaid.initialize` runs inside the cached render. Verified dark→light and light→dark on ER and sequence diagrams.
- v5 (2026-09-29): ER tables now match Markdown tables — no drop shadow (all diagrams are flat: `.mermaid-diagram svg * { filter: none }`), rounded corners (`--radius`) + single 1px border. Mermaid can't round its paths, so `roundErTables()` in `mermaid.tsx` clips each entity with `clip-path: inset(0 round r)` and appends a rounded `.er-border` rect. Attribute-less entities (plain `rect.label-container`) get CSS `rx/ry`, muted fill, neutral border. Mermaid's id-scoped rules require `!important` on these overrides.

### Bangla font
- v1 (Phase 1): Noto Sans Bengali via `next/font/google`.
- v2 (2026-09-29): Noto self-hosted with `size-adjust: 108%` (owner picked option 1 of 3).
- v3 (2026-09-29): switched to **Hind Siliguri** at owner's request, `size-adjust: 105%` (calibrated so Bangla matches the same visual size as v2). Noto file removed.

## 2026-09-30: Visual refresh + single-topic scope
- Dark palette ported from the conneczen design system (personal-operator/apps/web); site brand `#2b5c9c`.
- Home page redesigned: topic cards with official logo (Simple Icons v16.33.0, CC0), brand wash, watermark, pointer spotlight, staggered entrance, "key" buttons (`lib/key-button.ts`).
- Per-topic brand: `brand` object in `lib/topics.ts` is the single source; docs pages emit it on `:root` (`TopicBrand` in `docs/[[...slug]]/page.tsx`). Active sidebar item styled as a key (`global.css`).
- Docs chrome (`components/lesson-chrome.tsx`): lesson header card with eyebrow (Lesson NN / NN), overview hero with CTA, custom prev/next cards (Fumadocs footer disabled), key-style page actions.
- **Scope cut:** Redis, Next.js and AI removed (content folders, topics, logos). PostgreSQL only until that series is done; next topics to be planned then.

### PostgreSQL lesson 01 (`fundamentals.mdx` → `data-and-database.mdx`)
- v1 (2026-09-30): single fundamentals lesson, bookstore domain.
- v2 (2026-09-30): owner rewrote prose (মাসুদ example, online bookshop DBMS walkthrough).
- v3 (2026-10-03): split into 5 foundation lessons per owner outline; domain → online shop. Owner's v2 draft backed up in session scratchpad only.

### Listenyzen docs (`content/docs/listenyzen/`)
- v1–v7 (2026-10-15 → 2026-11-01): backend onboarding guide, API reference and review (see git history).
- v8 (2026-11-09): **Rebuilt as a data-model study guide** at Listenyzen `ffd5b3d`, at the owner's request ("delete everything; study data structures and relationships"). Old pages, API/route/tour JSON, explorer components, Markdown downloads and the `docs/` copies were removed.
  - 11 pages: index (map, model cards, relationship matrix), conventions, tenancy, brand, settings, messaging, comments, handling, rollups, alerts, files-and-indexes. Each chapter opens with its `schema.ts` files verbatim (Shiki, line numbers), then a map, an ER diagram, a field table per model, sample documents, state and sequence diagrams, and check-yourself questions.
  - Data: `src/lib/listenyzen/schema-map.ts` holds 26 models, their fields, refs and 139 indexes. Components in `src/components/listenyzen/`: `SchemaGraph` (React Flow `@xyflow/react@12.12.0`, chapter layout + full screen), `ModelFields`, `RelationMatrix`, `IndexTable`, `ModelCards`. Styles are `.lz-*` in `global.css`.
  - **Refresh after a Listenyzen change:** bump `SNAPSHOT` in `schema-map.ts`, run `node --no-warnings scripts/sync-listenyzen-schemas.mjs`, then `--check`. The check fails on code drift, a missing field, or a checkout ≠ documented revision. New fields or models must be added to `schema-map.ts` by hand.
  - QA: lint, typecheck, build (160 pages); `--check` clean; browser check of all 11 pages: 43 Mermaid diagrams, 0 errors; graph, matrix, tables and full screen checked in light and dark. Mobile width not checked in a browser (CSS breakpoint only).
- v9 (2026-11-10): Updated to Listenyzen `18e6d95` (5 commits since `ffd5b3d`). New **Roles** chapter (`roles.mdx`: Role and RoleChange, the permission catalogue, seeded defaults, cache-invalidation hooks). Added `User.roleId` and the User middleware. Session and Comment hold-log index changed to partial multikey `{brandId, statusLog.at, platform}`, now explained in Messaging and Comments. Counts are now 28 models and 148 indexes. Chapter graphs cap their zoom at 1. QA: sync `--check` clean; lint, types and build (163 pages) pass; browser check: 0 Mermaid errors on the changed pages.

### Listenyzen RBAC docs (`content/docs/listenyzen-rbac/`)
- v1 (2026-11-10): New topic at Listenyzen `18e6d95`, in English. It covers authentication, authorization and RBAC in 9 pages: index, sign-in, request-gates, scoping, roles-and-permissions, route-gates, record-rules, client-and-realtime, walkthroughs. Each page opens with its auth source files verbatim (24 blocks).
  - Generated by `node --no-warnings scripts/sync-listenyzen-rbac.mjs` (`--check` to verify):
    - `catalogue.json` is imported from the real `permissions.ts`, `roles.ts` and `status-action.ts`;
    - `routes.json` is a static scan of 174 routes and their gates;
    - the source blocks are copied verbatim;
    - a parity check runs `model.ts` against the 34 allow/deny expectations in Listenyzen's `role-ability.test.ts` (a negative test confirmed it fails when the model is wrong).
  - Components in `src/components/listenyzen-rbac/simulators.tsx`: `RequestSimulator`, `PermissionPlayground`, `RouteGates`, `BrandScopeSimulator`, `TokenAnatomy`, `StatusMoveMatrix`. They run real `@casl/ability@7.1.1`, the version Listenyzen pins. Styles are `.rb-*` in `global.css`. The topic card is in `lib/topics.ts`.
  - Findings documented in the "Things to watch" section: unauthenticated `/files/upload-image-*`, no refresh-token revocation, a token-claim lag of up to 15 minutes, unused auth helpers.
  - QA: lint, types and build (190 pages) pass; both sync checks are clean; browser check of all 9 pages: 0 Mermaid errors after fixing one (a `;` inside a sequence message crashed the whole page, because the site's `Mermaid` component has no error boundary); the simulator matches the written traces; checked in light and dark. Mobile width not checked in a browser.
- v2 (2026-11-10): `components/mermaid.tsx` now catches render failures: it shows a "could not be drawn" box with the parser message and the diagram source instead of crashing the page, and `suppressErrorRendering` stops Mermaid's stray error graphic. Verified by re-introducing the broken diagram: the page stayed up, 3 other diagrams rendered, 1 error box shown, no stray graphic.

