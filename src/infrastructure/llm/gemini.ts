import type { AnswerPrompt } from '../../domain/prompt';
import type { CompletionOptions, LlmProvider } from '../../ports/llm-provider';
import { postJson, requireText, type FetchFn } from './http';

export const GEMINI_DEFAULT_MODEL = 'gemini-2.5-flash';

export class GeminiProvider implements LlmProvider {
  readonly id = 'gemini';
  constructor(
    private readonly apiKey: string,
    private readonly model = GEMINI_DEFAULT_MODEL,
    private readonly fetchFn: FetchFn = fetch.bind(globalThis),
  ) {}

  async complete(prompt: AnswerPrompt, options: CompletionOptions = {}): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`;
    const res = await postJson<{ candidates?: { content?: { parts?: { text?: string }[] } }[] }>(
      this.fetchFn,
      url,
      // Header instead of ?key= so the API key never appears in URLs.
      { 'x-goog-api-key': this.apiKey },
      {
        systemInstruction: { parts: [{ text: prompt.system }] },
        contents: [{ role: 'user', parts: [{ text: prompt.user }] }],
        ...(options.format === 'json' || options.maxTokens
          ? {
              generationConfig: {
                ...(options.format === 'json' ? { responseMimeType: 'application/json' } : {}),
                ...(options.maxTokens ? { maxOutputTokens: options.maxTokens } : {}),
              },
            }
          : {}),
      },
      options.signal,
    );
    const text = res.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('');
    return requireText(text, 'Gemini');
  }
}
