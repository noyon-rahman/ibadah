/**
 * AI Configuration Validation Schemas
 * 
 * Zod validation schemas for AI configuration endpoints.
 */

import { z } from 'zod';

const providerNameEnum = z.enum([
  'openrouter',
  'openai',
  'anthropic',
  'gemini',
  'custom',
] as const);

export const updateProviderConfigSchema = z.object({
  name: providerNameEnum.optional(),
  enabled: z.boolean().optional(),
  apiKey: z.string().min(10).max(500).optional(),
  baseUrl: z.string().url().max(300).optional().nullable(),
  defaultModel: z.string().min(1).max(200).optional(),
  availableModels: z.array(z.string().min(1).max(200)).max(500).optional(),
  maxTokens: z.number().int().min(100).max(8000).optional(),
  rateLimitTier: z.enum(['free', 'standard', 'premium']).optional(),
});

export const testProviderSchema = z.object({
  provider: providerNameEnum,
  // Omit to test with the key already stored for this provider. The admin UI
  // never re-sends a stored key, so requiring one here broke every test after
  // a page reload.
  apiKey: z.string().min(10).max(500).optional(),
  model: z.string().min(1).max(200).optional(),
  baseUrl: z.string().url().max(300).optional(),
});

export const setRateLimitSchema = z.object({
  provider: providerNameEnum,
  requestsPerMinute: z.number().int().min(1).max(1000).optional(),
  requestsPerHour: z.number().int().min(1).max(10000).optional(),
  requestsPerDay: z.number().int().min(1).max(100000).optional(),
  tokensPerMinute: z.number().int().min(1000).max(1000000).optional(),
  tokensPerDay: z.number().int().min(10000).max(10000000).optional(),
  concurrentRequests: z.number().int().min(1).max(100).optional(),
  retryAfterSeconds: z.number().int().min(1).max(3600).optional(),
});

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  provider: providerNameEnum,
  key: z.string().min(10).max(500),
  environment: z.enum(['development', 'staging', 'production']).default('development'),
});

export const updateAIConfigSchema = z.object({
  activeProvider: providerNameEnum.optional(),
  defaultModel: z.string().min(1).max(200).optional(),
  maxTokens: z.number().int().min(100).max(8000).optional(),
  temperature: z.number().min(0).max(2).optional(),
  features: z.object({
    enableStreaming: z.boolean().optional(),
    enableFunctionCalling: z.boolean().optional(),
    enablePdfGeneration: z.boolean().optional(),
    enableChatSessions: z.boolean().optional(),
    enableAdminTools: z.boolean().optional(),
  }).optional(),
});

// Types
export type UpdateProviderConfigInput = z.infer<typeof updateProviderConfigSchema>;
export type TestProviderInput = z.infer<typeof testProviderSchema>;
export type SetRateLimitInput = z.infer<typeof setRateLimitSchema>;
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
export type UpdateAIConfigInput = z.infer<typeof updateAIConfigSchema>;
