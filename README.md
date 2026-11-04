<p align="center">
  <img src="brand/answeronce-icon.svg" width="96" height="96" alt="AnswerOnce logo">
</p>

<h1 align="center">AnswerOnce</h1>

<p align="center"><em>Answer once. Apply everywhere.</em></p>

<p align="center"><strong>Autofill job applications from plain files on your own disk. No servers, no tracking, and you always press Submit.</strong></p>

<p align="center">
  <a href="https://github.com/CarlosLeonCode/answeronce/actions/workflows/ci.yml"><img src="https://github.com/CarlosLeonCode/answeronce/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-blue.svg" alt="License: AGPL-3.0"></a>
</p>

A privacy-first Chrome extension (Manifest V3) that autofills job application forms
(Greenhouse, Lever, Ashby and generic forms) from **plain files in a folder on your own disk**.

- No backend, no analytics, no telemetry.
- The only network calls are to the LLM provider *you* configure, and only when you click
  "Generate with AI" or import a CV with AI (after an explicit confirmation for cloud providers).
- It never submits a form. You always review and click Submit yourself.
- It never answers consent, terms, privacy, attestation, marketing opt-in or e-signature fields (English and Spanish). They are listed under "Left to you" in the panel and refused again by the page filler as a second guard.

## Install

AnswerOnce is not on the Chrome Web Store yet. Load it as an unpacked extension in Chrome 116 or newer
(or another Chromium-based browser: Arc, Edge, Brave).

The easiest way is the **install guide on the AnswerOnce site** (`/install/`): the Install button downloads
`answeronce-chrome.zip` and walks you through each step for your browser, with a troubleshooting section.
In short:

