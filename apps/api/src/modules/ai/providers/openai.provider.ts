/**
 * OpenAI provider implementation (native function calling via the
 * shared OpenAI-compatible base).
 */
// `openai` ships a named class in both its `require` (`index.d.ts`) and
// `import` (`index.d.mts`) declarations. Import it by name: under Vercel's
// CJS-mode resolution the default export is typed as the module namespace
// (TS2351 "not constructable" / TS2709 "cannot use namespace as a type").
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
