# Monorepo Migration Plan

Goal: turn the app into a Turbo-managed pnpm monorepo.

## Target layout

```
ibadah/
├── apps/
│   ├── client/     # Next.js end-user app (:3000)
│   ├── admin/      # Next.js admin console (:3001)
│   └── api/        # Express 5 API (:5000)
├── packages/
│   ├── core/                 # business logic, pure domain code
│   ├── eslint-config/        # shared flat ESLint configs
│   ├── shared/               # env-agnostic utilities & primitives
│   ├── typescript-config/    # shared tsconfig bases
│   └── ui/                   # frontend + admin React components
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
└── pnpm-lock.yaml            # single lockfile
```

## Decisions (locked)

| Topic | Decision |
| --- | --- |
| App layout | Move apps under `apps/` |
| Package output | Built with `tsc` -> `dist/` + `.d.ts` |
| `ui` scope | Byte-identical primitives **+** AI widget suite |
| `core` scope | Extractable pure logic only |
| ESLint | Migrate all three apps to flat config |

## Package responsibilities

### `@ibadah/shared`
Environment-agnostic building blocks with no React, no Mongoose, no
server-only dependencies.

- `cn()` class merge helper, `toDayKey()`
- timezone catalog (`groupedTimezones`, `detectTimezone`)
- small cross-cutting helpers

### `@ibadah/core`
Pure business logic that must stay in lock-step between client,
admin, and server. No I/O, no framework code.

- Salah scoring constants (`SALAH_DEFAULT_POINTS`, `PRAYER_SUNNAH_RAKAH`,
  `JUMMAH_SUNNAH_RAKAH`)
- Salah compass helpers (`bestFard`, `maxPrayer`, `maxJummah`,
  `maxDailyPoints`) — currently a hand-copied mirror of server logic
- Domain enums / types (`PrayerName`, `PrayerStatus`, `SalahScoring`)
- AI wire contract types (`ChartSpec`, `StreamEvent`), chart parser,
  provider-neutral types

### `@ibadah/ui`
Presentational React components shared by `client` and `admin`.

- Primitive primitives that are byte-identical across both apps
- AI widget suite (`ai-panel`, `ai-composer`, `ai-message`, ...)
- Markdown renderer, brand mark

### `@ibadah/typescript-config`
- `base.json` — strict compiler options
- `nextjs.json` — Next.js app preset
- `node.json` — Node/Express server preset
- `react-library.json` — React package preset

### `@ibadah/eslint-config`
- Flat config presets: `base`, `next`, `node`
- Migrates `server/.eslintrc.json` to flat config
- Gives `client` a lint config for the first time
- Removes `FlatCompat` boilerplate from `admin`

## Task breakdown (execute in order)

### Task 1 — Workspace scaffold  ✅
- [x] Root `package.json` (private, pnpm@12, turbo scripts)
- [x] `pnpm-workspace.yaml` (incl. `allowBuilds` — pnpm 11+ replaced
      `onlyBuiltDependencies` with it)
- [x] `turbo.json`
- [x] Move `client/` `admin/` `server/` -> `apps/`
- [x] Collapse the three lockfiles into one root lockfile
- [x] Verify: `pnpm install` succeeds from root; all 3 apps typecheck;
      server build emits `dist/` with `@/` aliases rewritten

Baseline captured at this point (all green): client/admin/server
`typecheck`, server `build`.

### Task 2 — Config packages  ✅
- [x] `packages/typescript-config` (`base`, `nextjs`, `node`,
      `react-library`)
- [x] `packages/eslint-config` (flat presets: `base`, `next`, `node`)
- [x] Point all three apps at the shared presets
- [x] Verify: `turbo lint` / `turbo typecheck` / `turbo build` green

Notes / findings:
- `next lint` was **removed in Next 16** — both Next apps' `lint`
  scripts were dead. Replaced with `eslint .`.
- The server's legacy `.eslintrc.json` was incompatible with ESLint 9;
  migrated to flat config and deleted.
