import { existsSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'wxt';
import { ATS_EMBED_ORIGINS } from './src/infrastructure/ats';
import { ALL_PROVIDER_ORIGINS } from './src/infrastructure/llm';

/**
 * The AI agent connector, built by `pnpm build:mcp` and packaged with the
 * extension so the AI agents page can hand it to the user: answeronce.mcpb is
 * downloaded for Claude Desktop, answeronce-mcp.js is written into the profile folder.
 */
const CONNECTOR_ASSETS = ['answeronce.mcpb', 'answeronce-mcp.js'];

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  imports: false,
  hooks: {
    'prepare:publicPaths': (_wxt, paths) => {
      paths.push(...CONNECTOR_ASSETS.map((name) => `/${name}`));
    },
    'build:publicAssets': (wxt, files) => {
      for (const name of CONNECTOR_ASSETS) {
        const absoluteSrc = path.join(wxt.config.root, 'mcp/dist', name);
        if (!existsSync(absoluteSrc)) throw new Error(`Missing mcp/dist/${name}. Run "pnpm build:mcp" first (pnpm build does it for you).`);
        files.push({ absoluteSrc, relativeDest: name });
      }
    },
  },
  manifest: {
    name: 'AnswerOnce — Private Job Application Autofill',
    short_name: 'AnswerOnce',
    description:
      'Autofill job applications from a profile folder on your own disk. No servers, no tracking.',
    // chrome.sidePanel.open needs Chrome 116.
    minimum_chrome_version: '116',
    permissions: ['activeTab', 'scripting', 'sidePanel', 'storage'],
    // No host permissions by default. LLM provider hosts and embedded ATS iframe
    // hosts are requested at runtime, only when the user opts in.
    optional_host_permissions: [...ALL_PROVIDER_ORIGINS, ...ATS_EMBED_ORIGINS],
    action: {
      default_title: 'Open AnswerOnce',
    },
    // The panel page can be framed inside the page being filled (browsers
    // without a working side panel, e.g. Arc). Dynamic URLs stop sites from
    // probing for the extension; the panel also refuses to render unless it is
    // framed inside the exact tab it was opened for.
    web_accessible_resources: [{ resources: ['sidepanel.html'], matches: ['<all_urls>'], use_dynamic_url: true }],
  },
});
