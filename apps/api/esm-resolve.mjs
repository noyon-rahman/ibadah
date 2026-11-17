/**
 * Resolver hook backing the `@/*` path alias for ESM dev runs.
 *
 * Mirrors `compilerOptions.paths` in `tsconfig.dev.json`
 * (`"@/*": ["*"]` with `baseUrl: "./src"`): `@/app` -> `<src>/app`.
 * Only bare `@/` specifiers are touched; every other import is passed
 * through to the next resolver untouched.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Extensions tried when the alias target has no file extension. */
const EXTENSIONS = ['.ts', '.tsx', '.mts', '/index.ts', '/index.tsx'];

let baseUrl;

export function initialize(data) {
  baseUrl = data.baseUrl;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const target = new URL(specifier.slice(2), baseUrl);
    const resolved = existsSync(fileURLToPath(target))
      ? target
      : EXTENSIONS.map((ext) => new URL(target.href + ext, baseUrl)).find((candidate) =>
          existsSync(fileURLToPath(candidate)),
        );

    if (resolved) return nextResolve(resolved.href, context);
  }

  return nextResolve(specifier, context);
}
