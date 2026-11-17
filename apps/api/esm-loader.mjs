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
 *   2. The `@/*` alias below - `tsconfig-paths` only patches the CommonJS
 *      resolver, so ESM imports of `@/app` etc. need an explicit hook that
 *      maps them onto `<src>/...` exactly like `tsconfig.dev.json` does.
 */
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('ts-node/esm', pathToFileURL('./'));
register('./esm-resolve.mjs', pathToFileURL('./'), {
  data: { baseUrl: pathToFileURL('./src/').href },
});
