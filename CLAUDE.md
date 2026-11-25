# CLAUDE.md

Guidance for Claude Code working in this repo. Read this first; it supersedes
stale claims in `README.md`/`DESIGN.md` where they conflict (noted inline).

## What this is

**Ibadah** — an Islamic worship tracker (Salah, Quran, Dhikr, habits, checklist)
with streaks, charts, PDF reports, a multilingual landing site and an AI assistant.
pnpm + Turborepo monorepo, three apps, five shared packages, TypeScript everywhere.

## Commands

Run from the repo root unless noted. pnpm **12**, Node **≥ 20**.

| Command | Purpose |
| --- | --- |
| `pnpm install` | One install for the whole workspace |
| `pnpm dev` | Turbo: builds packages, then runs api (:5000), client (:3000), admin (:3001) |
| `pnpm build` | All apps + packages, dependency-ordered |
| `pnpm typecheck` / `pnpm lint` / `pnpm format` | Across all workspaces |
| `pnpm --filter ibadah-api dev` | API only (`node --watch` + ESM loader) |
| `pnpm --filter @ibadah/core dev` | Watch-build a package while editing it |
| `pnpm --filter ibadah-api seed:admin` | Idempotent first-admin bootstrap (env: `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`, optional `ADMIN_FORCE_PASSWORD_RESET=true`) |
| `pnpm --filter ibadah-api seed:db` | **Destructive** full DB reset + fake data (demo user, AI config, 30 days of logs) |
| `pnpm --filter ibadah-api backfill:missed-salah` | One-off backfill of missed prayers |

There is **no test suite** in this repo (no test runner, no test files). Verify changes
with `typecheck`, `lint`, and by running the app. Don't claim tests pass.

Both `seed:*` and `backfill:*` scripts run `pnpm build` first, so they execute compiled `dist/`.

## Layout

```
apps/
  api/       Express 5 + Mongoose 8, ESM, :5000, prefix /api/v1
  client/    Next.js 16 App Router, end-user app, :3000, locale-prefixed routes
  admin/     Next.js 16 App Router, ops console, :3001, no locale prefix
packages/
  core/      @ibadah/core     Pure domain logic: salah constants + scoring, AI wire types,
                              chart-fence parser, canonical system prompts. No I/O, no framework.
  shared/    @ibadah/shared   cn(), toDayKey(), initials, relative time, timezone catalog.
  ui/        @ibadah/ui       ONLY byte-identical React components: a few primitives + the AI
                              widget suite (panel, composer, message, chart renderer, history sidebar).
  eslint-config/  typescript-config/   Build presets (no-op build scripts).
```

Packages are built with `tsc` to `dist/` (ESM, with `.js` extensions in imports). Apps
consume the built output, not the source. **After editing a package, rebuild it** or run
its watch build — otherwise consumers see stale types.

## API (`apps/api`)

- **ESM with `@/*` path alias.** Dev runs via `node --watch --import ./esm-loader.mjs`;
  `esm-loader.mjs` + `esm-resolve.mjs` implement `@/*` → `src/*` and extensionless imports for
  Node's ESM pipeline. `ts-node` is NOT used directly, and there are no path aliases in
  `dist` — the build runs `tsc` then `tsc-alias` so emitted imports resolve.
- **Config is validated at startup** in [env.ts](apps/api/src/config/env.ts) (Zod, exits on
  failure). Add new server env vars there and to `.env.example`, not via ad-hoc
  `process.env` reads (the only exceptions are the seed scripts).
- **Module pattern:** each feature folder owns `*.model.ts`, `*.routes.ts`, `*.controller.ts`,
  `*.service.ts`, `*.validation.ts`, `*.interface.ts`. Routes aggregate in
  [routes/index.ts](apps/api/src/routes/index.ts).
- **Response envelope** — always via `sendResponse`: `{ success, message, data, meta? }`.
  Errors via `ApiError` + `catchAsync` + centralized [error.ts](apps/api/src/middleware/error.ts)
  (maps Zod errors, Mongoose validation/cast, duplicate-key 11000 → 409).
- **Validation** — Zod schemas in `*.validation.ts`, wired as `validate(schema)` middleware
  which reassigns parsed `body`/`query`/`params` onto `req`.
