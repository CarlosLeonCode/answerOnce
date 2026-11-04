import type { AnswerPrompt } from '../../domain/prompt';
import type { CompletionOptions, LlmProvider } from '../../ports/llm-provider';
import { postJson, requireText, type FetchFn } from './http';

export const OPENAI_DEFAULT_MODEL = 'gpt-5-mini';

export class OpenAiProvider implements LlmProvider {
  readonly id = 'openai';
  constructor(
    private readonly apiKey: string,
    private readonly model = OPENAI_DEFAULT_MODEL,
    private readonly fetchFn: FetchFn = fetch.bind(globalThis),
  ) {}

  async complete(prompt: AnswerPrompt, options: CompletionOptions = {}): Promise<string> {
    const res = await postJson<{ choices?: { message?: { content?: string } }[] }>(
      this.fetchFn,
      'https://api.openai.com/v1/chat/completions',
      { authorization: `Bearer ${this.apiKey}` },
      {
        model: this.model,
        ...(options.format === 'json' ? { response_format: { type: 'json_object' } } : {}),
        ...(options.maxTokens ? { max_completion_tokens: options.maxTokens } : {}),
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
      },
      options.signal,
    );
    return requireText(res.choices?.[0]?.message?.content, 'OpenAI');
  }
}
