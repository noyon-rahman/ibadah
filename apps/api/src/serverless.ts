/**
 * Shared serverless lifecycle for the API.
 *
 * Used by the Vercel Function entry (`src/index.ts`). Keeping it in one place
 * means the connection handling cannot drift between entry points.
 *
 * The Express app lives in `src/create-app.ts`, deliberately *not* `app.ts`:
 * Vercel's entry auto-detection looks for `src/index.*`, `src/app.*` and
 * `src/server.*`, and `app.*` only exports a factory, so detecting it failed
 * at runtime with "Invalid export found in module .../src/app.js".
 *
 * Responsibilities:
 *   - Connect to MongoDB once per cold start and reuse the pool across warm
 *     invocations (a per-request connect would exhaust the connection limit).
 *   - Seed releases from changelog.json (idempotent, cheap when populated).
 *   - Never call `app.listen()` — the platform provides the HTTP listener.
 *   - Skipping node-cron is intentional: a serverless process is frozen
 *     between requests, so timers never fire. Use Vercel Cron instead.
 */
import type { Application } from 'express';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { createApp } from './create-app.js';
import { connectDatabase } from './config/db.js';
import { releaseService } from './modules/release/release.service.js';
import { logger } from './utils/logger.js';

let appPromise: Promise<Application> | undefined;

async function bootstrap(): Promise<Application> {
  await connectDatabase();
  await releaseService.seedReleases();
  logger.info('Serverless entry initialised');
  return createApp();
}

/**
 * Resolve the app once per instance. Caching the promise means concurrent
 * cold-start requests share a single connection attempt rather than racing
 * to open several.
 */
export function getApp(): Promise<Application> {
  appPromise ??= bootstrap().catch((err) => {
    // Reset so the next request retries instead of pinning a rejected promise
    // for the lifetime of the instance.
    appPromise = undefined;
    logger.error('Serverless bootstrap failed', err as Error);
    throw err;
  });
  return appPromise;
}

/** Node-style request handler shared by the entry modules. */
export async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const app = await getApp();
  app(req, res);
}
