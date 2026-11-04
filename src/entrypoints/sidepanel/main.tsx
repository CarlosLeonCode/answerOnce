import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { browser } from 'wxt/browser';
import { SidePanelApp } from '../../ui/sidepanel/SidePanelApp';
import { PANEL_PORT, type PanelVisibility } from '../../shared/messages';
import '../../ui/shared/styles.css';

// Only the real side panel announces itself; the fallback window (?tabId=)
// must not make the background think a side panel works.
if (!new URLSearchParams(location.search).has('tabId')) {
  const port = browser.runtime.connect({ name: PANEL_PORT });
  const report = () =>
    port.postMessage({ state: document.visibilityState, width: window.innerWidth, height: window.innerHeight } satisfies PanelVisibility);
  report();
  document.addEventListener('visibilitychange', report);
  window.addEventListener('resize', report);
}

const params = new URLSearchParams(location.search);
const root = createRoot(document.getElementById('root')!);

// When framed inside a web page (?embed=1), only render inside the exact tab
// the panel was opened for, so other sites cannot frame it.
async function isAllowedHere(): Promise<boolean> {
  if (params.get('embed') !== '1') return true;
  if (window.top === window) return false;
  const current = await browser.tabs.getCurrent().catch(() => undefined);
  return current?.id !== undefined && current.id === Number(params.get('tabId'));
}

void isAllowedHere().then((allowed) =>
  root.render(
    <StrictMode>
      {allowed ? <SidePanelApp /> : <p style={{ padding: 16 }}>Open AnswerOnce from the toolbar icon on this page.</p>}
    </StrictMode>,
  ),
);
