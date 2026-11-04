import { CONNECTOR_SCRIPT, type VaultStorage } from '../ports/vault-storage';
import { VaultError } from './vault';

/**
 * The answeronce-mcp connector in the profile folder (.answeronce/answeronce-mcp.js), run by
 * Claude Code, Codex, Antigravity, OpenCode and Cursor. answeronce-mcp finds the profile folder from that
 * location, so the user never runs a setup command.
 */
export async function addAgentConnector(storage: VaultStorage, script: Uint8Array): Promise<void> {
  if (script.byteLength === 0) throw new VaultError('The connector packaged with AnswerOnce is missing. Reinstall the extension and try again.');
  // Replaces an older copy, so clicking again after a AnswerOnce update refreshes it.
  await storage.writeBytes(CONNECTOR_SCRIPT, script);
}

export function hasAgentConnector(storage: VaultStorage): Promise<boolean> {
  return storage.exists(CONNECTOR_SCRIPT);
}
