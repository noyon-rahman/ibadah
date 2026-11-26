/**
 * OpenAI provider implementation (native function calling via the
 * shared OpenAI-compatible base).
 */
import { OpenAI } from 'openai';
import { OpenAiCompatibleProvider } from './openai-compatible.provider.js';

export class OpenAiProvider extends OpenAiCompatibleProvider {
  private readonly _client: OpenAI;

  constructor(apiKey: string) {
    super();
    this._client = new OpenAI({ apiKey });
  }

  protected get client(): OpenAI {
    return this._client;
  }
}
