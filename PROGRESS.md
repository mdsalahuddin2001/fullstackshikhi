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

## Phase 2: Teaching features ⏳
- Present mode: `P` toggles (hide sidebar + TOC, base font ~20–22px), `←/→` prev/next page, `Esc` exits.
- `<Steps reveal>`: reveal one item per keypress in present mode.
- `<Playground>` placeholder component.

## Phase 3: Templates + QA ⏳
- Sample PostgreSQL page (mixed Bangla/English) replacing `test.mdx`.
- `CONTENT_GUIDE.md`.
- build/lint/typecheck, commit.
