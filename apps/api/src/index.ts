/**
 * Vercel serverless entry point.
 *
 * Vercel builds a Function from a detected entry file — for an Express app it
 * looks for `src/index.{ts,js}`, `src/app.*`, or `src/server.*`, and bundles
 * that *source file* rather than the `dist/` output.
 *
 * Vercel does not support TypeScript "path mappings" for its Functions, which
 * is why this app uses relative imports with explicit `.js` extensions
 * throughout instead of the old `@/*` alias. Nothing here depends on tsconfig
 * `paths`, so the file works when bundled and when run unbundled.
 *
 * The connection/lifecycle logic lives in `./serverless.js`.
 */
export { handleRequest as default } from './serverless.js';
