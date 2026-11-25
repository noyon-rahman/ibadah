/**
 * Resolver hook backing extensionless relative imports for ESM dev runs.
 *
 * TypeScript resolves `./foo` to `./foo.ts`, but Node's ESM resolver does not
 * guess extensions. This hook mirrors the TypeScript behaviour so source files
 * can be imported without an extension in `dev` (production builds are emitted
 * by `tsc`, which already appends the correct extension).
 *
 * Only extensionless *relative* specifiers are touched; everything else is
 * passed through to the next resolver untouched.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Extensions tried when a specifier has no file extension. */
const EXTENSIONS = ['.ts', '.tsx', '.mts', '/index.ts', '/index.tsx'];

function findWithExtensions(target) {
  if (existsSync(fileURLToPath(target))) return target;
  return EXTENSIONS.map((ext) => new URL(target.href + ext)).find((candidate) =>
    existsSync(fileURLToPath(candidate)),
  );
}

export async function resolve(specifier, context, nextResolve) {
  if (
    (specifier.startsWith('./') || specifier.startsWith('../')) &&
    !/\.[cm]?[jt]sx?$/.test(specifier)
  ) {
    const parentURL = context.parentURL ?? import.meta.url;
    const resolved = findWithExtensions(new URL(specifier, parentURL));
    if (resolved) return nextResolve(resolved.href, context);
  }

  return nextResolve(specifier, context);
}
