import type { FillInstruction, FillResult } from '../domain/fill';
import { scanDocument, type DocumentScan } from './detector';
import { applyInstructions } from './filler';

/**
 * The page agent is bundled into `/page-agent.js` (see entrypoints/page-agent.ts)
 * and injected on demand with chrome.scripting.executeScript({ files }).
 * It only exposes a tiny command API on the isolated-world global object; the
 * extension then calls it with a self-contained `func` + JSON `args`.
 *
 * It never receives the full profile — only the values chosen for this page.
 */
export interface AnswerOnceAgent {
  version: 1;
  scan(): DocumentScan;
  apply(instructions: FillInstruction[], options: { overwrite: boolean }): Promise<FillResult[]>;
}

declare global {
  // `var` is required to augment globalThis.
  var __answeronceAgent: AnswerOnceAgent | undefined;
}

export function installAgent(target: typeof globalThis = globalThis): AnswerOnceAgent {
  if (target.__answeronceAgent) return target.__answeronceAgent;
  const agent: AnswerOnceAgent = {
    version: 1,
    scan: () => scanDocument(document),
    apply: (instructions, options) => applyInstructions(document, instructions, options),
  };
  target.__answeronceAgent = agent;
  return agent;
}
