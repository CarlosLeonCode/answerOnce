import type { AnswerPrompt } from '../../domain/prompt';
import type { CompletionOptions, LlmProvider } from '../../ports/llm-provider';
import { postJson, requireText, type FetchFn } from './http';

export const CLAUDE_DEFAULT_MODEL = 'claude-sonnet-5-5';

export class ClaudeProvider implements LlmProvider {
  readonly id = 'claude';
  constructor(
    private readonly apiKey: string,
    private readonly model = CLAUDE_DEFAULT_MODEL,
    private readonly fetchFn: FetchFn = fetch.bind(globalThis),
  ) {}

  async complete(prompt: AnswerPrompt, options: CompletionOptions = {}): Promise<string> {
    const res = await postJson<{ content?: { type: string; text?: string }[] }>(
      this.fetchFn,
      'https://api.anthropic.com/v1/messages',
      {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      {
        model: this.model,
        max_tokens: options.maxTokens ?? 1024,
        system: prompt.system,
        messages: [{ role: 'user', content: prompt.user }],
      },
      options.signal,
    );
    const text = res.content
      ?.filter((c) => c.type === 'text')
      .map((c) => c.text ?? '')
      .join('');
    return requireText(text, 'Claude');
  }
}