- Fixed 3 real server lint errors (`interface X extends Y {}` ->
  type aliases).
- React Compiler rules (`set-state-in-effect`, `purity`,
  `immutability`, `refs`) downgraded to **warnings** — they flag
  long-standing, valid hook patterns across the existing UI. Tracked,
  not blocking.
- pnpm 11+ replaced `onlyBuiltDependencies` with `allowBuilds`.

### Task 3 — `@ibadah/shared`  ✅
- [x] Scaffold package with `tsc` build -> `dist/` + `.d.ts`
- [x] Moved `cn`, `toDayKey`, `getInitials`, `formatRelative`,
      timezone catalog into one source of truth
- [x] Rewired 112 files in client + admin to `@ibadah/shared`
- [x] Deleted the 4 duplicated `utils.ts` / `timezones.ts` files
- [x] Verify: both Next apps build; exports verified at runtime

Notes:
- Admin's `utils.ts` was a **superset** of the client's (it had
  `getInitials` + `formatRelative`); the package takes the union.
- Emitted ESM uses `.js` specifiers in `index.ts` re-exports so Node
  resolves them correctly (verified by importing `dist/` directly).
- Bulk import rewrite lives in `scripts/rewire-shared.js` (deleted
  after use — see Task 6 cleanup).

### Task 4 — `@ibadah/core`  ✅
- [x] Scaffold package (`tsc` -> `dist/` + `.d.ts`, `.js` specifiers)
- [x] Move Salah constants + scoring calculator
  (`packages/core/src/salah/{constants,scoring}.ts`)
- [x] Move shared AI wire types + chart parser + canonical system prompts
  (`packages/core/src/ai/{types,parse-chart,system-prompt}.ts`)
- [x] Point server at core constants (mirror is now a pure re-export)
- [x] Point client + admin at core types via thin re-export facades
- [x] Verify: `turbo lint` (0 errors) / `typecheck` / `build` green;
  runtime import of the built server modules resolves `@ibadah/core`

Notes:
- Server's `modules/ai/ai.types.ts:ChatMessage` is a **different shape**
  (tool-calling: `role: 'tool'`, `toolCalls`, `toolCallId`) — it is *not*
  core's wire `ChatMessage`, so it stayed local. Only `ProviderName` /
  `SystemSurface` are shared.
- `apps/api/src/modules/ai/system-prompts.ts` was the prompt that
  actually ran in production (tool-aware, longer than the client/admin
  mirrors). It became core's canonical `getSystemPrompt`, deduped per
  surface, with one shared inline-`chart` instruction block that matches
  what both apps' `parseChartsFromText` actually parses.
- Server's `salah.service.ts` has its own entry-based `pointsFor*`
  calculator (uses the *entry*, not the config) — correctly left alone.
  Core's `scoring.ts` is the max-points helper the UI uses.
- Client/admin keep `lib/salah-*.ts`, `lib/ai/types.ts` etc. as one-line
  re-export facades so ~20 call sites did not have to change.
- Core `tsconfig` needs `lib: ["ES2022", "DOM"]` because
  `ProviderChatInput.signal?: AbortSignal` is a global with no Node types
  in this package (types only — no DOM APIs run).

### Task 5 — `@ibadah/ui`  ✅
- [x] Scaffold package with React peer deps
- [x] Move byte-identical primitives
- [x] Move AI widget suite
- [x] Rewire client + admin
- [x] Write package README
- [x] Verify: `turbo build` for client + admin

Notes:
- `@ibadah/ui` follows the `packages/shared` pattern: ESM (`"type": "module"`),
  `tsc` → `dist/` with declarations + declaration maps, extends
  `@ibadah/typescript-config/react-library.json`, and the same
  build/dev/typecheck/lint/clean scripts.
