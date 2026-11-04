import { expect, type BrowserContext, type Frame, type Page, type Worker } from '@playwright/test';
import type { browser } from 'wxt/browser';
import { ADA, type TestProfile } from './profile';

// The extension APIs, as seen by code evaluated in the service worker.
declare const chrome: typeof browser;

export interface FolderFile {
  /** Path inside the folder, e.g. "profile.json" or "documents/cv-1a2b3c4d.pdf". */
  name: string;
  size: number;
  text: string;
}

/** Profile as cached in the session (chrome.storage.session). */
export interface SessionProfile {
  personal: Record<string, string>;
  links: Record<string, unknown>;
  headline: string;
  summary: string;
  skills: string[];
  experience: { company: string; title: string; current: boolean }[];
  education: { school: string; degree: string; field: string }[];
  documents: { id: string; kind: string; fileName: string; storedAs: string }[];
  defaultResumeId: string;
  ai: { provider: string; model: string; ollamaBaseUrl: string };
  agentProposals: { id: string; client: string; summary: string }[];
  agents: { directWrite: boolean };
  agentSetup: { profileFolder: string; nodePath: string };
}

export interface ProfileSession {
  loadedAt: string;
  revision: number;
  profile: SessionProfile;
}

/** Drives the AnswerOnce extension loaded in `context`. */
export class AnswerOnce {
  constructor(
    readonly context: BrowserContext,
    readonly serviceWorker: Worker,
    readonly extensionId: string,
  ) {}

  url(page: 'options.html' | 'sidepanel.html', suffix = ''): string {
    return `chrome-extension://${this.extensionId}/${page}${suffix}`;
  }

  /** Opens the options page, picks the (OPFS) folder and creates a profile there. Ends on the onboarding screen. */
  async setUpFolder(): Promise<Page> {
    const page = await this.context.newPage();
    await page.goto(this.url('options.html'));
    await page.getByRole('button', { name: 'Choose folder…' }).click();
    await page.getByRole('button', { name: 'Create profile' }).click();
    await expect(page.getByRole('heading', { name: 'Import your CV' })).toBeVisible({ timeout: 30_000 });
    return page;
  }

  /** Sets up the folder and fills the profile through the options UI. Returns the options page. */
  async setUpFolderWithProfile(profile: TestProfile = ADA): Promise<Page> {
    const page = await this.setUpFolder();
    await page.getByRole('button', { name: 'Skip, fill manually' }).click();
    await this.fillProfile(page, profile);
    return page;
  }

  /** Fills the profile editor section by section, then saves once. */
  async fillProfile(page: Page, p: TestProfile): Promise<void> {
    const nav = page.getByRole('navigation');
    const field = (label: string) => page.getByLabel(label, { exact: true });

    await nav.getByRole('button', { name: 'Personal' }).click();
    await field('First name').fill(p.firstName);
    await field('Last name').fill(p.lastName);
    await field('Email').fill(p.email);
    await field('Phone').fill(p.phone);
    await field('Location').fill(p.location);
    await field('City').fill(p.city);
    await field('Country').fill(p.country);

    await nav.getByRole('button', { name: 'Links' }).click();
    await field('LinkedIn').fill(p.linkedin);
    await field('GitHub').fill(p.github);
    await field('Portfolio / website').fill(p.portfolio);

    await nav.getByRole('button', { name: 'Experience' }).click();
    await page.getByRole('button', { name: 'Add experience' }).click();
    await field('Title').fill(p.title);
    await field('Company').fill(p.company);
    await page.getByLabel('I currently work here').check();

    await nav.getByRole('button', { name: 'Work authorization' }).click();
    const countries = field('Countries or regions you are authorized to work in');
    for (const country of p.countriesAuthorized) {
      await countries.fill(country);
      await countries.press('Enter');
    }
    await page
      .getByRole('radiogroup', { name: 'Needs visa sponsorship' })
      .getByRole('radio', { name: p.needsSponsorship ? 'Yes' : 'No' })
      .click();
    await field('Notice period').fill(p.noticePeriod);

    await nav.getByRole('button', { name: 'Preferences' }).click();
    await field('Expected salary').fill(p.expectedSalary);
    await field('Currency').fill(p.salaryCurrency);
    await page
      .getByRole('radiogroup', { name: 'Willing to relocate' })
      .getByRole('radio', { name: p.willingToRelocate ? 'Yes' : 'No' })
      .click();
    for (const mode of p.workModes) await page.getByRole('button', { name: mode, exact: true }).click();

    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Changes saved')).toBeVisible({ timeout: 30_000 });
  }

  /** Tab id of a page, looked up by URL from the service worker. */
  async tabIdOf(page: Page): Promise<number> {
    const url = page.url();
    const id = await this.serviceWorker.evaluate(async (target) => {
      const tabs = await chrome.tabs.query({});
      return tabs.find((t) => t.url === target)?.id ?? null;
    }, url);
    if (id === null) throw new Error(`No tab found for ${url}`);
    return id;
  }

