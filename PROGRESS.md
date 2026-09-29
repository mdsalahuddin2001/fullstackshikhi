# Progress

## Project
YouTube teaching docs site (presentation alternative). Next.js 16 + Fumadocs 16, MDX, Tailwind v4, pnpm. Single site, no i18n routing; content can be Bangla, English or mixed. Deploy target: Vercel. Live code (`<Playground>`) deferred.

## Decisions
| Decision | Choice | Why |
|---|---|---|
| Framework | Next.js + Fumadocs (over Astro/Starlight) | Owner knows Next.js; full React for future interactivity |
| Fonts | Inter → Noto Sans Bengali (fallback per glyph), JetBrains Mono for code | Noto Bengali is variable and x-height-matched to Inter for mixed sentences |
| Prose line-height | 1.75 | Bangla vowel signs clip at tighter leading |
| Search | Orama (built-in) | Bangla tokenization is weak; revisit if needed |
| TypeScript | 6.0.x (not 7) | typescript-eslint supports `<6.1.0` only |
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

## Phase 3: Templates + QA ⏳
- Sample PostgreSQL page (mixed Bangla/English) replacing `test.mdx`.
- `CONTENT_GUIDE.md`.
- build/lint/typecheck, commit.
