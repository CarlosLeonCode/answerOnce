import type { FrameScan } from '../domain/field';
import type { FillInstruction, FillResult } from '../domain/fill';

/** Talks to the page agent injected in a tab (all accessible frames). */
export interface PageGateway {
  scan(tabId: number): Promise<FrameScan[]>;
  apply(
    tabId: number,
    frameId: number,
    instructions: FillInstruction[],
    options: { overwrite: boolean },
  ): Promise<FillResult[]>;
}