- **Auth** — JWT access (~15m) + refresh (~30d). `requireAuth` / `optionalAuth` /
  `requireAdmin` in [middleware/auth.ts](apps/api/src/middleware/auth.ts). Token source:
  `Authorization: Bearer` first, else `accessToken` httpOnly cookie. `requireAuth`
  also checks `suspended`, refreshes `lastActiveAt`, and **prefers the DB `role` over the
  token claim**.
- **Dual-mode delivery** keyed on header `x-client-type: web` → httpOnly cookies, body
  returns `{ user }` only. Anything else → `{ user, accessToken, refreshToken }` in body.
  Cookie flags from `COOKIE_DOMAIN` / `COOKIE_SECURE` / `COOKIE_SAME_SITE`.
- **Admin routes**: [admin.routes.ts](apps/api/src/modules/admin/admin.routes.ts) applies
  `requireAuth, requireAdmin` at the router level. Moderation and audit have **no own
  router** — they live under `/admin/moderation/*` and `/admin/audit/*`. Privileged writes
  emit append-only audit events via `auditService.record*`.
- **Security middleware**: helmet, `requestShield` (403s scanner paths), global rate limit
  300/15min/IP, tighter limiters on auth and guest AI.
- **Scheduled job**: hourly cron `5 * * * *` UTC runs `salahService.settleAllEndedDays()` —
  for each user, any day strictly before their local today (IANA tz via Intl) has pending
  Fards flipped to `missed` (capped at 90 days back). Idempotent.
- **AI** (`modules/ai`): provider credentials live **only in Mongo** (`ai_config` collection,
  managed from admin `/ai-settings`) — no env fallback. Providers: openai, anthropic, gemini,
  openrouter, custom (OpenAI-compatible; needs baseUrl). `agent.service.ts` runs a
  multi-round tool loop (max 5 rounds); tools are per-role (`tools/client-tools.ts`,
  `tools/admin-tools.ts`) and executed server-side. Routes split by audience:
  `/ai/guest` (public, rate-limited), `/ai/client`, `/ai/admin`, `/ai/config` (admin).
  Responses stream SSE.
- **Other modules:** `onboarding` (survey submissions), `release` (public changelog seeded
  from `src/data/changelog.json`, regenerated from git history at build time by
  `scripts/generate-changelog.mjs`), `report` (server PDF), `site-config` (singleton runtime
  settings, e.g. the recruiter-intro popup), `moderation`, `audit`.

### Domain conventions (important)

- **Day keys are `YYYY-MM-DD`**, normalized to **UTC midnight** server-side by
  `toDayKey()`. Clients send *their local* day string. Never store timezone-shifted Dates.
  "Has the day ended for this user?" is answered with `localDayKey(user.timezone)`.
- **Salah scoring lives in `@ibadah/core`** ([constants.ts](packages/core/src/salah/constants.ts)):
  per-rakah sunnah points × fixed rakah counts per waqt; Jummah replaces Dhuhr on Fridays.
  Per-user overrides on `User.scoring` merged over defaults. Change defaults only there.
- Daily documents are unique on `(user, date)` in every daily collection.

## Client (`apps/client`)

- Locale-prefixed routes under `src/app/[locale]/` — locales `en`, `bn` (Bangla), `ar` (Arabic, RTL),
  `localePrefix: 'always'`. Locale routing middleware is in **`src/proxy.ts`** (avoid
  adding a `src/middleware.ts` — `proxy.ts` already handles locale routing).
- Messages: one JSON per locale in `messages/`, ~27 namespaces; loaded wholesale in
  `src/i18n/request.ts`. Use the wrapped `Link/useRouter` from `src/i18n/routing.ts`
  (not `next/link`) so the locale prefix is preserved.
- Route groups: `(auth)` login/register, `(dashboard)` app shell (`NOINDEX`), plus marketing
  pages. Dashboard pages: dashboard, salah, quran, hadith, dhikr, habits, checklist,
  assistant, settings.
- Providers: `src/components/providers.tsx` (next-themes → QueryClient → sonner). Dashboard
  shell wraps in `AuthGuard` + sidebar/topbar/bottom-nav + AI widget.
- **Auth storage:** tokens are **httpOnly cookies** — JS cannot read them. `localStorage`
  only holds the marker `ibadah:session`. `lib/axios.ts` sends `withCredentials` +
  `x-client-type: web` and transparently refreshes once on 401 (deduped across concurrent
  401s) except for `/auth/*` handshake paths.
- Feature convention: `lib/<feature>/<feature>-api.ts` (transport) + `hooks/use-<feature>.ts`
  (React Query, tuple keys like `['salah','day',date]`, optimistic updates with rollback) +
  components under `components/<feature>/`. Zustand only for auth and UI state.
