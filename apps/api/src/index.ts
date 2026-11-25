/**
 * Vercel serverless entry point.
 *
 * Vercel auto-detects an Express app at `src/index.{ts,js}` (or
 * `src/app`/`src/server`) and bundles *that source file* as the Function
 * entry. It does not run the `dist/` output, so the `@/*` path alias — which
 * only `tsc-alias` rewrites during `pnpm build` — would fail at runtime with
 * `ERR_MODULE_NOT_FOUND: Cannot find package '@/config'`.
 *
 * Bundlers (esbuild, which Vercel uses) understand `tsconfig` `paths`, so
 * importing the app here is safe: the alias is resolved at bundle time and
 * never reaches Node's ESM resolver.
 *
 * This file also owns the serverless lifecycle:
 *
 *   - Connect to MongoDB lazily, once per cold start, and reuse the pool
 *     across warm invocations (a per-request connect would exhaust the
 *     connection limit).
 *   - Never call `app.listen()` — Vercel provides the HTTP listener.
 *   - Skip the node-cron scheduler: a serverless process is frozen between
 *     requests, so `node-cron` timers never fire. Use Vercel Cron jobs
 *     instead (see README / deployment notes).
 */
import type { Application } from 'express';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { createApp } from '@/app';
import { connectDatabase } from '@/config/db';
import { releaseService } from '@/modules/release/release.service';
import { logger } from '@/utils/logger';

let appPromise: Promise<Application> | undefined;

async function bootstrap(): Promise<Application> {
  await connectDatabase();

  // Seed releases from changelog.json (idempotent — safe to run on every
  // cold start, and cheap when the collection is already populated).
  await releaseService.seedReleases();

  logger.info('Vercel serverless entry initialised');
  return createApp();
}

/**
 * Vercel invokes the default export for every request. Caching the promise
 * means concurrent cold-start requests share one connection attempt instead
 * of racing to open several.
 */
function getApp(): Promise<Application> {
  appPromise ??= bootstrap().catch((err) => {
    // Reset so the next request can retry rather than pinning a rejected
    // promise for the lifetime of the instance.
    appPromise = undefined;
    logger.error('Serverless bootstrap failed', err as Error);
    throw err;
  });
  return appPromise;
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const app = await getApp();
  app(req, res);
}
