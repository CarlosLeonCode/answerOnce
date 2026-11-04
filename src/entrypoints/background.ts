import { browser, type Browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { PANEL_PORT, type PanelVisibility } from '../shared/messages';
import { toggleOverlay } from '../infrastructure/page/overlay';

// The background only wires the toolbar icon to the panel. It never touches
// personal data.
//
// Some Chromium browsers (e.g. Arc) expose `chrome.sidePanel` and even load the
// panel page, but never render it (Arc reports it as visible at 0x0). The panel page keeps a PANEL_PORT
// connection and reports whether it is actually visible; if no visible panel
// shows up shortly after opening, the panel is shown as a floating frame inside
// the clicked page instead (bound to it via ?tabId=). Pages that cannot be
// scripted (browser pages, the web store) get the panel in a tab next to them.
const READY_TIMEOUT_MS = 1500;
// Remembered for the browser session so later clicks skip the side panel wait.
// Legacy "hire" prefix (the product's former name), kept so the stored value stays valid.
const SIDE_PANEL_BROKEN_KEY = 'hire.sidePanelBroken';

export default defineBackground(() => {
  let visiblePanels = 0;
  let pendingReady: (() => void) | undefined;
  let sidePanelBroken = !browser.sidePanel?.open;
  void browser.storage.session
    .get(SIDE_PANEL_BROKEN_KEY)
    .then((r) => {
      if (r[SIDE_PANEL_BROKEN_KEY] === true) sidePanelBroken = true;
    })
    .catch(() => undefined);

  // Handle clicks ourselves so the fallback can run.
  void browser.sidePanel?.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => undefined);

  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== PANEL_PORT) return;
    let visible = false;
    port.onMessage.addListener((message: unknown) => {
      const v = message as PanelVisibility;
      const nowVisible = v.state === 'visible' && v.width > 0 && v.height > 0;
      if (nowVisible !== visible) visiblePanels += nowVisible ? 1 : -1;
      visible = nowVisible;
      if (visible) pendingReady?.();
    });
    port.onDisconnect.addListener(() => {
      if (visible) visiblePanels--;
    });
  });

  browser.action.onClicked.addListener((tab) => {
    if (tab.id === undefined) return;
    // Clicking the icon while on the AnswerOnce tab itself: nothing to bind to.
    if (tab.url?.startsWith(browser.runtime.getURL('/'))) return;

    if (sidePanelBroken) {
      void openOverlay(tab);
      return;
    }

    // sidePanel.open() must be called synchronously inside the user gesture.
    // Its promise is not awaited: in some browsers it never settles, so the
    // panel's visibility report is the only reliable signal.
    browser.sidePanel.open({ tabId: tab.id }).catch((e: unknown) => console.warn('[answeronce] sidePanel.open failed', e));
    void waitForPanel().then((ok) => {
      if (ok) return;
      sidePanelBroken = true;
      void browser.storage.session.set({ [SIDE_PANEL_BROKEN_KEY]: true }).catch(() => undefined);
      void openOverlay(tab);
    });
  });

  function waitForPanel(): Promise<boolean> {
    // A side panel that is already visible counts as success.
    if (visiblePanels > 0) return Promise.resolve(true);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pendingReady = undefined;
        resolve(false);
      }, READY_TIMEOUT_MS);
      pendingReady = () => {
        clearTimeout(timer);
        pendingReady = undefined;
        resolve(true);
      };
    });
  }

  async function openOverlay(target: Browser.tabs.Tab): Promise<void> {
    const url = browser.runtime.getURL(`/sidepanel.html?tabId=${target.id}&embed=1`);
    try {
      await browser.scripting.executeScript({ target: { tabId: target.id! }, func: toggleOverlay, args: [url] });
    } catch (e) {
      console.warn('[answeronce] cannot show the panel inside this page, opening a tab', e);
      await openFallbackTab(target).catch((err: unknown) => console.error('[answeronce] fallback tab failed', err));
    }
  }

  async function openFallbackTab(target: Browser.tabs.Tab): Promise<void> {
    const url = browser.runtime.getURL(`/sidepanel.html?tabId=${target.id}`);
    // Reuse an existing AnswerOnce tab instead of piling up new ones. getContexts
    // finds our own pages without the "tabs" permission and survives
    // service worker restarts.
    const panelUrl = browser.runtime.getURL('/sidepanel.html');
    const existing = (await browser.runtime.getContexts({ contextTypes: [browser.runtime.ContextType.TAB] })).find(
      (c) => c.documentUrl?.startsWith(panelUrl),
    );
    if (existing?.tabId !== undefined && existing.tabId >= 0) {
      const moved = await browser.tabs.move(existing.tabId, { windowId: target.windowId, index: target.index + 1 }).catch(() => undefined);
      if (moved) {
        await browser.tabs.update(existing.tabId, { url, active: true });
        return;
      }
    }
    await browser.tabs.create({ url, windowId: target.windowId, index: target.index + 1, openerTabId: target.id, active: true });
  }
});
