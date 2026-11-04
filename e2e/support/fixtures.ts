import { test as base, chromium, expect, type BrowserContext, type Worker } from '@playwright/test';
import { prepareExtensionCopy } from './extension';
import { AnswerOnce } from './answeronce';
import { startFixtureServer, startOllamaStub, type FixtureServer, type OllamaChatRequest, type OllamaStub } from './servers';

interface WorkerFixtures {
  /** Directory of the patched extension copy (see extension.ts). */
  extensionDir: string;
}

interface TestFixtures {
  context: BrowserContext;
  serviceWorker: Worker;
  extensionId: string;
  fixtureServer: FixtureServer;
  answeronce: AnswerOnce;
  /** Starts a stub Ollama server, closed automatically after the test. */
  startOllama: (reply: (request: OllamaChatRequest) => string) => Promise<OllamaStub>;
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  extensionDir: [
    async ({}, use, workerInfo) => {
      await use(prepareExtensionCopy(`worker-${workerInfo.workerIndex}`));
    },
    { scope: 'worker' },
  ],

  // A fresh profile per test: empty OPFS, storage and IndexedDB.
  context: async ({ extensionDir, headless, channel, viewport }, use, testInfo) => {
    const context = await chromium.launchPersistentContext('', {
      channel,
      headless,
      viewport,
      args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`],
    });
    // The native directory picker cannot be automated: extension pages get an
    // Origin Private File System directory instead. It is a real
    // FileSystemDirectoryHandle, so the folder code runs unchanged.
    await context.addInitScript(() => {
      if (location.protocol !== 'chrome-extension:') return;
      window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('answeronce', { create: true });
    });

    await use(context);

    if (testInfo.status !== testInfo.expectedStatus) {
      for (const [i, page] of context.pages().entries()) {
        const body = await page.screenshot({ fullPage: true }).catch(() => null);
        if (body) await testInfo.attach(`page-${i}`, { body, contentType: 'image/png' });
      }
    }
    await context.close();
  },

  serviceWorker: async ({ context }, use) => {
    const worker = context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://')) ?? (await context.waitForEvent('serviceworker'));
    await use(worker);
  },

  extensionId: async ({ serviceWorker }, use) => {
    await use(new URL(serviceWorker.url()).host);
  },

  fixtureServer: async ({}, use) => {
    const server = await startFixtureServer();
    await use(server);
    await server.close();
  },

  answeronce: async ({ context, serviceWorker, extensionId }, use) => {
    await use(new AnswerOnce(context, serviceWorker, extensionId));
  },

  startOllama: async ({}, use) => {
    const stubs: OllamaStub[] = [];
    await use(async (reply) => {
      const stub = await startOllamaStub(reply);
      stubs.push(stub);
      return stub;
    });
    await Promise.all(stubs.map((s) => s.close()));
  },
});

export { expect };
