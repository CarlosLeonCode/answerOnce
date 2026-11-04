import { describe, expect, it, vi } from 'vitest';
import { buildAnswerPrompt } from '../../src/domain/prompt';
import { ClaudeProvider } from '../../src/infrastructure/llm/claude';
import { GeminiProvider } from '../../src/infrastructure/llm/gemini';
import { OllamaProvider } from '../../src/infrastructure/llm/ollama';
import { OpenAiProvider } from '../../src/infrastructure/llm/openai';
import { LlmError } from '../../src/ports/llm-provider';
import { sampleProfile } from '../helpers/dom';

const prompt = { system: 'sys', user: 'question' };

function fakeFetch(body: unknown, status = 200) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify(body), { status }));
}

describe('LLM providers (plain fetch)', () => {
  it('Claude sends the direct-browser-access and version headers', async () => {
    const fetchFn = fakeFetch({ content: [{ type: 'text', text: 'Hi' }] });
    const answer = await new ClaudeProvider('sk-test', undefined, fetchFn).complete(prompt);
    expect(answer).toBe('Hi');
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init!.headers).toMatchObject({
      'x-api-key': 'sk-test',
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    });
    expect(JSON.parse(init!.body as string)).toMatchObject({ model: 'claude-sonnet-5-5', system: 'sys' });
  });

  it('OpenAI, Gemini and Ollama parse their response shapes', async () => {
    await expect(new OpenAiProvider('k', 'm', fakeFetch({ choices: [{ message: { content: 'A' } }] })).complete(prompt)).resolves.toBe('A');
    const gemini = fakeFetch({ candidates: [{ content: { parts: [{ text: 'B' }] } }] });
    await expect(new GeminiProvider('k', 'gemini-x', gemini).complete(prompt)).resolves.toBe('B');
    expect(String(gemini.mock.calls[0]![0])).not.toContain('key=');
    await expect(new OllamaProvider('llama', 'http://localhost:11434/', fakeFetch({ message: { content: 'C' } })).complete(prompt)).resolves.toBe('C');
  });

  it('surfaces HTTP errors (e.g. Ollama without OLLAMA_ORIGINS returns 403)', async () => {
    await expect(new OllamaProvider('llama', undefined, fakeFetch({}, 403)).complete(prompt)).rejects.toBeInstanceOf(LlmError);
  });
});

describe('answer prompt', () => {
  it('excludes contact details, salary and secrets', () => {
    const profile = sampleProfile();
    profile.ai.apiKey = 'sk-secret';
    const { user } = buildAnswerPrompt('Why us?', 'Job text', profile);
    expect(user).toContain('Staff Engineer at Analytical Engines Ltd');
    for (const secret of ['ada@example.com', '+34 600 111 222', '70000', 'sk-secret', 'Lovelace']) {
      expect(user).not.toContain(secret);
    }
  });
});
