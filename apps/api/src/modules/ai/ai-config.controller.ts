/**
 * AI Configuration Controller
 * 
 * Manages AI provider settings and application-level configuration.
 * All endpoints require admin privileges.
 */

import type { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import { aiConfigService, type AIConfigSettings } from './ai-config.service.js';
import type { ProviderName } from './ai.types.js';
import { 
  updateProviderConfigSchema, 
  testProviderSchema,
  setRateLimitSchema,
  updateAIConfigSchema,
} from './ai-config.validation.js';

export class AiConfigController {
  /**
   * Get current AI configuration
   * GET /api/v1/ai/config
   */
  getConfig = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Get current config (non-sensitive)
      const config = await aiConfigService.getConfig();
      
      res.status(StatusCodes.OK).json({
        success: true,
        data: {
          // Must match the PATCH response shape (`activeProvider`) — the admin
          // UI binds to this field, and a mismatched name made a reload always
          // fall back to the default provider. `provider` is kept for older
          // callers that read the short name.
          activeProvider: config.activeProvider,
          provider: config.activeProvider,
          defaultModel: config.defaultModel,
          model: config.defaultModel,
          maxTokens: config.maxTokens,
          temperature: config.temperature,
          siteName: config.siteName,
          siteUrl: config.siteUrl,
          features: config.features,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Update system-wide AI settings
   * PATCH /api/v1/ai/config
   *
   * Backs the admin "Settings" tab (active provider, default model, token
   * budget, temperature, feature flags).
   */
  updateConfig = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = updateAIConfigSchema.parse(req.body);

      // Switching providers goes through `activateProvider`, which validates
      // the target (key + endpoint) and mirrors that provider's own model.
      // Everything else is a plain settings patch.
      const { activeProvider, ...rest } = parsed;
      let settings;

      if (activeProvider) {
        settings = await aiConfigService.activateProvider(activeProvider, req.user?.id);

        // Apply any other fields sent in the same request (e.g. temperature).
        if (Object.keys(rest).length > 0) {
          settings = await aiConfigService.updateAISettings(
            {
              ...rest,
              features: rest.features as AIConfigSettings['features'] | undefined,
            },
            req.user?.id,
          );
        }
      } else {
        settings = await aiConfigService.updateAISettings(
          {
            ...rest,
            // Zod yields partial feature flags; the service merges them, so drop
            // the optionality here rather than widening the service signature.
            features: rest.features as AIConfigSettings['features'] | undefined,
          },
          req.user?.id,
        );
      }

      res.status(StatusCodes.OK).json({
        success: true,
        message: 'AI settings updated successfully',
        data: settings,
      });
    } catch (error) {
      // Activation failures are user-actionable (missing key/Base URL), so
      // surface them as 400s rather than opaque 500s.
      const message = (error as Error).message ?? '';
      if (/no API key|needs a Base URL|not found/i.test(message)) {
        res.status(StatusCodes.BAD_REQUEST).json({ success: false, message });
        return;
      }
      next(error);
    }
  };

  /**
   * Get detailed provider configuration (admin only)
   * GET /api/v1/ai/config/provider
   */
  getProviderConfig = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const config = await aiConfigService.getProviderConfig();
      
      res.status(StatusCodes.OK).json({
        success: true,
        data: config,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Reveal a provider's stored API key (admin only)
   * GET /api/v1/ai/config/provider/:name/key
   *
   * Returns the full decrypted key so operators can copy/verify it. Guarded by
   * the admin-only router; the value is never exposed to non-admin endpoints.
   */
  revealProviderKey = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const name = req.params.name as ProviderName;
      const provider = await aiConfigService.getProviderWithKey(name);

      if (!provider) {
        res.status(StatusCodes.NOT_FOUND).json({
          success: false,
          message: `Provider ${name} not found`,
        });
        return;
      }

      res.status(StatusCodes.OK).json({
        success: true,
        data: { apiKey: provider.apiKey ?? '' },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Discover the model ids a provider serves, for the admin model picker.
   * GET /api/v1/ai/config/provider/:name/models
   *
   * Optional `apiKey` / `baseUrl` query params let the picker work against
   * unsaved form edits. Credentials are resolved server-side only.
   */
  listProviderModels = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const name = req.params.name as ProviderName;
      const apiKey = typeof req.query.apiKey === 'string' ? req.query.apiKey : undefined;
      const baseUrl = typeof req.query.baseUrl === 'string' ? req.query.baseUrl : undefined;

      const result = await aiConfigService.listProviderModels(name, { apiKey, baseUrl });
      const stored = await aiConfigService.getProviderWithKey(name);

      res.status(StatusCodes.OK).json({
        success: true,
        data: {
          models: result.models,
          source: result.source,
          defaultModel: stored?.defaultModel ?? null,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Update provider configuration
   * PATCH /api/v1/ai/config/provider
   */
  updateProviderConfig = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { name, ...rawUpdates } = updateProviderConfigSchema.parse(req.body);

      if (!name) {
        res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: 'Provider name is required',
        });
        return;
      }

      // `baseUrl: null` is the documented way to clear an endpoint, but the
      // service types it as optional-string. Drop it from the update instead.
      const { baseUrl: incomingBaseUrl, ...restUpdates } = rawUpdates;
      const updates = incomingBaseUrl === null ? restUpdates : rawUpdates;

      const updated = await aiConfigService.updateProviderConfig(name, updates);
      
      res.status(StatusCodes.OK).json({
        success: true,
        message: 'Provider configuration updated successfully',
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Test a provider connection
   * POST /api/v1/ai/config/test
   */
  testProvider = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const parsed = testProviderSchema.parse(req.body);
      
      const testResult = await aiConfigService.testProvider(
        parsed.provider,
        parsed.apiKey,
        parsed.model,
        parsed.baseUrl,
      );
      
      res.status(StatusCodes.OK).json({
        success: testResult.success,
        message: testResult.message,
        data: {
          latency: testResult.latency,
          modelAvailable: testResult.modelAvailable,
          provider: parsed.provider,
        },
      });
    } catch (error) {
      res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: (error as Error).message,
      });
    }
  };

  /**
   * Get available AI providers and models
   * GET /api/v1/ai/config/providers
   */
  getAvailableProviders = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const providers = await aiConfigService.getAvailableProviders();
      
      res.status(StatusCodes.OK).json({
        success: true,
        data: providers,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Set rate limiting for AI API usage
   * POST /api/v1/ai/config/rate-limit
   */
  setRateLimit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = setRateLimitSchema.parse(req.body);
      
      const updated = await aiConfigService.setRateLimit(parsed);
      
      res.status(StatusCodes.OK).json({
        success: true,
        message: 'Rate limits updated successfully',
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get current rate limits
   * GET /api/v1/ai/config/rate-limit
   */
  getRateLimits = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const limits = await aiConfigService.getRateLimits();
      
      res.status(StatusCodes.OK).json({
        success: true,
        data: limits,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get AI usage statistics
   * GET /api/v1/ai/config/usage
   */
  getUsageStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const days = Math.min(parseInt(req.query.days as string) || 30, 90);
      
      const stats = await aiConfigService.getUsageStats(days);
      
      res.status(StatusCodes.OK).json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  };
}

export const aiConfigController = new AiConfigController();
