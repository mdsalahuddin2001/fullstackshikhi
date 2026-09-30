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
- ✅ (2026-09-30) **`fundamentals` lesson** (Lesson 01, before `introduction`): data vs information, data types (structured/semi/unstructured), database with everyday examples, Excel/খাতা problems (redundancy, inconsistency, concurrency, security, integrity, recovery, querying) → DBMS solutions table, popular DBMS, database vs DBMS vs server, relational vs NoSQL + when-to-use, relational vocabulary (table/row/column/schema/PK/FK) with bookstore tables + ER, SQL + DDL/DML/DCL/TCL. Sample names/phones/prices labelled as made up. `introduction` trimmed to avoid overlap (links back); overview cards renumbered 1–6.
  - QA: lint/typecheck/build pass; page 200 light+dark, 3/3 Mermaid render, eyebrow "Lesson 01 / 06", zero console errors, no mobile horizontal scroll, present mode toggles; screenshots reviewed.
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
