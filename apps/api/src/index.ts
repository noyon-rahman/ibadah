/**
 * Vercel serverless entry point.
 *
 * Vercel builds a Function from a detected entry file — for an Express app it
 * looks for `src/index.{ts,js}`, `src/app.*` or `src/server.*` — and its
 * runtime then `require`s the bundled module and expects a **default export**
 * that is a handler function (or a server).
 *
 * Two things keep that contract satisfied:
 *   1. The Express app lives in `src/create-app.ts`. It only exports a factory
 *      (`createApp`), so when it was named `app.ts` Vercel picked it and failed
 *      at runtime with:
 *        Invalid export found in module "/var/task/apps/api/src/app.js".
 *        The default export must be a function or server.
 *      With no `app.*` file, detection lands here.
 *   2. The default export below is a plain function rather than a re-export,
 *      so the exported binding is a function on every code path.
 *
 * Vercel does not support TypeScript "path mappings" for its Functions, which
 * is why this app uses relative imports with explicit `.js` extensions
 * throughout instead of the old `@/*` alias. Nothing here depends on tsconfig
 * `paths`, so the file works when bundled and when run unbundled.
 *
 * The connection/lifecycle logic lives in `./serverless.js`.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';

import { handleRequest } from './serverless.js';

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  await handleRequest(req, res);
}
