/**
 * AI Configuration Service
 * 
 * Manages AI provider settings, rate limiting, and usage tracking.
 * All configuration is persisted to the database and cached for performance.
 */

import type { DiscoveredModel, ProviderName } from './ai.types.js';
import { AIConfig, type IAIConfig, type IAIConfigDocument, type IProviderConfig } from './ai-config.model.js';

// Configuration Types

export type ProviderConfig = IProviderConfig;

export interface RateLimitConfig {
  provider: ProviderName;
  requestsPerMinute: number;
  requestsPerHour: number;
  requestsPerDay: number;
  tokensPerMinute: number;
  tokensPerDay: number;
  concurrentRequests: number;
  retryAfterSeconds: number;
}

export interface UsageStats {
  period: {
    start: Date;
    end: Date;
    days: number;
  };
  totalRequests: number;
  totalTokens: {
    input: number;
    output: number;
    total: number;
  };
  byProvider: Record<ProviderName, {
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

/**
 * Placeholder the admin UI sends when the admin did not type a key, meaning
 * "use the key already stored for this provider". Treat it as absent.
 */
export const STORED_KEY_SENTINEL = 'using-stored-key';

export interface AIConfigSettings {
  activeProvider: ProviderName;
  fallbackProvider?: ProviderName;
  defaultModel: string;
  maxTokens: number;
  temperature: number;
  siteName: string;
  siteUrl: string;
  features: {
    enableStreaming: boolean;
    enableFunctionCalling: boolean;
    enablePdfGeneration: boolean;
    enableChatSessions: boolean;
    enableAdminTools: boolean;
  };
}

// In-memory cache for configuration
const configCache = new Map<string, unknown>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

class AIConfigService {
  private async getCached<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    const cached = configCache.get(key) as { value: T; timestamp: number } | undefined;
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.value;
    }

    const value = await fetcher();
    configCache.set(key, { value, timestamp: Date.now() });
    return value;
  }

  private clearCache(): void {
    configCache.clear();
  }

  /**
   * Get or create the singleton AI configuration
   */
  private async getConfigDoc(): Promise<IAIConfigDocument> {
    return AIConfig.getSingleton();
  }

  /**
   * Get current AI configuration (non-sensitive)
   */
  async getConfig(): Promise<AIConfigSettings> {
    return this.getCached('ai-config', async () => {
      const config = await this.getConfigDoc();
      
      return {
        activeProvider: config.activeProvider,
        fallbackProvider: config.fallbackProvider,
        defaultModel: config.defaultModel,
        maxTokens: config.maxTokens,
        temperature: config.temperature,
        siteName: config.siteName,
        siteUrl: config.siteUrl,
        features: config.features,
      };
    });
  }

  /**
   * Get detailed provider configuration (admin only)
   * Returns provider configs without sensitive API keys
   */
  async getProviderConfig(): Promise<ProviderConfig[]> {
    return this.getCached('provider-config', async () => {
      const config = await this.getConfigDoc();
      
      return config.providers.map(p => ({
        name: p.name,
        displayName: p.displayName,
        enabled: p.enabled,
        apiKeyLastFour: p.apiKeyLastFour,
        baseUrl: p.baseUrl,
        defaultModel: p.defaultModel,
        availableModels: p.availableModels,
        supportsStreaming: p.supportsStreaming,
        supportsFunctionCalling: p.supportsFunctionCalling,
        maxTokens: p.maxTokens,
        rateLimitTier: p.rateLimitTier,
      }));
    });
  }

  /**
   * Get full provider config with decrypted API key
   * For internal use only - never expose to clients
   */
  async getProviderWithKey(providerName: ProviderName): Promise<ProviderConfig | null> {
    const config = await this.getConfigDoc();
    const provider = config.providers.find(p => p.name === providerName);
    if (!provider) return null;

    // Mongoose subdocuments don't spread into plain data (a spread yields only
    // internal `_doc`/`__parentArray` fields), so copy the fields explicitly —
    // otherwise the API key and base URL silently come back undefined.
    return {
      name: provider.name,
      displayName: provider.displayName,
      enabled: provider.enabled,
      apiKey: provider.apiKey, // Would be decrypted in production
      apiKeyLastFour: provider.apiKeyLastFour,
      baseUrl: provider.baseUrl,
      defaultModel: provider.defaultModel,
      availableModels: provider.availableModels,
      supportsStreaming: provider.supportsStreaming,
      supportsFunctionCalling: provider.supportsFunctionCalling,
      maxTokens: provider.maxTokens,
      rateLimitTier: provider.rateLimitTier,
    };
  }

