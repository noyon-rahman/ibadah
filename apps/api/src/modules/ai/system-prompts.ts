/**
 * System prompts for the chat surfaces (landing, dashboard, admin).
 *
 * Re-exported from `@ibadah/core` so the server, client and admin all
 * speak in the same voice and emit the same `chart` fence format that
 * the apps' `parseChartsFromText` understands.
 */
export { getSystemPrompt } from '@ibadah/core';
