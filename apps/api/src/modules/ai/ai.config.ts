/**
 * AI configuration management.
 *
 * All AI settings (provider, model, API keys, endpoints) live in the
 * `ai_config` collection and are managed from the admin UI at /ai-settings.
 * API keys are never read from the environment.
 */

import type { AiConfig } from './ai.types.js';
import { aiConfigService } from './ai-config.service.js';

/**
 * Reasoning models (River's GLM, Kimi, Qwen, …) spend output tokens on hidden
 * chain-of-thought before they emit any visible text, so a tight budget makes
 * them answer with nothing at all. This raises the *visible* budget rather
 * than changing the configured value.
 */
const RAW_REASONING_FLOOR = 1024;
const REASONING_HEADROOM = 2048;

export class AiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiConfigError';
  }
}

/**
 * Resolve the active provider's credentials from the database.
 *
 * This is the only source of AI configuration — there is no environment
 * fallback, so a missing key must surface as an actionable admin message
 * rather than silently using a stray env var.
 */
export async function getAiConfig(): Promise<AiConfig> {
  const dbConfig = await aiConfigService.getConfig();
  const activeProvider = dbConfig.activeProvider;
  const providerConfig = await aiConfigService.getProviderWithKey(activeProvider);

  if (!providerConfig || !providerConfig.apiKey) {
    throw new AiConfigError(
      `No API key configured for provider "${activeProvider}". Add one in the admin AI settings.`,
    );
  }

  // The custom provider is unusable without an endpoint; fail with a clear
  // message rather than letting the SDK fall back to api.openai.com.
  if (activeProvider === 'custom' && !providerConfig.baseUrl) {
    throw new AiConfigError(
      'The "custom" OpenAI-compatible provider has no Base URL configured. Set it in the admin AI settings (e.g. https://api.river.ai/v1).',
    );
  }

  return {
    provider: activeProvider,
    // Each provider keeps its own model, so switching never sends the wrong
    // model id to the wrong endpoint.
    model: providerConfig.defaultModel || dbConfig.defaultModel,
    apiKey: providerConfig.apiKey,
    maxTokens: activeProvider === 'custom'
      ? Math.max(dbConfig.maxTokens, RAW_REASONING_FLOOR) + REASONING_HEADROOM
      : dbConfig.maxTokens,
    temperature: dbConfig.temperature,
    siteUrl: dbConfig.siteUrl,
    siteName: dbConfig.siteName,
    baseUrl: providerConfig.baseUrl,
  };
}

// Re-export the service for direct access
export { aiConfigService };