  /**
   * Update provider configuration
   */
  async updateProviderConfig(
    providerName: ProviderName,
    updates: Partial<ProviderConfig>
  ): Promise<ProviderConfig> {
    const config = await this.getConfigDoc();
    
    const providerIndex = config.providers.findIndex(p => p.name === providerName);
    if (providerIndex === -1) {
      throw new Error(`Provider ${providerName} not found`);
    }

    // Update the provider
    const currentProvider = config.providers[providerIndex];
    
    // Handle API key update
    if (updates.apiKey && updates.apiKey.length > 0) {
      // In production, encrypt the key here
      currentProvider.apiKey = updates.apiKey;
      currentProvider.apiKeyLastFour = updates.apiKey.slice(-4);
    }

    // Update other fields
    if (updates.enabled !== undefined) currentProvider.enabled = updates.enabled;
    if (updates.defaultModel) currentProvider.defaultModel = updates.defaultModel;
    if (updates.availableModels) currentProvider.availableModels = updates.availableModels;
    if (updates.maxTokens) currentProvider.maxTokens = updates.maxTokens;
    if (updates.rateLimitTier) currentProvider.rateLimitTier = updates.rateLimitTier;
    // `null` clears a previously configured endpoint; undefined leaves it alone.
    if (updates.baseUrl === null) currentProvider.baseUrl = undefined;
    else if (updates.baseUrl) currentProvider.baseUrl = updates.baseUrl.replace(/\/+$/, '');

    // Keep the global `defaultModel` in step with the active provider's model.
    // Otherwise the top-level display value drifts from what is actually sent,
    // and any consumer reading it sees a stale model id.
    if (config.activeProvider === providerName && currentProvider.defaultModel) {
      config.defaultModel = currentProvider.defaultModel;
    }

    // Save the config
    config.updatedAt = new Date();
    await config.save();

    // Clear cache
    this.clearCache();

    return {
      name: currentProvider.name,
      displayName: currentProvider.displayName,
      enabled: currentProvider.enabled,
      apiKeyLastFour: currentProvider.apiKeyLastFour,
      baseUrl: currentProvider.baseUrl,
      defaultModel: currentProvider.defaultModel,
      availableModels: currentProvider.availableModels,
      supportsStreaming: currentProvider.supportsStreaming,
      supportsFunctionCalling: currentProvider.supportsFunctionCalling,
      maxTokens: currentProvider.maxTokens,
      rateLimitTier: currentProvider.rateLimitTier,
    };
  }

  /**
   * Update general AI settings
   */
  async updateAISettings(updates: Partial<AIConfigSettings>, updatedBy?: string): Promise<AIConfigSettings> {
    const config = await this.getConfigDoc();

    // Update allowed fields
    if (updates.activeProvider) config.activeProvider = updates.activeProvider;
    if (updates.fallbackProvider) config.fallbackProvider = updates.fallbackProvider;
    if (updates.defaultModel) config.defaultModel = updates.defaultModel;
    if (updates.maxTokens !== undefined) config.maxTokens = updates.maxTokens;
    if (updates.temperature !== undefined) config.temperature = updates.temperature;
    if (updates.siteName) config.siteName = updates.siteName;
    if (updates.siteUrl) config.siteUrl = updates.siteUrl;
    
    // Update features
    if (updates.features) {
      config.features = {
        ...config.features,
        ...updates.features,
      };
    }

    config.updatedAt = new Date();
    config.updatedBy = updatedBy;

    await config.save();

    // Clear cache
    this.clearCache();

    return this.getConfig();
  }

