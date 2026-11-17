# Ibadah Admin — Next.js 16 (pnpm monorepo)
#
# Build context MUST be the repo root: the app depends on workspace packages
# (@ibadah/ui, @ibadah/core, @ibadah/shared). `output: standalone` is NOT set
# in next.config.ts, so `next start` is used and node_modules must stay.

FROM node:22-alpine
RUN apk add --no-cache libc6-compat tini && corepack enable
WORKDIR /app

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

COPY . .

# NEXT_PUBLIC_* values are inlined into the client bundle at BUILD time, so
# they must be present here — setting them only at runtime has no effect.
# Defaults guard against an empty value ('' would make new URL('') throw).
ARG NEXT_PUBLIC_API_URL=https://api-ibadah.noyonrahman.com/api/v1
ARG NEXT_PUBLIC_ADMIN_URL=https://admin-ibadah.noyonrahman.com
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_ADMIN_URL=$NEXT_PUBLIC_ADMIN_URL

RUN pnpm --filter ibadah-admin... build

ENV NODE_ENV=production
EXPOSE 3001

ENTRYPOINT ["/sbin/tini", "--"]
# -H 0.0.0.0 is required: `next start` binds localhost by default and would be
# unreachable from Dokploy's reverse proxy. Invoke the binary directly — passing
# "-H" through `pnpm --filter ... start -- ...` makes Next treat it as the app
# directory instead of a flag.
WORKDIR /app/apps/admin
CMD ["./node_modules/.bin/next", "start", "-H", "0.0.0.0", "-p", "3001"]
