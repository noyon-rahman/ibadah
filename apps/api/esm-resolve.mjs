/**
 * Resolver hook backing the `@/*` path alias for ESM dev runs.
 *
 * Mirrors `compilerOptions.paths` in `tsconfig.dev.json`
 * (`"@/*": ["*"]` with `baseUrl: "./src"`): `@/app` -> `<src>/app`.
 * Only bare `@/` specifiers are touched; every other import is passed
 * through to the next resolver untouched.
 *
 * Also mirrors the TypeScript "extensionless import" behaviour: relative
 * specifiers without a file extension are resolved against the TypeScript
 * source extensions, so a plain `node` run of a `.ts` script does not need
 * the `--experimental-strip-types` extension-resolution rules.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Extensions tried when a specifier has no file extension. */
const EXTENSIONS = ['.ts', '.tsx', '.mts', '/index.ts', '/index.tsx'];

let baseUrl;

export function initialize(data) {
  baseUrl = data.baseUrl;
}

function findWithExtensions(target) {
  if (existsSync(fileURLToPath(target))) return target;
  return EXTENSIONS.map((ext) => new URL(target.href + ext)).find((candidate) =>
    existsSync(fileURLToPath(candidate)),
  );
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const target = new URL(specifier.slice(2), baseUrl);
    const resolved = findWithExtensions(target);
    if (resolved) return nextResolve(resolved.href, context);
  }

  // Relative imports written without an extension (TypeScript style), e.g.
  // `import './app'` — resolve them to the matching `.ts` source file.
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\.[cm]?[jt]sx?$/.test(specifier)) {
    const parentURL = context.parentURL ?? baseUrl.href;
    const resolved = findWithExtensions(new URL(specifier, parentURL));
    if (resolved) return nextResolve(resolved.href, context);
  }

  return nextResolve(specifier, context);
}
