# Ibadah — Journey Towards Allah

A modern, full-featured Islamic tracking application to track Salah, Quran, Dhikr, daily habits, and checklists with rich progress visualizations, streaks, and goals.

> **Tagline:** Journey Towards Allah

---

## Tech Stack

This repo is a **pnpm + Turborepo monorepo**: three apps under `apps/`
and five shared packages under `packages/`.

### Apps

#### Client (`apps/client`)
- **Next.js 15** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS v4** + **shadcn/ui** (New York style)
- **next-intl** for i18n (English now; Bangla & Arabic ready, RTL-aware)
- **TanStack Query** (server state) + **Zustand** (client state)
- **Recharts** for charts/heatmaps
- **next-themes** (light/dark mode)

#### API (`apps/api`)
- **Node.js** (≥ 20) + **Express 5** + **TypeScript**
- **MongoDB Atlas** + **Mongoose 8**
- **Zod** for validation, **JWT** for auth, **bcryptjs** for password hashing
- Hardening: `helmet`, `cors`, `express-rate-limit`, structured error handling

#### Admin (`apps/admin`)
- **Next.js 15** + **React 19** + **TypeScript** (mirrors the client stack)
- Tailwind CSS v4 + shadcn/ui — same design tokens as the client
- TanStack Query + Zustand
- Internal-only console at `:3001`. English-only (i18n is for end-users)
- Consumes the same REST API. See [`design.md` §10](./design.md) for what works today vs which `/admin/*` server endpoints still need to ship.

### Packages

| Package | Purpose |
| --- | --- |
| `@ibadah/core` | Pure business logic shared by all three apps — Salah scoring constants + calculator, AI wire types, chart parser, canonical system prompts. No I/O, no framework code. |
| `@ibadah/shared` | Environment-agnostic helpers — `cn()`, day-key/timezone utilities, formatting. |
| `@ibadah/ui` | Presentational React components shared by client + admin — byte-identical primitives, plus the parameterized AI widget suite. |
| `@ibadah/typescript-config` | Shared `tsconfig` presets (`base`, `nextjs`, `node`, `react-library`). |
| `@ibadah/eslint-config` | Shared ESLint flat-config presets (`base`, `next`, `node`). |

Packages are **built with `tsc`** (they emit `dist/` + `.d.ts`); apps consume
the built output, and Turbo sequences builds so a package always builds
before its consumers.

### Architecture
- Clean **client–admin–server** separation; backend is REST.
- Server uses a modular **feature-folder** pattern (each module owns its model, routes, controller, service, validation).
- Single shared design system, documented in [`design.md`](./design.md).
- Built **i18n-first** and **SEO-first** (metadata API, sitemap, robots, locale routing).

---

## Project Structure

```
ibadah/
├── apps/
│   ├── client/                  # Next.js frontend (end-user app, :3000)
│   │   ├── messages/            # i18n message catalogs (en, bn, ar)
│   │   └── src/
│   │       ├── app/[locale]/    # Locale-prefixed App Router
│   │       ├── components/      # ui, ai, landing, layout, shared
│   │       ├── lib/             # api client, auth helpers
│   │       ├── hooks/, store/, types/
│   │       └── i18n/            # next-intl config
│   ├── admin/                   # Next.js admin panel (internal, :3001)
│   │   └── src/
│   │       ├── app/             # (auth)/login + (panel) shell with all admin pages
│   │       ├── components/      # admin/, auth/, ui/, layout/
│   │       └── hooks/, lib/, store/
│   └── api/                     # Express 5 API (:5000)
│       └── src/
│           ├── config/          # env validation, db connection
│           ├── middleware/      # auth, error, validate, notFound
│           ├── modules/         # auth, user, salah, quran, dhikr, habit, checklist, stats, ai
│           ├── routes/          # route aggregator
│           └── utils/           # ApiError, catchAsync, sendResponse, token
├── packages/
│   ├── core/                    # @ibadah/core — shared business logic
│   ├── shared/                  # @ibadah/shared — shared utilities
│   ├── ui/                      # @ibadah/ui — shared React components
│   ├── eslint-config/           # @ibadah/eslint-config
│   └── typescript-config/       # @ibadah/typescript-config
├── turbo.json
└── pnpm-workspace.yaml
```

---

## Getting Started

### Prerequisites
- Node.js **≥ 20** (LTS recommended)
- **pnpm 12** (`corepack enable` — the version is pinned in `package.json`)
- A **MongoDB Atlas** cluster (or local MongoDB)

### 1. Clone & install

```bash
git clone https://github.com/noyonalways/ibadah.git
cd ibadah

# One install for the whole workspace (all apps + packages)
pnpm install
```

### 2. Configure environment

```bash
# Server
cp apps/api/.env.example apps/api/.env
# Fill in MONGODB_URI, JWT_SECRET, JWT_REFRESH_SECRET, CLIENT_URL

# Client
cp apps/client/.env.example apps/client/.env
# Fill in NEXT_PUBLIC_API_URL (e.g. http://localhost:5000/api/v1)

# Admin (optional)
cp apps/admin/.env.example apps/admin/.env
# Same NEXT_PUBLIC_API_URL as the client.
```

### 3. Run in development

```bash
# Everything at once (server :5000, client :3000, admin :3001)
pnpm dev

# …or run a single app
pnpm --filter ibadah-api dev
pnpm --filter ibadah-client dev
pnpm --filter ibadah-admin dev
```

`pnpm dev` first builds the shared packages, then starts all three apps
together. If you're actively editing a package, run its watch build
alongside it:

```bash
pnpm --filter @ibadah/core dev    # tsc --watch
```

### Useful root scripts

