import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import { globalIgnores } from 'eslint/config';

import { sharedRules } from './base.js';

/**
 * Preset for Next.js apps: the official Next.js flat configs plus our
 * shared rule tweaks.
 *
 * `eslint-config-next` already registers the TypeScript ESLint plugin,
 * so we only layer the shared *rules* on top — pulling in the full base
 * preset here would register the same plugin twice.
 */
export default [
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      ...sharedRules,
      // React Compiler rules shipped with eslint-config-next@16 flag
      // long-standing, valid hook patterns (setState in mount effects,
      // reading refs, Date.now() during render) as errors. Keep them
      // visible as warnings so they can be addressed deliberately
      // rather than blocking the build during migration.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/refs': 'warn',
    },
  },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'dist/**', 'next-env.d.ts']),
];
