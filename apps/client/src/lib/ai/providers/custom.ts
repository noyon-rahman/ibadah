/**
 * Custom OpenAI-compatible provider — points at any endpoint that speaks
 * the OpenAI Chat Completions wire format (RiverAI, vLLM, LiteLLM, Ollama…).
 *
 * NOTE: like the rest of this `lib/ai/providers/` tree, this is a legacy
 * browser-side mirror. The live chat path streams through the Express API
 * (`apps/api/src/modules/ai/providers/custom.provider.ts`), which is the
 * implementation of record. Kept in sync so the tree still typechecks.
 */
import type { AiConfig } from '../config';
import type { ChatProvider, ProviderChatInput } from '../types';
import { streamOpenAiCompatible, toOpenAiMessages } from './openai-compatible';

export function createCustomProvider(config: AiConfig): ChatProvider {
  return {
    name: 'custom',
    async *streamChat(input: ProviderChatInput): AsyncIterable<string> {
      if (!config.baseUrl) {
        throw new Error('Custom provider requires AI_BASE_URL (e.g. https://api.river.ai/v1)');
      }
      yield* streamOpenAiCompatible({
        url: `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`,
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: {
          model: input.model,
          messages: toOpenAiMessages(input.messages),
          stream: true,
          max_tokens: input.maxTokens,
          temperature: input.temperature,
        },
        signal: input.signal,
      });
    },
  };
}