- **Exact-identical set moved** (verified by SHA-256 hash of both apps'
  copies): `dropdown-menu`, `input`, `label`, `password-input`, `select`,
  `tabs`. Sources are copied byte-for-byte — `'use client'` directives and
  `cn(...)` class strings untouched. (`input.tsx` is the only one of the six
  with no `'use client'`, in the apps and here alike.)
- **Intentionally left app-local** (divergent copies, do not unify): `avatar`,
  `badge`, `button`, `calendar`, `card`, `date-picker`, `popover`, `tooltip`.
  Client-only: `dialog`, `sheet`, `textarea`. Admin-only: `separator`,
  `slider`, `sonner`, `switch`.
- Dependencies are only what the six files import: `@ibadah/shared`,
  `@radix-ui/react-{dropdown-menu,label,select,tabs}`, `lucide-react`
  (versions match `apps/client`). No `class-variance-authority` — none of the
  six uses `cva`. `react` is the only peer dep; `react-dom` was dropped
  because nothing here imports it.
- Styling stays the host app's job: the package ships no CSS and relies on
  the apps' Tailwind design tokens (`bg-background`, `border-input`, …).
- Only `packages/ui` and the two apps' `package.json` `dependencies` entries
  changed in this step; app source imports are untouched pending the rewire.
- **AI widget suite moved** to `packages/ui/src/ai/` (7 files: `ai-chart-renderer`,
  `ai-composer`, `ai-message`, `ai-panel`, `ai-widget`, `chat-history-sidebar`,
  `markdown-lite`), all re-exported from the barrel with `.js` specifiers. The
  app-specific wrappers (`dashboard-ai-widget`, `public-ai-widget`,
  `admin-ai-widget`) stay app-local. **Parity rule** (documented in
  `packages/ui/README.md`): with the client's props the package renders what
  the client renders today; with admin's props, what admin renders today.
  Every divergent value is a prop whose default is the client's.
- Import fixes inside the moved files: AI wire types (`ChartSpec`,
  `ChatMessage`, `ToolActivity`, `SystemSurface`) + `parseChartsFromText` now
  come from `@ibadah/core`; intra-`ai/` imports use `./x.js`; `cn` stays
  `@ibadah/shared`. `@/components/ui/button` could **not** be imported —
  the apps' `Button` copies differ (admin wraps `<Comp>`, client doesn't), so
  it became a required `ButtonComponent` prop.
- **App-local imports converted to props (all required):**
  `useAiChat` from `@/hooks/use-ai-chat` → `useChat: (options) => AiChatHookResult`
  (the hook itself, with `AiChatHookOptions`/`AiChatHookResult` exported from
  the package); `Button` → `ButtonComponent: ComponentType<AIComposerButtonProps>`
  (superset of both apps' button props, so either app's primitive fits);
  `ChatSession` type → structural `ChatSessionSummary` declared in the package.
- **`AIPanel` parameterization** (admin's panel is the client's minus the guest
  branch, with different defaults): added optional `emptyState` (`{title,
  description}`, default = client's non-guest copy), `defaultHint` (default
  `'Press Enter to send · Shift+Enter for newline'`), and
  `guestMode?: {isGuest, emptyState, hint, notice, cta?}` for the client's
  signed-out landing nudge (`Link`, register CTA and the `authStorage` check all
  stay in the client, wired as props). `greeting`/`surface` defaults remain the
  client's (`dashboard` surface); admin passes `surface="admin"` + its greeting
  as it already does.
- **`AIWidget` parameterization:** `title` / `subtitle` (defaults
  `'Ibadah assistant'` / `'Always here, in shā Allāh'`), `persistKey` (only the
  client passes it), and `layout?: AIWidgetLayoutConfig` with
  `{lifted, floating}: {button, panel}` class strings — defaults are the
  client's offsets. Both apps use `liftAboveBottomNav`: client dashboard `true`,
  client public + admin `false`; this split was already an existing prop, so
  layouts are selected per lift value, not per app.
