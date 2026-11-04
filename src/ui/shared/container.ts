/**
 * Composition root for extension pages: wires ports to infrastructure.
 * UI components import use cases + this module, never infrastructure directly.
 */
import type { ApplicationsDeps } from '../../application/applications';
import type { VaultDeps } from '../../application/vault';
import { readDocument } from '../../application/vault';
import type { FillPageDeps } from '../../application/fill-page';
import { ATS_ADAPTERS } from '../../infrastructure/ats';
import { ScriptingPageGateway } from '../../infrastructure/page/scripting-page-gateway';
import { ChromeSessionStore } from '../../infrastructure/session/chrome-session-store';
import { FsaVaultStorage } from '../../infrastructure/vault/fsa-vault-storage';
import { createTextExtractor } from '../../infrastructure/text-extraction';

/** The AI agent connector packaged with the extension (answeronce.mcpb, answeronce-mcp.js). */
export { loadPackagedConnector, mcpbDownloadUrl } from '../../infrastructure/agent-connector/packaged-connector';

export const sessionStore = new ChromeSessionStore();
/** ATS adapters (Greenhouse, Lever, Ashby, generic), in detection order. */
export const atsAdapters = ATS_ADAPTERS;
export const pageGateway = new ScriptingPageGateway();
/** Local (no network) text extraction for CV import. pdf.js / mammoth load lazily. */
export const textExtractor = createTextExtractor();

/** The extension reads and writes settings.json too (AI provider settings). */
export function vaultDeps(handle: FileSystemDirectoryHandle): VaultDeps {
  return { storage: new FsaVaultStorage(handle), session: sessionStore, withSettings: true };
}

/** applications.json in the profile folder. */
export function applicationsDeps(handle: FileSystemDirectoryHandle): ApplicationsDeps {
  return { storage: new FsaVaultStorage(handle) };
}

export function fillDeps(handle: FileSystemDirectoryHandle): FillPageDeps {
  const deps = vaultDeps(handle);
  return {
    gateway: pageGateway,
    adapters: ATS_ADAPTERS,
    loadDocument: async (id) => {
      const { ref, bytes } = await readDocument(deps, id);
      return { fileName: ref.fileName, mimeType: ref.mimeType, bytes };
    },
  };
}
