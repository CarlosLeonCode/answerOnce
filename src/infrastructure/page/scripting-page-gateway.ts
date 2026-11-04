import { browser } from 'wxt/browser';
import type { FrameScan } from '../../domain/field';
import type { FillInstruction, FillResult } from '../../domain/fill';
import type { PageGateway } from '../../ports/page-gateway';
import type { DocumentScan } from '../../page-agent/detector';

const AGENT_FILE = '/page-agent.js';

/**
 * Two-step injection:
 *  1. executeScript({ files: ['/page-agent.js'] }) installs the bundled agent
 *     (idempotent) in every accessible frame of the tab.
 *  2. executeScript({ func, args }) calls it. `func` must be self-contained
 *     because Chrome serializes it; it only touches `globalThis.__answeronceAgent`.
 */
export class ScriptingPageGateway implements PageGateway {
  async scan(tabId: number): Promise<FrameScan[]> {
    await browser.scripting.executeScript({ target: { tabId, allFrames: true }, files: [AGENT_FILE] });
    const results = await browser.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: () => globalThis.__answeronceAgent?.scan() ?? null,
    });
    return results
      .filter((r) => r.result)
      .map((r) => {
        const scan = r.result as DocumentScan;
        return { frameId: r.frameId, ...scan };
      });
  }

  async apply(
    tabId: number,
    frameId: number,
    instructions: FillInstruction[],
    options: { overwrite: boolean },
  ): Promise<FillResult[]> {
    const target = { tabId, frameIds: [frameId] };
    await browser.scripting.executeScript({ target, files: [AGENT_FILE] });
    const [res] = await browser.scripting.executeScript({
      target,
      func: (ins: FillInstruction[], opts: { overwrite: boolean }) =>
        globalThis.__answeronceAgent?.apply(ins, opts) ?? Promise.resolve([]),
      args: [instructions, options],
    });
    return (res?.result as FillResult[] | undefined) ?? [];
  }
}

// When the panel runs in a fallback popup window (browsers without a working
// side panel), the target tab is passed as ?tabId=, because the "active tab"
// would be the popup itself.
export async function getActiveTab(): Promise<{ id: number; url: string } | null> {
  const boundTabId = Number(new URLSearchParams(globalThis.location?.search ?? '').get('tabId'));
  if (Number.isInteger(boundTabId) && boundTabId > 0) {
    const bound = await browser.tabs.get(boundTabId).catch(() => undefined);
    return bound?.id !== undefined ? { id: bound.id, url: bound.url ?? '' } : null;
  }
  const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
  return tab?.id !== undefined ? { id: tab.id, url: tab.url ?? '' } : null;
}
