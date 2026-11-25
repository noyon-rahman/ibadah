/**
 * ESM dev-time loader for the API.
 *
 * The API is a real ESM app (`"type": "module"`), and the workspace
 * packages (`@ibadah/core`, `@ibadah/shared`) are ESM-only. The old
 * `ts-node-dev` setup compiled to CommonJS, which cannot `require()` them,
 * so dev runs through Node's own ESM pipeline + `node --watch` instead.
 *
 * Two things are registered here:
 *
 *   1. `ts-node/esm` - transpiles TypeScript on the fly.
 *   2. `esm-resolve.mjs` - lets `./x` resolve to `./x.ts` the way TypeScript's
 *      own resolver does, so imports can stay extensionless in source.
 *
 * There is deliberately no `@/*` path-alias hook: Vercel does not support
 * TypeScript path mappings for its Functions, so the API uses relative
 * imports throughout and the alias no longer exists.
 */
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('ts-node/esm', pathToFileURL('./'));
register('./esm-resolve.mjs', pathToFileURL('./'), {
  data: { baseUrl: pathToFileURL('./src/').href },
});
