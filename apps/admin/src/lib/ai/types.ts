/**
 * AI chat wire types — re-exported from `@ibadah/core`.
 *
 * The canonical definitions live in `packages/core/src/ai/types.ts` so the
 * client, admin and server all speak the same wire format.
 */
export type {
  ChatRole,
  ToolActivity,
  ChatMessage,
  ChartSpec,
  StreamEvent,
  ChatRequestBody,
  ChatProvider,
  ProviderName,
  ProviderChatInput,
  SystemSurface,
} from '@ibadah/core';