  /**
   * Dispatches a toolbar icon click for `page`'s tab through the listener the
   * background shim captured (automation cannot click the browser toolbar).
   */
  async clickToolbar(page: Page): Promise<void> {
    await page.bringToFront();
    const tabId = await this.tabIdOf(page);
    await this.serviceWorker.evaluate(async (id) => {
      const tab = await chrome.tabs.get(id);
      const click = (globalThis as unknown as { __answeronceClick?: (tab: unknown) => void }).__answeronceClick;
      if (!click) throw new Error('Toolbar click listener was not captured: is the e2e background shim missing?');
      click(tab);
    }, tabId);
  }

  /**
   * The panel frame inside the in-page overlay. The overlay's shadow root is
   * closed, so selectors cannot reach it; the frame tree can.
   */
  async panelFrame(page: Page): Promise<Frame> {
    let frame: Frame | undefined;
    await expect
      .poll(() => (frame = page.frames().find((f) => f.url().includes('/sidepanel.html'))), { message: 'AnswerOnce panel frame inside the page' })
      .toBeTruthy();
    return frame!;
  }

  /**
   * The URL the background frames into a page for `tabId`. The panel is a web
   * accessible resource with use_dynamic_url, so this is the per-session
   * dynamic URL (a frame loaded from it reports the static extension id).
   */
  async embeddedPanelUrl(tabId: number): Promise<string> {
    return this.serviceWorker.evaluate((id) => chrome.runtime.getURL(`/sidepanel.html?tabId=${id}&embed=1`), tabId);
  }

  /** Opens the panel in its own tab, bound to `page`'s tab (like the fallback tab the background opens). */
  async openPanelFor(page: Page): Promise<Page> {
    const tabId = await this.tabIdOf(page);
    const panel = await this.context.newPage();
    await panel.goto(this.url('sidepanel.html', `?tabId=${tabId}`));
    return panel;
  }

  /** Files in the profile folder (the OPFS "answeronce" directory, one level of subfolders), with their contents. */
  async folderFiles(): Promise<FolderFile[]> {
    return this.serviceWorker.evaluate(async () => {
      const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('answeronce');
      const files: { name: string; size: number; text: string }[] = [];
      const walk = async (dir: FileSystemDirectoryHandle, prefix: string) => {
        for await (const [name, handle] of dir as unknown as AsyncIterable<[string, FileSystemHandle]>) {
          if (handle.kind === 'directory') await walk(handle as FileSystemDirectoryHandle, `${prefix}${name}/`);
          // Chrome's temporary swap file of a write in progress (gone once the write completes).
          else if (!name.endsWith('.crswap')) {
            const file = await (handle as FileSystemFileHandle).getFile();
            files.push({ name: `${prefix}${name}`, size: file.size, text: await file.text() });
          }
        }
      };
      await walk(root, '');
      return files.sort((a, b) => a.name.localeCompare(b.name));
    });
  }

  /** Writes a file into the profile folder, as the user (or an older AnswerOnce version) would. */
  async writeFolderFile(name: string, text: string): Promise<void> {
    await this.serviceWorker.evaluate(
      async ([n, t]) => {
        const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('answeronce', { create: true });
        const writable = await (await dir.getFileHandle(n!, { create: true })).createWritable();
        await writable.write(t!);
        await writable.close();
      },
      [name, text],
    );
  }

  async sessionStorage(): Promise<Record<string, unknown>> {
    return this.serviceWorker.evaluate(() => chrome.storage.session.get(null));
  }

  async localStorage(): Promise<Record<string, unknown>> {
    return this.serviceWorker.evaluate(() => chrome.storage.local.get(null));
  }

  /** The cached session, or null when no profile is loaded. */
  async session(): Promise<ProfileSession | null> {
    const data = await this.sessionStorage();
    return (data['hire.session'] as ProfileSession | undefined) ?? null;
  }

  async clearSession(): Promise<void> {
    await this.serviceWorker.evaluate(() => chrome.storage.session.remove('hire.session'));
  }

  /** Every record in the extension's IndexedDB stores, as JSON-safe summaries. */
  async indexedDbRecords(page: Page): Promise<{ db: string; store: string; key: string; type: string }[]> {
    return page.evaluate(async () => {
      const out: { db: string; store: string; key: string; type: string }[] = [];
      const request = <T>(r: IDBRequest<T>) =>
        new Promise<T>((resolve, reject) => {
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error);
        });
      for (const info of await indexedDB.databases()) {
        if (!info.name) continue;
        const db = await request(indexedDB.open(info.name));
        for (const store of [...db.objectStoreNames]) {
          const tx = db.transaction(store, 'readonly').objectStore(store);
          const [keys, values] = await Promise.all([request(tx.getAllKeys()), request(tx.getAll())]);
          keys.forEach((key, i) => {
            const value: unknown = values[i];
            const type = value instanceof FileSystemDirectoryHandle ? 'FileSystemDirectoryHandle' : typeof value;
            out.push({ db: info.name!, store, key: String(key), type });
          });
        }
        db.close();
      }
      return out;
    });
  }
}
