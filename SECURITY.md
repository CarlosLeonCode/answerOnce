# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately, not in a public issue:

1. Go to [Security → Report a vulnerability](https://github.com/CarlosLeonCode/answeronce/security/advisories/new)
   (GitHub private vulnerability reporting).
2. Describe the issue, the affected component and version or commit, and steps to reproduce.
   Use fictional data; never include a real profile, CV or API key.

You will get an acknowledgement within a few days. Once a fix is available it is released and the
advisory is published, with credit if you want it.

## Scope

- **The browser extension** (`src/`): for example a web page reading profile data it was not
  given, filling or submitting something without a user action, code injected beyond the active tab,
  consent fields being filled, or data sent anywhere other than the LLM provider the user chose.
- **`answeronce-mcp`** (`mcp/`, also packaged as `answeronce.mcpb`): for example reading `settings.json`,
  writing outside the profile folder, or bypassing the proposal/review flow.
- **The landing site** (`landing/`).

## Out of scope

AnswerOnce stores your data **unencrypted, by design**: `profile.json`, `settings.json` (including your
AI provider API key), `applications.json` and `documents/` are plain files in a folder you pick.
Threats that require local access to that folder or to your unlocked browser profile (other users
or programs running as you, backup or sync services, malware) are out of scope. Protect the folder
with your operating system's permissions and disk encryption.

Also out of scope: what your chosen LLM provider or AI agent's model provider does with the data
you send it, and issues in third-party dependencies that do not affect AnswerOnce (report those
upstream).
