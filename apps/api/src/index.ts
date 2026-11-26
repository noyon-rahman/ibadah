/**
 * Vercel serverless entry (alias).
 *
 * The real Function entry is `src/app.ts`. Vercel's Express builder only
 * accepts a candidate whose import graph contains `express`, and `app.ts` is
 * that file — so the handler lives there. This module re-exports the same
 * handler for anything that imports `./index.js` by convention (the long-lived
 * server in `server.ts` does not).
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
