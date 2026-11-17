/**
 * AI Configuration API Client
 * 
 * Admin-only API calls for managing AI providers, settings, and monitoring usage.
 */

import { api, ApiClientError } from '../api';

export interface ProviderConfig {
  name: string;
  displayName: string;
  enabled: boolean;
  apiKey?: string;
  apiKeyLastFour?: string;
  baseUrl?: string;
  defaultModel: string;
  availableModels: string[];
  supportsStreaming: boolean;
  supportsFunctionCalling: boolean;
  maxTokens: number;
  rateLimitTier: 'free' | 'standard' | 'premium';
}

export interface AISettings {
  activeProvider: string;
  defaultModel: string;
  maxTokens: number;
  temperature: number;
  features: {
    enableStreaming: boolean;
    enableFunctionCalling: boolean;
    enablePdfGeneration: boolean;
    enableChatSessions: boolean;
    enableAdminTools: boolean;
  };
}

export interface UsageStats {
  period: {
    start: string;
    end: string;
    days: number;
  };
  totalRequests: number;
  totalTokens: {
    input: number;
    output: number;
    total: number;
  };
  byProvider: Record<string, {
    requests: number;
    tokens: number;
    errors: number;
  }>;
  byEndpoint: {
    client: number;
    admin: number;
  };
  averageLatency: number;
  errorRate: number;
}

export interface TestResult {
  success: boolean;
  message: string;
  data?: {
    latency: number;
    modelAvailable: boolean;
    provider: string;
  };
}

// API Functions — all routed through the shared axios instance via `api`.

export interface DiscoveredModel {
  id: string;
  displayName?: string;
}

export interface ModelListResult {
  models: DiscoveredModel[];
  /** `provider` = live from the endpoint, `configured` = saved fallback list. */
  source: 'provider' | 'configured';
  defaultModel: string | null;
}

/**
 * Get all configured AI providers with full settings (model, tokens, tier,
 * masked key, etc.). Uses the detailed `/provider` endpoint — the plural
 * `/providers` endpoint only returns a trimmed shape and leaves the form blank.
 */
export async function getProviders(): Promise<ProviderConfig[]> {
  return api<ProviderConfig[]>('/ai/config/provider');
}

/**
 * Reveal a provider's full stored API key (admin only).
 */
export async function getProviderKey(provider: string): Promise<string> {
  const data = await api<{ apiKey?: string }>(`/ai/config/provider/${provider}/key`);
  return data?.apiKey ?? '';
}

/**
 * Discover the models a provider serves, for the model picker.
 *
 * Pass the current (possibly unsaved) key / base URL so the list reflects the
 * admin's draft edits. Both are optional: the server falls back to the stored
 * credentials when they're omitted.
 */
export async function getProviderModels(
  provider: string,
  options: { apiKey?: string; baseUrl?: string } = {}
): Promise<ModelListResult> {
  const params = new URLSearchParams();
  if (options.apiKey && options.apiKey !== 'using-stored-key') {
    params.set('apiKey', options.apiKey);
  }
  if (options.baseUrl) params.set('baseUrl', options.baseUrl);
  const qs = params.toString();
  return api<ModelListResult>(
    `/ai/config/provider/${provider}/models${qs ? `?${qs}` : ''}`
  );
}

/**
 * Get current AI settings.
 *
 * The API has historically returned the active provider as `provider` while
 * PATCH returns `activeProvider`. Normalise both into `activeProvider` so the
 * form always binds to one field and can never silently fall back to a
 * hardcoded default on reload.
 */
export async function getAISettings(): Promise<AISettings> {
  const data = await api<AISettings & { provider?: string; model?: string }>('/ai/config');
  return {
    ...data,
    activeProvider: data.activeProvider ?? data.provider ?? '',
    defaultModel: data.defaultModel ?? data.model ?? '',
  };
}

/**
 * Update provider configuration
 */
export async function updateProvider(
  provider: string,
  config: Partial<ProviderConfig>
): Promise<ProviderConfig> {
  return api<ProviderConfig>('/ai/config/provider', {
    method: 'PATCH',
    body: { name: provider, ...config },
  });
}

/**
 * Test provider connection. Unlike the other calls this never throws — a
 * failed test is a normal, displayable outcome — so it maps both success
 * and error into the `TestResult` shape.
 *
 * Omit `apiKey` to test with the key already stored for the provider.
 */
export async function testProvider(
  provider: string,
  apiKey?: string,
  model?: string,
  baseUrl?: string
): Promise<TestResult> {
  try {
    const raw = await api.raw<TestResult['data']>('/ai/config/test', {
      method: 'POST',
      body: { provider, apiKey, model, baseUrl },
    });
    return { success: true, message: raw.message, data: raw.data };
  } catch (err) {
    return {
      success: false,
      message: err instanceof ApiClientError ? err.message : 'Test failed',
    };
  }
}

/**
 * Update general AI settings
 */
export async function updateAISettings(settings: Partial<AISettings>): Promise<AISettings> {
  return api<AISettings>('/ai/config', { method: 'PATCH', body: settings });
}

/**
 * Get usage statistics
 */
export async function getUsageStats(days: number = 30): Promise<UsageStats> {
  return api<UsageStats>(`/ai/config/usage?days=${days}`);
}
