import type { AnswerPrompt } from '../domain/prompt';

export interface CompletionOptions {
  signal?: AbortSignal;
  /** 'json' asks the provider for a single JSON object (native JSON mode where available). */
  format?: 'text' | 'json';
  /** Upper bound for the response length. Providers use their own default when omitted. */
  maxTokens?: number;
}

export interface LlmProvider {
  readonly id: string;
  complete(prompt: AnswerPrompt, options?: CompletionOptions): Promise<string>;
}

export class LlmError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}