- Hadith is fetched **directly from a public CDN** (jsdelivr, fawazahmed0/hadith-api) with
  `fetch`, not through the API — six canonical books only.
- The dashboard PDF report is generated **client-side** with `@react-pdf/renderer`
  (`lib/pdf-generator.tsx`); a server PDF endpoint also exists (`/reports/client/pdf`).
- PWA: `manifest.ts`, service worker at `public/sw.js` (bumped `VERSION`), registered by
  `components/pwa/sw-register.tsx`. The SW never caches cross-origin (API) requests.

## Admin (`apps/admin`)

- **Bearer/body auth mode**: no `x-client-type: web`; tokens in `localStorage` under
  `ibadah:access` / `ibadah:refresh` (keys **shared with client origin**), attached by an
  axios interceptor. Opt a call out with `_auth: false` (the login call). No refresh flow.
  Stale-token risk is handled server-side by `requireAuth` reading the DB role — demoted
  admins get 403s even with a valid token.
- `AuthGuard` (client-side) redirects to `/login` and renders `AccessDenied` for non-admin
  or suspended users. Server enforcement is `requireAdmin`.
- **Admin IS localized** (en/bn/ar). README/DESIGN saying "English-only" is stale.
  `components/i18n-provider.tsx` + `i18n/messages.ts`; locale comes from the user profile,
  no URL prefix.
- Pages: dashboard, analytics, leaderboard, users (+ `users/[id]`), moderation, audit,
  onboarding, system, ai-settings, assistant, settings. Transport: `lib/admin/admin-api.ts`,
  AI config: `lib/ai/ai-config-api.ts`.
- Paginated endpoints use `api.raw()` and synthesize `meta` — the plain helper drops it.

## Known duplication / gotchas (don't "fix" blindly)

- `apps/client/src/lib/ai/` and `apps/admin/src/lib/ai/` are **near-identical copies**
  (provider streaming clients, `stream.ts`, `config.ts`). They already diverge slightly.
  Shared types/prompts/parser come from `@ibadah/core`; the rest is intentionally copied so
  the two Next apps ship independently. If you change one, check the other.
- `lib/ai/client.ts` (`streamChatRequest`, `AI_CHAT_ENDPOINT = '/api/ai/chat'`) is
  **dead code** in both apps — no such Next route exists. Chat goes straight from the
  browser to the API SSE endpoints via `lib/ai/ai-api.ts`. Comments referencing
  `/api/ai/chat` are stale.
- Only `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_SITE_URL` are actually used by the client
  (`NEXT_PUBLIC_ADMIN_URL` by admin). `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is in `.env.example`
  but unused; Google sign-in URL comes from `GET /auth/google`.
- Client `lib/ai/config.ts` reads `AI_*` env vars, but that file is a server-side artifact
  copy — the browser never holds AI keys; generation happens in the API.
- `DESIGN.md` §10.2 lists admin endpoints "needed" that now **exist**; §10.1/§10.4 are also
  outdated. Treat `admin.routes.ts` as the source of truth.

## Data model quick map

`User` (email, googleId, name, avatarUrl, locale, timezone, scoring overrides, role
`user|admin`, suspended, lastActiveAt). Daily docs keyed `(user, UTC-midnight date)`:
`SalahDay`, `QuranDay`, `DhikrDay`, `ChecklistDay`, plus `Habit` + `HabitDay`. Other
collections: `ai_config`, chat sessions/messages, `moderation_flags`, `audit_events`,
`onboarding_submissions`, `releases`, `site_config`, `defaults_config` (starter templates
copied to users on signup only — never retroactively applied).

## House style

- Prefer existing tokens/utilities over new colors (see `DESIGN.md` §2–6 for the token
  system; it's accurate). shadcn/ui New York style, Lucide icons.
- Conventional commits (`feat(scope): …`, `fix(scope): …`); the changelog script derives
  categories from them. Don't hand-edit `changelog.json` — it's generated.
- `openspec/` drives spec-driven changes (`openspec/specs/*`, `openspec/changes/*`);
  use the openspec skills for proposing/implementing changes there.
- Deployment: one Dockerfile per app, **build context must be the repo root** (workspace
  deps + pnpm resolution). Next apps use `next start` with `-H 0.0.0.0`; `NEXT_PUBLIC_*`
  values are inlined at build time via build args.
