import { useCallback, useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { getActiveTab } from '../../infrastructure/page/scripting-page-gateway';

/**
 * The tab the panel works on, kept current: a panel bound to a tab (?tabId=)
 * follows that tab's navigation; the browser side panel also follows the
 * active tab. `url` is empty when the extension has no access to the tab.
 */
export function useActiveTab(): { id: number; url: string } | null {
  const [tab, setTab] = useState<{ id: number; url: string } | null>(null);
  const refresh = useCallback(() => {
    void getActiveTab()
      .then(setTab)
      .catch(() => setTab(null));
  }, []);

  useEffect(() => {
    refresh();
    const onActivated = () => refresh();
    const onUpdated = (_id: number, change: { url?: string; status?: string }) => {
      if (change.url || change.status === 'complete') refresh();
    };
    browser.tabs.onActivated?.addListener(onActivated);
    browser.tabs.onUpdated?.addListener(onUpdated);
    return () => {
      browser.tabs.onActivated?.removeListener(onActivated);
      browser.tabs.onUpdated?.removeListener(onUpdated);
    };
  }, [refresh]);

  return tab;
}
