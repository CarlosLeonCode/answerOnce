import { browser } from 'wxt/browser';
import type { AiSettings } from '../../domain/profile';
import { OLLAMA_DEFAULT_BASE_URL } from '../../infrastructure/llm/ollama';
import { PROVIDER_ORIGINS } from '../../infrastructure/llm';

/** Host permission patterns the configured provider needs. */
export function providerOrigins(ai: AiSettings): string[] {
  if (ai.provider === 'none') return [];
  if (ai.provider !== 'ollama') return PROVIDER_ORIGINS[ai.provider];
  try {
    const url = new URL(ai.ollamaBaseUrl.trim() || OLLAMA_DEFAULT_BASE_URL);
    return [`${url.protocol}//${url.host}/*`];
  } catch {
    return PROVIDER_ORIGINS.ollama;
  }
}

export async function hasOrigins(origins: string[]): Promise<boolean> {
  if (origins.length === 0) return true;
  return browser.permissions.contains({ origins }).catch(() => false);
}

/** Must be called synchronously from a click handler (user gesture). */
export function requestOrigins(origins: string[]): Promise<boolean> {
  if (origins.length === 0) return Promise.resolve(true);
  return browser.permissions.request({ origins });
}

export const CLOUD_PROVIDERS = new Set(['openai', 'gemini', 'claude']);

export const PROVIDER_NAMES: Record<AiSettings['provider'], string> = {
  none: 'None',
  ollama: 'Ollama',
  openai: 'OpenAI',
  gemini: 'Google Gemini',
  claude: 'Anthropic Claude',
};

export const PROVIDER_HOSTS: Record<AiSettings['provider'], string> = {
  none: '',
  ollama: 'your computer',
  openai: 'api.openai.com',
  gemini: 'generativelanguage.googleapis.com',
  claude: 'api.anthropic.com',
};

/** True when the provider has what it needs to be called. */
export function isProviderReady(ai: AiSettings): boolean {
  if (ai.provider === 'none') return false;
  if (ai.provider === 'ollama') return true;
  return ai.apiKey.trim().length > 0;
}
