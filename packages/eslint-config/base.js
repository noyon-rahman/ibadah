import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Rule set shared by every workspace preset. Keeping it as a plain
 * object (not a full config array) lets presets layer it on top of
 * framework configs that already register the same plugins.
 */
export const sharedRules = {
  '@typescript-eslint/no-unused-vars': [
    'warn',
    { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
  ],
  '@typescript-eslint/no-explicit-any': 'warn',
  '@typescript-eslint/consistent-type-imports': [
    'warn',
    { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
  ],
};

/**
 * Base preset shared by every workspace: JS recommended + the
 * TypeScript recommended rules, using the non type-aware variant so it
 * stays fast and needs no project references.
 *
 * Rules mirror the previous `server/.eslintrc.json` so migrating to the
 * shared config doesn't change what the codebase is held to.
 */
export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { rules: sharedRules },
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/.next/**', '**/.turbo/**'],
  },
);