- **Known parity gaps (visual only):** three one-className drifts took the
  client's value, so admin gets them from the client — `AIComposer` textarea
  `text-foreground`, `AIMessage` assistant bubble
  `bg-muted … border-border/60` (admin had `bg-muted/40 … border-border/40`),
  `MarkdownLite` `p` `text-foreground` (admin had `text-foreground/90`).
  `ChatHistorySidebar` is otherwise identical (client wording).
- Deps added to `packages/ui`: `@ibadah/core` (workspace), `react-markdown`,
  `recharts`, `remark-gfm` (versions match the apps). That makes `@ibadah/ui`
  depend on `@ibadah/core`; no cycle (`core` imports neither).
- Verified: `pnpm --filter @ibadah/ui build` (declarations emitted),
  `lint` (0 errors), `typecheck` all green; `dist/index.js` imports at runtime
  and exports all 7 AI components. App builds intentionally not run here.
- **Rewire** (client 14 files / admin 13 files): every `@/components/ui/{six}`
  specifier replaced with a single merged `@ibadah/ui` import; the 6 duplicate
  primitives deleted from both apps. The 7 AI modules deleted from both apps
  too; only the `dashboard-ai-widget` / `public-ai-widget` / `admin-ai-widget`
  wrappers remain app-local, passing `useChat`, `ButtonComponent`, layout,
  copy and `persistKey`.
- **Regressions caught during review and fixed:**
  - Guest mode was dead on the landing page - `AIPanel` used to compute
    `surface === 'landing' && !authStorage.hasSession()` itself, which became an
    unforwarded prop. Added `guestMode` to `AIWidget` and wired it in
    `public-ai-widget` (`useSyncExternalStore` so the localStorage read cannot
    desync SSR/hydration).
  - The admin floating widget lost its "Ibadah admin copilot" empty state -
    added `emptyState` to `AIWidget` and wired `ADMIN_EMPTY_STATE`.
  - A phantom `persistKey="ibadah-chat-dashboard"` was added to the dashboard
    widget (the original passed none) - removed.
  - Em dashes / curly apostrophes flattened to ASCII by the editing tool in the
    guest copy and greeting - restored with `\u2014` / `\u2019` escapes and
    verified at runtime.
  - 10 `eslint-disable-next-line no-console` directives stripped during the
    Task 2 cleanup left whitespace-only lines in 5 files - cleaned.
- Verified: `pnpm turbo run lint typecheck build --force` -> **24/24 tasks
  successful** (9 workspaces). Client lint 0 errors / 50 warnings, admin 0
  errors / 17 warnings - both matching the pre-migration baseline.

### Task 6 — Final verification  ✅
- [x] `turbo run lint typecheck build` green across all workspaces
- [x] Update `README.md` and `nixpacks.toml` for the new paths
- [x] Remove dead code / stale configs

Notes:
- `pnpm turbo run lint typecheck build --force` -> 24/24 tasks successful.
- `nixpacks.toml` needed **no change**: it only sets `NODE_VERSION`, with no
  filesystem paths. `pnpm install` from the root still works on Nixpacks.
- `README.md`: rewrote the stack / structure / Getting Started sections for the
  monorepo (`apps/` + `packages/` tree, package table, `pnpm install` once at
  the root, `pnpm --filter` commands, root script table). Corrected the scoring
  config path to `packages/core/src/salah/constants.ts`.
- `DESIGN.md`: 3 live code-path references moved to `apps/...`.
- `apps/admin/README.md`: `client/`/`server/` references and the
  `npm install` / `npm run dev` quick start corrected to pnpm.
- `openspec/` proposals and specs were deliberately **left alone** - they
  record what was decided when; rewriting their paths would falsify history.
- Dead code removed: the 6 duplicate primitives + 7 AI modules in each app,
  `scripts/rewire-shared.js`, and the whitespace left by stripped eslint
  directives.
- Note on `turbo.json`: `dev` depends on `^build` (one-shot), **not** `^dev`, so
  packages are not in watch mode during `pnpm dev`. The README says so
  explicitly and points at `pnpm --filter @ibadah/core dev` for that.