  /**
   * Test a provider connection.
   *
   * `apiKey` is optional: when omitted (or blank), the key stored for that
   * provider is used, which is what the admin UI relies on after a reload.
   */
  async testProvider(
    providerName: ProviderName,
    apiKey?: string,
    model?: string,
    baseUrl?: string
  ): Promise<{ success: boolean; message: string; latency: number; modelAvailable: boolean }> {
    const startTime = Date.now();

    try {
      // Import the provider dynamically
      const { createProvider } = await import('./providers/index.js');

      const stored = await this.getProviderWithKey(providerName);

      // Resolve the credential to test with. A blank/placeholder key means
      // "use the one already saved" — the admin UI never re-sends a stored key,
      // so without this fallback every test after a page reload failed with a
      // confusing upstream 401.
      const isPlaceholder =
        !apiKey || apiKey.trim() === '' || apiKey === STORED_KEY_SENTINEL;
      const resolvedApiKey = isPlaceholder ? stored?.apiKey : apiKey;

      if (!resolvedApiKey) {
        return {
          success: false,
          message: `No API key available to test "${providerName}". Enter a key or save one first.`,
          latency: Date.now() - startTime,
          modelAvailable: false,
        };
      }

      // Fall back to the stored endpoint when the caller didn't send one, so
      // "Test Connection" works for a custom provider already saved in config.
      let resolvedBaseUrl = baseUrl;
      if (!resolvedBaseUrl && providerName === 'custom') {
        resolvedBaseUrl = stored?.baseUrl ?? undefined;
      }

      const resolvedModel = model || this.defaultModelFor(providerName);

      const provider = createProvider({
        provider: providerName,
        apiKey: resolvedApiKey,
        model: resolvedModel,
        maxTokens: 5,
        temperature: 0,
        baseUrl: resolvedBaseUrl,
      });

      // Test with a simple request
      const testMessages = [{ role: 'user' as const, content: 'Reply with the single word OK.' }];

      const stream = provider.streamChat({
        messages: testMessages,
        model: resolvedModel,
        maxTokens: providerName === 'custom' ? 64 : 5,
        temperature: 0,
      });

      // Consume the stream
      let responseReceived = false;
      for await (const chunk of stream) {
        if (chunk && chunk.length > 0) {
          responseReceived = true;
          break;
        }
      }

      const latency = Date.now() - startTime;

      return {
        success: true,
        message: 'Provider connection successful',
        latency,
        modelAvailable: responseReceived,
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      return {
        success: false,
        message: (error as Error).message,
        latency,
        modelAvailable: false,
      };
    }
  }

  /** Sensible test model when the caller didn't specify one. */
  private defaultModelFor(providerName: ProviderName): string {
    switch (providerName) {
      case 'openrouter':
        return 'openai/gpt-4o-mini';
      case 'anthropic':
        return 'claude-3-5-haiku-latest';
      case 'gemini':
        return 'gemini-1.5-flash';
      case 'custom':
        return 'zai-org/GLM-5.3-Flash';
      default:
        return 'gpt-4o-mini';
    }
  }

  /**
   * Get usage statistics
   */
  async getUsageStats(days: number = 30): Promise<UsageStats> {
    // This would aggregate data from a usage tracking collection
    // For now, return mock data
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return {
      period: {
        start: startDate,
        end: endDate,
        days,
      },
      totalRequests: 1250,
      totalTokens: {
        input: 45000,
        output: 89000,
        total: 134000,
      },
      byProvider: {
        openrouter: { requests: 875, tokens: 95000, errors: 12 },
        openai: { requests: 0, tokens: 0, errors: 0 },
        anthropic: { requests: 0, tokens: 0, errors: 0 },
        gemini: { requests: 375, tokens: 39000, errors: 5 },
        custom: { requests: 0, tokens: 0, errors: 0 },
      },
      byEndpoint: {
        client: 980,
        admin: 270,
      },
      averageLatency: 850,
      errorRate: 0.0136,
    };
  }

  /**
   * Discover the model ids a provider actually serves.
   *
   * Mirrors `testProvider`'s credential handling: the caller may supply a
   * draft key / base URL (unsaved admin edits), otherwise the stored ones are
   * used. Keys never leave the server — the UI only ever receives model ids.
   */
  async listProviderModels(
    providerName: ProviderName,
    options: { apiKey?: string; baseUrl?: string } = {}
  ): Promise<{ models: DiscoveredModel[]; source: 'provider' | 'configured' }> {
    const stored = await this.getProviderWithKey(providerName);

    // `using-stored-key` is the admin UI's sentinel for "I didn't retype it".
    const draftKey = options.apiKey?.trim();
    const apiKey =
      draftKey && draftKey !== 'using-stored-key' ? draftKey : stored?.apiKey;
    const baseUrl = options.baseUrl?.trim() || stored?.baseUrl;

    // Only the custom provider can be discovered without a saved key, because
    // the admin types the key in the same form.
    if (apiKey) {
      const { createProvider } = await import('./providers/index.js');
      const provider = createProvider({
        provider: providerName,
        apiKey,
        model: stored?.defaultModel ?? '',
        maxTokens: 1,
        temperature: 0,
        baseUrl,
      });

      if (provider.listModels) {
        try {
          const models = await provider.listModels({ baseUrl, apiKey });
          if (models.length > 0) return { models, source: 'provider' };
        } catch {
          // Fall through to the configured list rather than failing the UI —
          // a key can be valid for chat but blocked from /models.
        }
      }
    }

    // Fallback: whatever the admin configured by hand.
    const configured = (stored?.availableModels ?? []).map((id) => ({ id }));
    return { models: configured, source: 'configured' };
  }

  /**
   * Make a provider the active one.
   *
   * Each provider keeps its own key, endpoint and model, so this only flips
   * `activeProvider` and mirrors that provider's model into the global
   * `defaultModel` for display. Other providers are left untouched — their
   * stored credentials stay saved and can be re-activated later.
   */
  async activateProvider(providerName: ProviderName, updatedBy?: string): Promise<AIConfigSettings> {
    const config = await this.getConfigDoc();
    const provider = config.providers.find(p => p.name === providerName);

    if (!provider) {
      throw new Error(`Provider ${providerName} not found`);
    }
    if (!provider.apiKey) {
      throw new Error(
        `Provider "${providerName}" has no API key configured. Save a key for it before activating it.`,
      );
    }
    if (providerName === 'custom' && !provider.baseUrl) {
      throw new Error(
        'The "custom" provider needs a Base URL before it can be activated (e.g. https://api.river.ai/v1).',
      );
    }

    config.activeProvider = providerName;
    if (provider.defaultModel) config.defaultModel = provider.defaultModel;
    config.updatedAt = new Date();
    config.updatedBy = updatedBy;

    await config.save();
    this.clearCache();

    return this.getConfig();
  }

  /**
   * Get current rate limit configuration
   */
  async getRateLimits(): Promise<IAIConfig['rateLimits']> {
    const config = await this.getConfigDoc();
    return config.rateLimits;
  }

  /**
   * Update rate limit configuration
   */
  async setRateLimit(updates: Partial<IAIConfig['rateLimits']>): Promise<IAIConfig['rateLimits']> {
    const config = await this.getConfigDoc();

    if (updates.requestsPerMinute !== undefined) config.rateLimits.requestsPerMinute = updates.requestsPerMinute;
    if (updates.requestsPerHour !== undefined) config.rateLimits.requestsPerHour = updates.requestsPerHour;
    if (updates.requestsPerDay !== undefined) config.rateLimits.requestsPerDay = updates.requestsPerDay;
    if (updates.tokensPerMinute !== undefined) config.rateLimits.tokensPerMinute = updates.tokensPerMinute;
    if (updates.tokensPerDay !== undefined) config.rateLimits.tokensPerDay = updates.tokensPerDay;
    if (updates.concurrentRequests !== undefined) config.rateLimits.concurrentRequests = updates.concurrentRequests;

    config.updatedAt = new Date();
    await config.save();
    this.clearCache();

    return config.rateLimits;
  }

  /**
   * Get available providers and their models
   */
  async getAvailableProviders(): Promise<Array<{
    name: ProviderName;
    displayName: string;
    enabled: boolean;
    models: string[];
    features: {
      streaming: boolean;
      functionCalling: boolean;
    };
  }>> {
    const config = await this.getConfigDoc();
    
    return config.providers.map(p => ({
      name: p.name,
      displayName: p.displayName,
      enabled: p.enabled,
      models: p.availableModels,
      features: {
        streaming: p.supportsStreaming,
        functionCalling: p.supportsFunctionCalling,
      },
    }));
  }
}

// Export singleton instance
export const aiConfigService = new AIConfigService();
