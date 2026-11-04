import type { AiSettings, LlmProviderId } from '../../domain/profile';
import type { LlmProvider } from '../../ports/llm-provider';
import { CLAUDE_DEFAULT_MODEL, ClaudeProvider } from './claude';
import { GEMINI_DEFAULT_MODEL, GeminiProvider } from './gemini';
import { OLLAMA_DEFAULT_BASE_URL, OLLAMA_DEFAULT_MODEL, OllamaProvider } from './ollama';
import { OPENAI_DEFAULT_MODEL, OpenAiProvider } from './openai';

export const DEFAULT_MODELS: Record<Exclude<LlmProviderId, 'none'>, string> = {
  ollama: OLLAMA_DEFAULT_MODEL,
  openai: OPENAI_DEFAULT_MODEL,
  gemini: GEMINI_DEFAULT_MODEL,
  claude: CLAUDE_DEFAULT_MODEL,
};

/**
 * Host permissions per provider. These must also be listed under
 * optional_host_permissions in the manifest (see wxt.config.ts) and are
 * requested at runtime when the user picks the provider.
 */
export const PROVIDER_ORIGINS: Record<Exclude<LlmProviderId, 'none'>, string[]> = {
  ollama: ['http://localhost:11434/*', 'http://127.0.0.1:11434/*'],
  openai: ['https://api.openai.com/*'],
  gemini: ['https://generativelanguage.googleapis.com/*'],
  claude: ['https://api.anthropic.com/*'],
};

export const ALL_PROVIDER_ORIGINS = Object.values(PROVIDER_ORIGINS).flat();

export function createLlmProvider(settings: AiSettings): LlmProvider | null {
  const model = settings.model.trim();
  switch (settings.provider) {
    case 'none':
      return null;
    case 'ollama':
      return new OllamaProvider(model || OLLAMA_DEFAULT_MODEL, settings.ollamaBaseUrl.trim() || OLLAMA_DEFAULT_BASE_URL);
    case 'openai':
      return new OpenAiProvider(settings.apiKey, model || OPENAI_DEFAULT_MODEL);
    case 'gemini':
      return new GeminiProvider(settings.apiKey, model || GEMINI_DEFAULT_MODEL);
    case 'claude':
      return new ClaudeProvider(settings.apiKey, model || CLAUDE_DEFAULT_MODEL);
  }
}
