import { browser } from 'wxt/browser';

/** Opens the options page, optionally at a route (e.g. 'import' -> options.html#/import). */
export function openOptions(route?: string): void {
  if (!route) return void browser.runtime.openOptionsPage();
  void browser.tabs.create({ url: browser.runtime.getURL(`/options.html#/${route}`) });
}
