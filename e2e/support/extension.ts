import fs from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(import.meta.dirname, '../..');
export const BUILD_DIR = path.join(ROOT, '.output/chrome-mv3');
/** Gitignored. Holds the patched copies; the real build is never modified. */
export const EXTENSION_COPIES_DIR = path.join(ROOT, 'e2e/.extension');
export const FIXTURES_DIR = path.join(ROOT, 'tests/fixtures');

/**
 * Prepended to the copy's background.js.
 *
 * - `chrome.sidePanel.open` never settles, like in Arc (it exposes the API but
 *   never shows the panel). The background then falls back to the in-page
 *   overlay, which is the flow these tests can observe. Headless Chromium has
 *   no visible side panel either way.
 * - The toolbar click listener is captured as `globalThis.__answeronceClick`, so a
 *   test can dispatch a click from the service worker: automation cannot click
 *   the browser toolbar.
 */
const BACKGROUND_SHIM = `// --- e2e shim (test copy only) ---
chrome.sidePanel.open = () => new Promise(() => {});
const __answeronceAddClickListener = chrome.action.onClicked.addListener.bind(chrome.action.onClicked);
chrome.action.onClicked.addListener = (listener) => {
  globalThis.__answeronceClick = listener;
  __answeronceAddClickListener(listener);
};
// --- end of e2e shim ---
`;

/**
 * Copies the built extension and patches the copy:
 *
 * - `host_permissions: ["http://localhost/*"]` stands in for `activeTab`,
 *   which is only granted by a real toolbar click (automation cannot do that).
 *   Fixture pages and the stub Ollama server are served from localhost.
 * - The background shim described above.
 *
 * Returns the directory of the patched copy.
 */
export function prepareExtensionCopy(name: string): string {
  if (!fs.existsSync(path.join(BUILD_DIR, 'manifest.json'))) {
    throw new Error(`No extension build at ${BUILD_DIR}. Run "pnpm build" (or "pnpm test:e2e", which builds first).`);
  }
  const dir = path.join(EXTENSION_COPIES_DIR, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(EXTENSION_COPIES_DIR, { recursive: true });
  fs.cpSync(BUILD_DIR, dir, { recursive: true });

  const manifestPath = path.join(dir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
  manifest.host_permissions = ['http://localhost/*'];
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  const backgroundPath = path.join(dir, 'background.js');
  fs.writeFileSync(backgroundPath, BACKGROUND_SHIM + fs.readFileSync(backgroundPath, 'utf8'));
  return dir;
}
