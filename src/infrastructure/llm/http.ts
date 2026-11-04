import { LlmError } from '../../ports/llm-provider';

export type FetchFn = typeof fetch;

export async function postJson<T>(
  fetchFn: FetchFn,
  url: string,
  headers: Record<string, string>,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  let res: Response;
  try {
    res = await fetchFn(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
  } catch (error) {
    throw new LlmError(`Network error calling ${new URL(url).host}: ${(error as Error).message}`);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new LlmError(`${new URL(url).host} returned ${res.status}: ${text.slice(0, 300)}`, res.status);
  }
  return (await res.json()) as T;
}

export function requireText(text: string | undefined | null, provider: string): string {
  const out = (text ?? '').trim();
  if (!out) throw new LlmError(`${provider} returned an empty answer.`);
  return out;
}
