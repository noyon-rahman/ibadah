import express, { type Application } from 'express';
import cors from 'cors';
// Default import is correct here: helmet's declarations export the middleware
// only as `helmet as default` (there is no named `helmet` binding), and the
// runtime CommonJS module exposes it as `module.exports`.
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { StatusCodes } from 'http-status-codes';

import { env } from './config/env.js';
import { configurePassport } from './config/passport.js';
import { requestShield } from './middleware/requestShield.js';
import { errorHandler } from './middleware/error.js';
import { notFound } from './middleware/notFound.js';
import { apiRouter } from './routes/index.js';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { handleRequest } from './serverless.js';

export function createApp(): Application {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  // --- Security & infra middleware ---
  app.use(helmet());
  app.use(requestShield);
  app.use(
    cors({
      origin: env.CORS_SUPPORT_URL,
      credentials: true,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  if (env.NODE_ENV !== 'test') {
    app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
  }

  // --- Passport (stateless OAuth only) ---
  // We never call passport.session() — every protected route uses the
  // app's own JWT bearer auth. Passport is here purely to handle the
  // Google OAuth 2.0 redirect dance via the `passport-google-oauth20`
  // strategy. See `config/passport.ts` for the strategy definition.
  app.use(configurePassport().initialize());

  // Global rate limiter (per IP). Tweak per-route as needed.
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 300,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
    }),
  );

  // --- Health check ---
  app.get('/health', (_req, res) => {
    res.status(StatusCodes.OK).json({ status: 'ok', uptime: process.uptime() });
  });

  // --- API routes ---
  app.use(env.API_PREFIX, apiRouter);

  // --- 404 + error handler (must be last) ---
  app.use(notFound);
  app.use(errorHandler);

  return app;
}

/**
 * Vercel Function entry.
 *
 * `app.ts` is the file Vercel's Express builder looks for — it is the only
 * candidate whose import graph contains `express`, so it must stay named this
 * way. (Renaming it to `create-app.ts` produced "No entrypoint found which
 * imports express", and the alternative candidate, `server.ts`, calls
 * `app.listen()` and is wrong for serverless.)
 *
 * The builder also requires the module's **default export** to be a handler
 * function or a server. `createApp` alone is neither, which previously failed
 * at runtime with "Invalid export found in module .../src/app.js". The default
 * export below is the lazily-initialised request handler: it connects Mongo
 * once per cold start and then serves through the same Express app used by the
 * long-running server in `server.ts`.
 */
export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  await handleRequest(req, res);
}
