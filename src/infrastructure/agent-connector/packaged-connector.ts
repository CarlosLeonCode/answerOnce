import { browser } from 'wxt/browser';
import { CONNECTOR_ASSET, MCPB_ASSET } from '../../domain/agent-setup';

/** URL of the Claude Desktop extension (answeronce.mcpb) packaged with AnswerOnce, for a download link. */
export function mcpbDownloadUrl(): string {
  return browser.runtime.getURL(MCPB_ASSET);
}

/** The answeronce-mcp server script packaged with AnswerOnce (written into the profile folder). */
export async function loadPackagedConnector(): Promise<Uint8Array> {
  const response = await fetch(browser.runtime.getURL(CONNECTOR_ASSET));
  if (!response.ok) throw new Error(`The connector packaged with AnswerOnce could not be read (${response.status}). Reinstall the extension and try again.`);
  return new Uint8Array(await response.arrayBuffer());
}