1. Get the extension:
   - **Download**: `answeronce-chrome.zip` from the site's install page, or `answeronce-<version>-chrome.zip`
     from [Releases](https://github.com/CarlosLeonCode/answeronce/releases). Unzip it and keep the folder
     somewhere permanent (the browser loads the extension from it), or
   - **From source**: build it (see [Development](#development)); the output is `.output/chrome-mv3`.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the unzipped folder (or `.output/chrome-mv3`).
4. Click the AnswerOnce icon: the side panel opens. Choose a folder for your data and click **Create profile**.
5. Open **Profile** (the options page). Right after creating the profile it offers **Import your CV**;
   you can also skip and fill the profile by hand.

To update, replace the contents of the same folder with the new version and click the reload icon on the
extension's card (loading it from a different folder installs it as a new extension).
Your data stays in your profile folder.

## Privacy

| What | Where | Notes |
| --- | --- | --- |
| Profile, saved answers, agent proposals, "direct write" setting | `profile.json` in a folder you pick (e.g. `~/answeronce/`) | Plain, pretty-printed JSON you can read, back up or edit. Validated (zod) on every read |
| AI provider settings and API key, folder and node paths typed on the AI agents page | `settings.json` in the same folder | Kept out of `profile.json` so AI agents (`answeronce-mcp`) never read it |
| AI agent connector (optional) | `.answeronce/answeronce-mcp.js` in the same folder | Written only when you click **Add the connector to your profile folder**. A copy of the `answeronce-mcp` server packaged with the extension; no personal data |
| Jobs you filled or applied to | `applications.json` in the same folder | Company, role, URL, status history, notes and the answers you gave. Never consent fields or uploaded files. Separate from `profile.json` |
| CV / cover letter | `documents/` in the same folder (e.g. `documents/Jane-CV-1a2b3c4d.pdf`) | The original files. Their metadata (id, file name, type, size) and the default resume are in `profile.json` |
| CV being imported | Memory of the options page only | Text is extracted locally; only the original file is copied to `documents/` |
| Folder handle | IndexedDB of the extension | Contains no personal data, only the handle |
| Loaded profile (cache) | `chrome.storage.session` | Memory only, cleared when the browser closes. Access level left at `TRUSTED_CONTEXTS`, so content scripts and injected code cannot read it. Shared by the side panel and the in-page panel |

### Folder layout

```
~/answeronce/                  the folder you pick
  profile.json           your profile, its revision, agent proposals, agent settings
  settings.json          AI provider settings, API key, agent setup paths (never read by answeronce-mcp)
  applications.json      jobs you filled or applied to, with its own revision
  documents/             original CV and cover letter files
    Jane-CV-1a2b3c4d.pdf
  .answeronce/answeronce-mcp.js      optional: the AI agent connector (Claude Code, Codex, Antigravity, OpenCode, Cursor)
```

The files are not protected by AnswerOnce: anyone (or any program) that can read the folder can read your
profile, which is what you hand to employers anyway. Pick a folder only you can access, and include
it in your backups.

`profile.json` starts with `rev`, a write counter used for optimistic concurrency between the
extension and AI agents. Every writer checks it right before writing and refuses if someone else
wrote in between. A file without it (e.g. written by hand) counts as revision 0.

```json
{
  "rev": 7,
  "schemaVersion": 3,
  "personal": { "firstName": "Jane", "lastName": "Doe", "email": "jane@example.com", ... },
  "documents": [{ "id": "1a2b3c4d-...", "kind": "cv", "fileName": "Jane CV.pdf", "storedAs": "documents/Jane-CV-1a2b3c4d.pdf", ... }],
  "defaultResumeId": "1a2b3c4d-...",
  "agentProposals": [],
  "agents": { "directWrite": false }
}
```

**Browser permission**: the folder handle is remembered, but Chrome asks again for access to the
folder in every new browser session (it needs a click). AnswerOnce then shows **Reconnect folder**.

**Upgrading from an older version**: older versions kept everything in one password-protected
file. When AnswerOnce finds that file and no `profile.json` in your folder, it offers to import your old
data: you type the old password once, AnswerOnce writes `profile.json`, `settings.json` and `documents/`,
and renames the old file to `*.migrated` (delete it when you are happy with the result).

**Permissions**: `activeTab`, `scripting`, `sidePanel`, `storage`. No `<all_urls>`, no
always-on content scripts. Code is injected into a page only when you click **Fill this page**.
Optional host permissions, requested at runtime only if you opt in:

- LLM providers: `http://localhost:11434/*`, `http://127.0.0.1:11434/*`, `https://api.openai.com/*`,
  `https://generativelanguage.googleapis.com/*`, `https://api.anthropic.com/*`.
- Embedded ATS iframes (a Greenhouse form embedded in a company careers page is a cross-origin
  iframe that `activeTab` does not cover): `boards.greenhouse.io`, `job-boards.greenhouse.io`,
  `jobs.lever.co`, `jobs.ashbyhq.com`.

What the page sees: only the values chosen for the detected fields of that page (never the full
profile). What the LLM sees when drafting an answer: the question, the job description text and a
minimal profile summary (first name, location, headline, skills, work authorization, experience,
education). No email, phone, salary, documents or API keys.

**CV import and cloud providers**: when you import a CV with OpenAI, Gemini or Claude, the **full
text of your CV, including your contact details**, is sent to that provider with your API key, and
that provider's data policies apply. AnswerOnce asks for explicit confirmation first, every time. With
Ollama the text never leaves your computer, and **Basic extraction** uses no AI at all.

## Using it

1. Open a job application page and click the AnswerOnce toolbar icon (this grants temporary access to
   that tab via `activeTab`).
2. Reconnect the folder once per browser session (one click, if AnswerOnce asks).
3. Click **Fill this page**. Filled fields are outlined in green. Fields that already had a value
   are kept unless you tick "Overwrite".
4. For questions AnswerOnce could not answer, type an answer or click **Generate with AI**, review it,
   then **Insert into page** and optionally **Save answer** so it is reused next time.
5. Review the form and submit it yourself.

## Track your applications

AnswerOnce keeps a record of every job you fill, in `applications.json` next to your profile.

- **On fill.** After **Fill this page**, AnswerOnce records the job with status *Filled*: URL, company,
  role, ATS and the answers now on the form. Company and role come from the Greenhouse, Lever and
  Ashby page headers, titles and board URLs, or, on other sites, from `og:title`, the page title
  and the first heading. Fix them with the pencil on the card in the panel.
- **One record per job.** URLs are normalized before comparing: the `#hash` and tracking parameters
  (`utm_*`, `gclid`, `fbclid`, `gh_src`, `lever-source`, `ref`...) are dropped, ATS job ids (`gh_jid`,
  `ashby_jid`, ids in the path) are kept, and `/apply` / `/application` sub-pages count as the posting.
  Filling the same job again updates its record; a job already applied to stays *Applied*.
- **Answers you insert** from the panel (typed or **Generate with AI** + **Insert into page**) are added
  to the record.
- **Mark as applied.** After you submit the form yourself, click **Mark as applied** on the card. AnswerOnce
  scans the page again and keeps the final value of every answered field (label + value). Consent,
  terms, privacy and e-signature fields and file inputs are never kept.
- **Already applied.** Opening the panel on a job you applied to shows "You already applied here on
  Oct 3".
- **Applications page** (options page → Applications): search, filter by status, newest first. Open
  one to see the answers you gave, change its status (*Filled → Applied → Interview → Offer /
  Rejected*, every change is kept in its history), keep notes, open the job or delete the record.
  Overview shows how many jobs you applied to this week.

`applications.json` is pretty-printed and validated on every read, like `profile.json`. Its own `rev`
is checked right before every write, so the extension windows and AI agents never overwrite each
other, and application updates never conflict with profile edits.

```json
{
  "rev": 3,
  "schemaVersion": 1,
  "applications": [
    {
      "id": "6f0c...",
      "url": "https://boards.greenhouse.io/acme/jobs/123?gh_src=linkedin",
      "normalizedUrl": "https://boards.greenhouse.io/acme/jobs/123",
      "company": "Acme",
      "role": "Senior Backend Engineer",
      "ats": "greenhouse",
      "createdAt": "2026-10-03T09:12:44.512Z",
      "status": "applied",
      "statusHistory": [{ "status": "filled", "at": "2026-10-03T09:12:44.512Z" }, { "status": "applied", "at": "2026-10-03T09:31:02.118Z" }],
      "notes": "",
      "answers": [{ "label": "Why do you want to work at Acme?", "value": "..." }]
    }
  ]
}
```

## Import your profile from a CV

Options page → **Import from CV** (also offered right after creating your profile, and from Overview /
Documents):

1. **Upload** a PDF, DOCX, TXT or Markdown file. Text is extracted locally: PDF with `pdf.js`
   (worker bundled with the extension, no remote scripts), DOCX with `mammoth`. Scanned,
   image-only PDFs have no text and are rejected (no OCR).
2. **Extract**:
   - *Structure with AI* (recommended): the configured provider (or one you set up inline) returns
     JSON for name, contact, links, headline, summary, skills, work authorization (only if stated),
     experience and education. The output is never trusted: it is parsed tolerantly (code fences,
     prose, truncation), validated and clamped with zod, and contact details that do not literally
     appear in the CV are discarded and re-derived from the text.
   - *Basic extraction*: offline regexes for email, phone, LinkedIn/GitHub/portfolio URLs and a
     name/headline guess from the first lines.
3. **Review**: every extracted value is shown next to the current one. Default is *Fill empty
   fields only*; switch to *Overwrite existing*, accept/clear all, toggle single fields, roles,
   schools and skills, or edit values before saving. Matching roles/schools are merged into the
   existing entry instead of duplicated.
4. **Save**: one write of `profile.json`; the original file is copied to `documents/` in your folder
   and marked as the **default resume** attached to resume upload fields (toggleable).

## Use with AI agents

You can fill and maintain your profile from an AI agent (Claude Code, Claude Desktop, Codex,
Antigravity, OpenCode, Cursor or any MCP client) as well as from the extension. AnswerOnce ships a local
[MCP](https://modelcontextprotocol.io) server, `answeronce-mcp`, that the agent starts on your computer
over stdio. It reads and writes the same `profile.json` and `applications.json` as the extension (never
`settings.json`). It manages your profile and your application records; it never fills job pages.

What an agent can do:

| Tool | What it does |
| --- | --- |
| `vault_status` | Folder, whether `profile.json` was found, revision, direct write on/off, pending proposals. No personal data |
| `get_profile` | Returns only the sections asked for: `personal`, `links`, `about` (headline, summary, skills), `workAuthorization`, `preferences`, `experience`, `education`, `savedAnswers` |
| `propose_profile_update` | Personal details, links, headline, summary, skills (add/remove), work authorization, preferences |
| `propose_experience` / `propose_education` | Add, update (by id) or remove entries |
| `save_answer` / `list_saved_answers` / `propose_remove_answer` | Reusable answers to application questions |
| `import_cv_file` | Extracts the text of a PDF/DOCX/TXT/MD file locally and returns it so the **agent** structures it; the original file is copied to `documents/` and attached to the proposal (default resume on accept) |
| `list_documents` | Document metadata only, never contents |
| `list_proposals` / `withdraw_proposal` | Pending proposals |
| `list_applications` | Jobs you filled or applied to, newest first, without answers. Filters: `status`, `since` (ISO date), `query` (role, company, URL, notes) |
| `get_application` | One application: status history, notes and the answers you gave |
| `update_application` | Status and/or notes only. Written directly (no proposal): it only touches `applications.json` |

There is also a prompt, `import_cv`, that walks the agent through importing a CV.

### Privacy model

- **The agent proposes, you approve.** Write tools add a *proposal* to `profile.json`.
  The extension shows "N changes proposed by &lt;agent&gt;" on Overview and in the side panel; the
  review screen is the same as for CV import (fill empty vs overwrite, per-field accept, edit).
  Accept applies it, reject deletes it.
- **Direct write is opt-in** and can only be turned on in the extension (Profile → AI agents →
  "Let agents write directly without review"). No tool can change it. When it is on, tools apply
  changes at once and say so.
- **Applications are written directly.** `update_application` changes only the status and notes of a
  record in `applications.json`, never the profile, so it skips the review step.
- **Reads are scoped.** Agents get only the sections they request. `answeronce-mcp` never opens
  `settings.json` (AI provider settings and API keys) and never returns document contents.
- **What an agent reads is sent to that agent's model provider** (Anthropic, OpenAI, Google,
  Cursor's or OpenCode's providers...) under their data policies. Ask for the least data the task needs.
- **Concurrency.** Agents and the extension check the `rev` of `profile.json` before writing. If you
  are editing in the extension while an agent writes, the extension reloads ("Your profile changed (agent
  or another window). Reloaded.") and keeps your unsaved edits, asking you only when both changed the
  same section. The extension also re-checks on window focus and before **Fill this page**.

### Setup

Open the **AI agents** page of the extension (options page → Settings → AI agents, or **Connect an
agent** on Overview and Agent proposals). No repository, build or terminal setup is needed: the
connector is packaged with the extension.

**Claude Desktop (recommended)**: click **Download AnswerOnce for Claude Desktop**, open the downloaded
`answeronce.mcpb`, click **Install** in Claude and choose your profile folder when Claude asks. On macOS,
Claude may ask for access to Documents (or wherever the folder is): click **Allow**. Claude Desktop
runs the server with the Node.js it ships with and passes the folder you chose as `ANSWERONCE_FOLDER`.

**Claude Code, Codex, Antigravity, OpenCode or Cursor**: click **Add the connector to your profile folder** (it writes
`.answeronce/answeronce-mcp.js` into the folder; click it again after updating AnswerOnce), paste the folder's
location (Finder: select it, Option+Cmd+C) and copy the snippet for your agent. The script finds
the profile folder from its own location, so no `init` and no `--folder` are needed:

```sh
# Claude Code
claude mcp add --transport stdio --scope user answeronce -- node /abs/path/to/profile-folder/.answeronce/answeronce-mcp.js
# Codex (writes ~/.codex/config.toml)
codex mcp add answeronce -- node /abs/path/to/profile-folder/.answeronce/answeronce-mcp.js
# Antigravity (writes ~/.gemini/config/mcp_config.json)
agy mcp add answeronce -- node /abs/path/to/profile-folder/.answeronce/answeronce-mcp.js
```

Or edit the config files directly:

```toml
# ~/.codex/config.toml
[mcp_servers.answeronce]
command = "node"
args = ["/abs/path/to/profile-folder/.answeronce/answeronce-mcp.js"]
```

```json
// ~/.cursor/mcp.json
{ "mcpServers": { "answeronce": { "type": "stdio", "command": "node", "args": ["/abs/path/to/profile-folder/.answeronce/answeronce-mcp.js"] } } }
```

```json
// Antigravity: ~/.gemini/config/mcp_config.json (global) or <workspace>/.agents/mcp_config.json
// (in the IDE: agent panel menu → MCP Servers → Manage MCP Servers → View raw config)
{ "mcpServers": { "answeronce": { "command": "node", "args": ["/abs/path/to/profile-folder/.answeronce/answeronce-mcp.js"] } } }
```

```json
// OpenCode: ~/.config/opencode/opencode.json (global) or opencode.json in the project root
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": { "answeronce": { "type": "local", "command": ["node", "/abs/path/to/profile-folder/.answeronce/answeronce-mcp.js"], "enabled": true } }
}
```

These need Node.js 22.13 or newer on the `PATH` the agent sees (the minimum of pdf.js, used for PDF
import; the rest runs on Node 20). Desktop apps don't see your shell `PATH`: with nvm or mise, use
the full path of `node` (`which node`), which the page's **Troubleshooting** section puts in the
snippets. The folder path and node path are saved in `settings.json` (`agentSetup`), never in
`profile.json`; settings files with the `projectPath` of older versions still load (it is dropped).

**How answeronce-mcp finds the profile folder**, first match wins:

1. `--folder <dir>` (or `--vault <dir>`)
2. the `ANSWERONCE_FOLDER` environment variable (what the Claude Desktop extension sets; the legacy
   `HIRE_FOLDER` still works)
3. the config written by `answeronce-mcp init --folder <dir>` (still supported):
   `~/Library/Application Support/answeronce/config.json` on macOS, `~/.config/answeronce/config.json` on Linux
   (`--config <file>` or `ANSWERONCE_MCP_CONFIG` override it). A config left by versions released as
   Hire (`.../hire/config.json`) is still read when the new one does not exist
4. the script's own location: `<folder>/.answeronce/answeronce-mcp.js` means `<folder>`

Errors say what to do: no folder found, a folder that does not exist (named by where it came from)
and macOS privacy blocks (`EPERM`: allow the app in System Settings → Privacy & Security → Files and
Folders). `answeronce-mcp status` shows which folder is used and why. To revoke agent access, remove the
server from your agent (Claude Desktop: Settings → Extensions) or delete `.answeronce/`.

**From a checkout** (developers):

```sh
pnpm install
pnpm build:mcp        # -> mcp/dist/answeronce-mcp.js (one minified file) and mcp/dist/answeronce.mcpb
pnpm validate:mcpb    # mcpb validate on the generated manifest
node mcp/dist/answeronce-mcp.js status --folder ~/answeronce
```

`answeronce.mcpb` is an [MCP Bundle](https://github.com/modelcontextprotocol/mcpb): a zip with
`manifest.json` (manifest version 0.2, server type `node`, a required `profile_folder` directory
setting passed as `ANSWERONCE_FOLDER`, the tool list read from the built server), `server/answeronce-mcp.js`
and `icon.png`. It is packed and validated with the pinned `@anthropic-ai/mcpb` CLI.

Try it: *"Import my CV at ~/Documents/cv.pdf into AnswerOnce"* or *"Add a saved answer to 'Why do you
want to join us?' based on my profile"*, then open AnswerOnce → **Agent proposals** to review.

## Ollama setup

Ollama rejects requests from browser extensions unless their origin is allowed:

```sh
# macOS (app): set it for launchd and restart Ollama
launchctl setenv OLLAMA_ORIGINS "chrome-extension://*"

# or when running the server manually
OLLAMA_ORIGINS="chrome-extension://*" ollama serve
```

Then pick **Ollama** in Profile → AI, grant the permission prompt, set the model (default
`llama3.2`) and click **Test provider**. Only `localhost:11434` / `127.0.0.1:11434` can be granted.

## Development

Requirements to build: Node 24+, pnpm 10, Chrome 116+. (The AI agent connector itself runs on Node 22.13+.)

```sh
pnpm install
pnpm build          # pnpm build:mcp, then wxt build: outputs .output/chrome-mv3
```

Development with hot reload: `pnpm dev` (WXT launches a Chrome instance with the extension loaded).

Other scripts: `pnpm test` (unit + an integration test that spawns the bundled MCP server over
stdio), `pnpm typecheck`, `pnpm zip`, `pnpm build:mcp` (see [Use with AI agents](#use-with-ai-agents)),
`pnpm validate:mcpb`, `pnpm test:e2e` (see below).

The landing site (`landing/`) serves the downloads: `pnpm landing:downloads` zips the extension and copies it
and `answeronce.mcpb` to `landing/public/downloads/` (gitignored), and `pnpm landing:build` does that and
then builds the site. Pushing a `v*` tag runs `.github/workflows/release.yml`, which attaches both files to
a GitHub Release.

`pnpm build`, `pnpm dev` and `pnpm zip` run `pnpm build:mcp` first: the extension ships the agent
connector as two packaged files, `answeronce.mcpb` (~0.9 MB) and `answeronce-mcp.js` (~3 MB, minified), which
add about 3.9 MB to the unpacked extension.

Load `.output/chrome-mv3` as described in [Install](#install). See [CONTRIBUTING.md](CONTRIBUTING.md) for
conventions, the privacy rules every change must keep, and how to add support for a new ATS.

### End-to-end tests

Playwright drives the built extension in Chromium (headless, one worker, a fresh browser profile
per test):

```sh
pnpm test:e2e        # pnpm build, then playwright test
pnpm test:e2e:only   # reuse the current .output/chrome-mv3 build
pnpm exec playwright test e2e/overlay.spec.ts --headed   # one file, visible browser
```

The tests use Playwright's bundled Chromium (`channel: 'chromium'`; the headless shell cannot load
extensions). If it is not installed yet: `pnpm exec playwright install chromium`.

| Spec | Covers |
| --- | --- |
| `e2e/storage.spec.ts` | `profile.json` is plain, readable JSON in the folder and `settings.json` holds the AI settings; `chrome.storage.local` and IndexedDB hold no personal data; the session caches the profile and a new session reloads it; one-time import of data from older versions |
| `e2e/fill.spec.ts` | Greenhouse, Lever and Ashby fixtures filled from the panel (`sidepanel.html?tabId=`), field by field |
| `e2e/overlay.spec.ts` | Arc flow: in-page panel, target-page chip, filling under a strict CSP, toggling, remembered side panel failure, framing by other pages refused |
| `e2e/consent.spec.ts` | Consent checkboxes, selects and e-signatures (EN/ES) are never filled and are listed under "Left to you" |
| `e2e/cv-import.spec.ts` | DOCX with basic extraction; PDF structured by a stub Ollama, reviewed and saved; the original file copied to `documents/` as default resume |
| `e2e/applications.spec.ts` | Fill on a fixture records the job; Mark as applied snapshots the answers without the consent box or the attached file; edit role, search, filter, status, notes and delete on the Applications page; "You already applied here" on reopening the same posting with tracking parameters; `applications.json` is plain JSON separate from `profile.json` |
| `e2e/agent-setup.spec.ts` | AI agents page: the Claude Desktop download link points to the packaged `answeronce.mcpb` (a zip) and downloads it; "Add the connector" writes `.answeronce/answeronce-mcp.js` into the folder; the pasted folder path fills the Claude Code, Codex, Antigravity, OpenCode and Cursor snippets (node path under Troubleshooting); both are saved in `settings.json` and reloaded in a new session; "Connect an agent" from the empty Agent proposals page |
| `e2e/agent-proposals.spec.ts` | A proposal written by a simulated agent (shared application code on the OPFS folder) shows as a banner in the options page and side panel; review and accept, reject; direct write + reload on focus keeping unsaved edits |

Shared setup lives in `e2e/support/` (`fixtures.ts` is the Playwright fixture, `answeronce.ts` the
helpers). The tests never touch `.output/chrome-mv3`: each run copies it to `e2e/.extension/`
(gitignored) and patches only the copy. What is substituted and why:

- **Directory picker → Origin Private File System.** The native folder picker cannot be automated,
  so extension pages get an OPFS directory from `showDirectoryPicker()`. It is a real
  `FileSystemDirectoryHandle`, so the folder code runs unchanged, and the tests read the files back
  from it.
- **`activeTab` → `host_permissions: ["http://localhost/*"]`.** `activeTab` is only granted by a real
  click on the toolbar icon. Fixture pages and the stub Ollama server are served from localhost.
- **Side panel → Arc behavior.** `chrome.sidePanel.open()` is stubbed to never settle (as in Arc,
  which exposes the API but never shows the panel), and the toolbar click listener is captured so
  a test can dispatch the click from the service worker. The background then falls back to the
  in-page panel, which is what the overlay tests check. Fill tests open the panel page in its own
  tab, bound to the job tab with `?tabId=`.
- **Ollama → a local stub** that answers `/api/chat` with fixed JSON and records the requests.

Fixture pages (`tests/fixtures/*.html`) are served with
`Content-Security-Policy: default-src 'self'; frame-src 'self'`.

## Architecture

Hexagonal ("ports and adapters"), with the folder structure screaming what the app does:

```
src/
  domain/           Pure business rules: profile schema (zod, versioned + migration), field
                    descriptors, EN/ES synonym dictionary, value resolution, option picking, answer
                    memory, LLM prompts, CV extraction parsing/fallback, CV merge, completeness,
                    applications (URL normalization, duplicates, status transitions, answer
                    snapshots), job metadata (company/role from page text)
  application/      Use cases: createProfile, openProfile, saveProfile (revision check),
                    syncSession, inspectFolder, add/remove/readDocument, one-time legacy import,
                    setDefaultResume, planFill + fillPage, generateAnswer, rememberAnswer, readCvText,
                    extractProfileFromCv, saveCvImport, agent proposals (submitChanges,
                    importCvDocument, acceptProposal, discardProposal, setAgentDirectWrite),
                    applications (applications.json with revision check, recordFilledPage,
                    markApplied, recordAnswer, updateApplication, describeJob, snapshotPage)
  ports/            Interfaces: VaultStorage (the folder), SessionStore, LlmProvider (text/JSON),
                    DocumentTextExtractor, AtsAdapter, PageGateway
  infrastructure/
    vault/          Folder storage: FsaVaultStorage (File System Access API), NodeVaultStorage (atomic writes),
                    directory handle store (IndexedDB)
    session/        ChromeSessionStore (chrome.storage.session), MemorySessionStore
    llm/            ollama, openai, gemini, claude (plain fetch, no SDKs, native JSON mode)
    text-extraction/ pdf (pdf.js, lazy; legacy build in Node), docx (mammoth, lazy), plain text
    ats/            greenhouse, lever, ashby, generic adapters (field tables, company/role)
    page/           ScriptingPageGateway (chrome.scripting)
  page-agent/       Code that runs inside the job page: detector, label resolution, filler
  ui/               React: options app shell (hash routes), CV import flow, side panel, shared
                    components/toasts, plain-CSS design system (ui/shared/styles), composition root
  entrypoints/      Thin WXT entrypoints (background, options, sidepanel, page-agent)
mcp/
  src/              answeronce-mcp: CLI (init/status), MCP server and tools (stdio), config, profile
                    folder resolution (--folder, ANSWERONCE_FOLDER, config, script location) and access
                    (never settings.json or .answeronce/). Imports src/ directly; no copied logic
  build.ts          esbuild bundle -> mcp/dist/answeronce-mcp.js, packed with manifest + icon -> answeronce.mcpb
```

### Page injection

`chrome.scripting.executeScript` serializes `func`, so it cannot use imports or closures. AnswerOnce
uses a two-step approach:

1. `executeScript({ target: { tabId, allFrames: true }, files: ['/page-agent.js'] })` installs a
   bundled, idempotent agent (`src/entrypoints/page-agent.ts`) exposing
   `globalThis.__answeronceAgent = { scan, apply }` in the extension's isolated world of every accessible frame.
2. `executeScript({ target, func: (ins, opts) => globalThis.__answeronceAgent.apply(ins, opts), args })`
   calls it with JSON arguments. Scanning returns one result per frame, so filling is targeted
   per `frameId`.

### Matching pipeline

`ATS adapter` (deterministic name/id tables for Greenhouse, Lever, Ashby) → `synonym rules`
(normalized, accent-insensitive EN + ES phrases, `autocomplete` tokens, name/id words) →
`saved answers` (fuzzy label similarity: max of bigram Dice and token Jaccard) → `unmatched`
(left for you or the AI).

### Filling

- Text inputs/textareas: native prototype value setter + bubbling `input` and `change` events
  (works with React/Vue-controlled inputs).
- Selects, radio groups and checkbox groups: option matched by normalized text/value.
- Yes/no questions: radios, selects or single checkboxes.
- File inputs: the CV file from `documents/` is attached via `DataTransfer` → `input.files` + `change`.
- Custom comboboxes (react-select style): best effort (open, type, pick `[role=option]`), reported
  as failed if no option appears.
- Fields with a value are never overwritten unless you choose "Overwrite".

## Known limitations

- `activeTab` access is lost when the tab navigates to another origin; click the toolbar icon
  again on the new page.
- Embedded ATS iframes need the optional ATS host permission (button in the side panel).
- Your data is stored as plain files: anyone with access to the folder (other users, backup or
  sync services, programs running as you) can read it. AnswerOnce does not protect the files themselves.
- The loaded profile is cached in `chrome.storage.session` (memory) for the browser session; anyone
  with access to your open browser profile can use the extension meanwhile.
- `profile.json` is validated on every read. A hand edit that breaks the JSON or the schema is
  reported, and AnswerOnce does not load the profile until you fix or restore the file.
- Comboboxes, multi-step forms and dynamically rendered sections may need a second click on
  **Fill this page**.
- CV import: no OCR for scanned PDFs, legacy `.doc` is not supported, PDFs with exotic CID fonts
  may extract poorly (pdf.js CMaps are not bundled), and only the first 20 pages / 30,000
  characters are used. Local models via Ollama may need a large context; AnswerOnce requests 16k tokens.

- Application tracking: the answers snapshot is what the page shows when you click **Mark as
  applied**, so for multi-step forms it only holds the current step (earlier steps are kept from the
  fill). Company and role detection on non-ATS sites is a guess; edit it in the panel.
- AI agents (`answeronce-mcp`): the revision check happens right before each write, but there is no
  file lock, so two writers saving within the same few milliseconds can still race (last one wins).
  `import_cv_file` can read any PDF/DOCX/TXT/MD file your user can read, if the agent asks for it.
  The agent's model provider sees what the tools return.

## Roadmap

- Workday (multi-step wizard, `data-automation-id` fields)
- iCIMS, Taleo, SmartRecruiters, Workable, Personio
- Experience/education list filling (repeatable sections)
- Per-site answer memory and confidence review before filling
- Export/backup of the profile folder

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first, and follow the
[code of conduct](CODE_OF_CONDUCT.md). To report a vulnerability, see [SECURITY.md](SECURITY.md).

## License

AnswerOnce is free software under the [GNU Affero General Public License v3.0](LICENSE)
(`AGPL-3.0-only`). You can use, study, modify and share it. If you distribute a modified version,
or offer it to others over a network, you must publish its complete source code under the same
license.

The name "AnswerOnce" and the parrot logo are not covered by the code license: see
[TRADEMARKS.md](TRADEMARKS.md). Contributors sign the [CLA](CLA.md) once, on their first pull
request. Bundled third-party packages and their licenses are listed in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
