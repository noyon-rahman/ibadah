/**
 * System prompts — re-exported from `@ibadah/core`.
 *
 * The canonical prompts live in `packages/core/src/ai/system-prompt.ts` so
 * the client, admin and server stay in the same voice and emit the same
 * `chart` fence format. The admin surface always resolves to the admin
 * persona inside `getSystemPrompt`.
 */
export { getSystemPrompt } from '@ibadah/core';
export type { SystemSurface } from '@ibadah/core';
