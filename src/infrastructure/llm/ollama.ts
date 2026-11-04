import type { AnswerPrompt } from '../../domain/prompt';
import type { CompletionOptions, LlmProvider } from '../../ports/llm-provider';
import { postJson, requireText, type FetchFn } from './http';

export const OLLAMA_DEFAULT_MODEL = 'llama3.2';
export const OLLAMA_DEFAULT_BASE_URL = 'http://localhost:11434';

/** Local Ollama. Requires OLLAMA_ORIGINS=chrome-extension://* on the Ollama server. */
export class OllamaProvider implements LlmProvider {
  readonly id = 'ollama';
  constructor(
    private readonly model = OLLAMA_DEFAULT_MODEL,
    private readonly baseUrl = OLLAMA_DEFAULT_BASE_URL,
    private readonly fetchFn: FetchFn = fetch.bind(globalThis),
  ) {}

  async complete(prompt: AnswerPrompt, options: CompletionOptions = {}): Promise<string> {
    const json = options.format === 'json';
    // JSON extraction needs a bigger context window than Ollama's default (a CV is several thousand tokens).
    const modelOptions = {
      ...(json ? { temperature: 0, num_ctx: 16384 } : {}),
      ...(options.maxTokens ? { num_predict: options.maxTokens } : {}),
    };
    const res = await postJson<{ message?: { content?: string } }>(
      this.fetchFn,
      `${this.baseUrl.replace(/\/+$/, '')}/api/chat`,
      {},
      {
        model: this.model,
        stream: false,
        ...(json ? { format: 'json' } : {}),
        ...(Object.keys(modelOptions).length ? { options: modelOptions } : {}),
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
      },
      options.signal,
    );
    return requireText(res.message?.content, 'Ollama');
  }
}
