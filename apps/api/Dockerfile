# Ibadah API — Express 5 + MongoDB (pnpm + turbo monorepo)
#
# Build context MUST be the repo root (Dokploy default), because the API
# depends on the workspace package @ibadah/core, which the compiled output
# imports by name ("@ibadah/core") and resolves through pnpm's node_modules.

FROM node:22-alpine
RUN apk add --no-cache libc6-compat tini && corepack enable
WORKDIR /app

# Install with the lockfile first for layer caching on dependency changes.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/admin/package.json apps/admin/
COPY apps/client/package.json apps/client/
COPY packages/core/package.json packages/core/
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
COPY packages/eslint-config/package.json packages/eslint-config/
COPY packages/typescript-config/package.json packages/typescript-config/
RUN pnpm install --frozen-lockfile

# Source + build. The `...` suffix builds dependencies (@ibadah/core, which the
# API imports by name) *before* the API — a bare `--filter ibadah-api` fails
# because core's type declarations don't exist yet.
COPY . .
RUN pnpm --filter ibadah-api... build

ENV NODE_ENV=production
EXPOSE 5000

# tini reaps the scheduled-job timers cleanly on SIGTERM.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/api/dist/server.js"]
