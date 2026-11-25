/**
 * Generic OpenAI-compatible provider.
 *
 * Speaks the OpenAI Chat Completions wire format against an arbitrary
 * `baseUrl`, so any service that mirrors OpenAI (RiverAI, vLLM, LiteLLM,
 * Together, Groq, Ollama, …) can be plugged in through admin settings
 * without a code change.
 *
 * Reasoning models (e.g. River's GLM/Qwen/Kimi endpoints) also emit a
 * `reasoning_content` delta. We deliberately ignore it: the UI renders plain
 * chat text, and surfacing chain-of-thought would leak internal reasoning.
 */
import OpenAI from 'openai';
import { OpenAiCompatibleProvider } from './openai-compatible.provider.js';
import type { DiscoveredModel } from '../ai.types.js';

export class CustomProvider extends OpenAiCompatibleProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly _client: OpenAI;

  /**
   * @param baseUrl OpenAI-compatible API root, e.g. `https://api.river.ai/v1`.
   *   The OpenAI SDK appends `/chat/completions` to this.
   */
  constructor(apiKey: string, baseUrl: string) {
    super();
    this.apiKey = apiKey;
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this._client = this.makeClient(this.baseUrl);
  }

  protected get client(): OpenAI {
    return this._client;
  }

  private makeClient(baseUrl: string): OpenAI {
    return new OpenAI({
      apiKey: this.apiKey,
      baseURL: baseUrl,
      // Some niche gateways reject unknown fields or lack certain endpoints,
      // so keep the SDK from retrying against things it assumes exist.
      maxRetries: 1,
    });
  }

  /**
   * Discover models for the saved endpoint, or for a draft one the admin has
   * typed but not yet saved (the UI refreshes the list as they edit).
   */
  override async listModels(options?: { baseUrl?: string }): Promise<DiscoveredModel[]> {
    const target = options?.baseUrl ? normalizeBaseUrl(options.baseUrl) : this.baseUrl;
    if (!target) {
      throw new Error('Enter a Base URL first, e.g. https://api.river.ai/v1');
    }
    const page = await this.makeClient(target).models.list();
    return page.data
      .map((m) => ({ id: m.id }))
      .filter((m) => Boolean(m.id))
      .sort((a, b) => a.id.localeCompare(b.id));
  }
}

/** Trailing slashes produce `//chat/completions` on some gateways. */
function normalizeBaseUrl(raw: string): string {
  const trimmed = (raw ?? '').trim().replace(/\/+$/, '');
  if (!trimmed) {
    throw new Error('Custom provider requires a baseUrl (e.g. https://api.river.ai/v1)');
  }
  return trimmed;
}