| Command | What it does |
| --- | --- |
| `pnpm build` | Build every app + package (Turbo-ordered) |
| `pnpm typecheck` | Typecheck all workspaces |
| `pnpm lint` | Lint all workspaces |
| `pnpm clean` | Remove build output and `node_modules` |

---

## Salah Scoring Rules

| Status | Points |
| --- | --- |
| On time (Awwal Waqt) | **+30** |
| On time (mid window) | **+20** |
| On time (last window) | **+10** |
| Late / Qaza | **0** |
| Missed | **−10** |
| Sunnah (per rak'ah) | **+2** (×rakah count) |
| Nafl (per prayer) | **+3** |
| Witr | **+5** |

**Per-prayer sunnah rakah counts** (Hanafi, fixed) — the per-rakah point
value is multiplied by these to compute the actual reward:

| Prayer  | Sunnah before | Sunnah after |
| ---     | :---:         | :---:        |
| Fajr    | 2             | —            |
| Dhuhr   | 4             | 2            |
| Asr     | 4             | —            |
| Maghrib | —             | 2            |
| Isha    | 4             | 2            |
| Jummah  | 4             | 4            |

So Fajr's sunnah-before pays out `2 × 2 = +4` while Dhuhr's pays out
`4 × 2 = +8` — proportional to the work performed. The UI hides
toggles that don't apply (e.g. "Sunnah after" on Fajr, or "Sunnah
before" on Maghrib). Configurable via
`packages/core/src/salah/constants.ts` (point values + rakah
counts) and the admin's Scoring page (point values only — rakah counts
are fixed by tradition).

---

## Admin Panel

Operations console at `:3001`. The nav is intentionally trim — three
groups, eight pages — and the operator's profile (avatar, name, default
locale, timezone) lives in the topbar dropdown:

| Group   | Page         | Route             | Backed by |
| ---     | ---          | ---               | ---       |
| Insight | Dashboard    | `/dashboard`      | `GET /admin/dashboard` (metrics + health + analytics + moderation + audit, single round-trip) |
| Insight | Analytics    | `/analytics`      | `GET /admin/analytics/overview` |
| Insight | Leaderboard  | `/leaderboard`    | `GET /admin/leaderboard` |
| People  | Users        | `/users`, `/users/:id` | `GET /admin/active-users`, `GET/PATCH/DELETE /admin/users*`, `GET /admin/users/:id/analytics` |
| Operate | Moderation   | `/moderation`     | `GET /admin/moderation/queue`, `POST /admin/moderation/scan`, `POST /admin/moderation/flags/:id/decision` |
| Operate | Audit log    | `/audit`          | `GET /admin/audit`, `/admin/audit/actions`, `/admin/audit/summary` |
| Operate | System       | `/system`         | `GET /admin/metrics`, `/admin/health` |
| Operate | Settings     | `/settings`       | `GET/PATCH /users/me` |

Sidebar is **collapsible / expandable** (preference stored in
`localStorage`) and slides in as an off-canvas drawer on small screens.

Privileged actions emit append-only **audit events** captured by
`auditService.recordFromRequest` — surfaced live on the Audit log page.

---

## Internationalization (i18n)

- Default locale: **`en`**
- Planned locales: **`bn`** (Bangla), **`ar`** (Arabic, RTL)
- Locale routing handled via `next-intl` middleware. Add new strings to `apps/client/messages/<locale>.json`.

---

## SEO

- Per-route `generateMetadata` with localized titles/descriptions
- `sitemap.ts` + `robots.ts`
- Open Graph & Twitter card defaults
- Semantic HTML, accessible color contrast

---

## Roadmap

- [x] Architecture & scaffolding
- [x] Auth (email/password, JWT, Google OAuth)
- [x] **Dual-mode auth (mobile-ready)** — web uses httpOnly access/refresh
      cookies; mobile/Bearer clients get tokens in the response body. Same
      endpoints for both via the `x-client-type` header. Access token
      gates the app; refresh token silently revalidates it (auto
      refresh-on-401 on the web client). `POST /auth/logout` clears cookies.
- [x] Persistent client login session (tokens survive server restarts)
- [x] Salah module (reference impl)
- [x] **Per-prayer Salah sunnah model** — each waqt declares its own
      `sunnah-before` / `sunnah-after` rakah count (Fajr 2/0, Dhuhr 4/2,
      Asr 4/0, Maghrib 0/2, Isha 4/2, Jummah 4/4); scoring is points-
      per-rakah multiplied by these counts. Toggles that don't apply
      are hidden on both client and admin.
- [x] Admin panel scaffold (single-tenant, mirrors client design)
- [x] Admin: server-side `isAdmin` flag + `requireAdmin` middleware
- [x] Admin: cross-user endpoints (`/admin/users`, `/admin/active-users`,
      `/admin/leaderboard`, `/admin/metrics`, `/admin/health`,
      `/admin/analytics/overview`)
- [x] Admin: moderation queue (`/admin/moderation/*` — auto-scan, approve / hide / remove, manual flagging)
- [x] Admin: audit log (`/admin/audit*` — append-only trail of every privileged action with diff & actor IP/UA)
- [x] Admin: editable profile (avatar upload, name, default locale, timezone) from header dropdown
- [x] Admin: collapsible / expandable sidebar with persisted preference + mobile drawer
- [x] Admin: trimmed nav (Dashboard, Analytics, Leaderboard, Users,
      Moderation, Audit, System, Settings)
- [ ] Full Quran / Dhikr / Habit / Checklist modules
- [ ] Charts: weekly/monthly bars, daily heatmap, calendar view
- [ ] Streak engine + weekly/monthly goals
- [ ] PWA + offline support
- [ ] Bangla & Arabic localization
- [ ] Google OAuth

---

## License

MIT
