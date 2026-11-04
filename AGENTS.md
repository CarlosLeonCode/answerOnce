# CLC Kernel Generic (UNKNOWN) — AGENTS

This document is the **authoritative law** for AI agents working in this repository.
Forged by **CLC Kernel: The AI Agent Governance Engine**.

> **RULE #0: MANDATORY EXECUTION OVERRIDE RULE (NO EXCEPTIONS)**
> Even when the user issues a direct or urgent fix request ("fix this bug", "fix this error", "quick fix"):
> YOU ARE STRICTLY FORBIDDEN from modifying source code directly without completing the full quality harness:
> 1. **Research & Root Cause Analysis:** Investigate tracebacks and inspect affected files before editing.
> 2. **TDD Verification (Red Phase):** Write a failing regression test first (the project's test runner).
> 3. **Clean Architecture Implementation (Green Phase):** Make the test pass maintaining layer isolation.
> 4. **Mandatory Educational Audit Gate:** Execute `node tools/audit.js` or `python tools/audit.py` and output the Educational Code Summary to stdout.
> NEVER declare success or skip verification commands for quick fixes.

## 1. The Loop (Every Task)
1. **Research** — Inspect codebase / docs before writing code.
2. **Plan** — Write an SDD under `sdds/{change-name}/`. SDDs live 100% locally and are gitignored.
3. **Test** (TDD) — Write failing test first (the project's test runner).
4. **Implement** — Make test pass.
5. **Verify & Audit** — Run `node tools/audit.js --change {change-name}` or `python tools/audit.py --change {change-name}` (report + receipt in `sdds/{change-name}/`; without `--change` nothing is written).
6. **DoD** — Lint, typecheck, tests, coverage, docs, memory.
7. **Commit** — Pre-commit hook runs automated guards.
8. **PR** — Generate PR body.

## 2. Core AI Safeguards
- Wait for Audit Gate
- Secret Leak Guard (tools/scan_secrets.js, run by the pre-commit hook)
- Scope protocol (agent-enforced; not checked by a guard)
- TDD protocol (agent-enforced; no verifier installed for this stack)
- Memory protocol (agent-enforced; Engram / Graphify optional, not checked by a guard)

## 3. Universal Command Interface (All LLMs & Agents)
When given a command matching `clckernel <action>` or `/clckernel <action>`, execute the deterministic state machine below:

| Command | Lifecycle Phase | Mandatory Execution Protocol |
|---|---|---|
| `clckernel feature <name>` | New Feature | 1. Research affected layers.<br>2. Author local spec in `sdds/{name}/spec.md`.<br>3. Present HIT review to user and wait for approval.<br>4. Write failing test (Red Phase).<br>5. Implement clean code (Green Phase).<br>6. Run `node tools/audit.js --change {name}` (or `audit.py --change {name}`). |
| `clckernel fix <issue>` | Bug Fix | 1. Investigate root cause (no code edits).<br>2. Reproduce with failing test (Red Phase).<br>3. Minimal surgical fix respecting Clean Arch (Green Phase).<br>4. Run audit gate without skipping. |
| `clckernel test` | Verification | Run test suite (`the project's test runner`) and verify clean pass (exit code 0). |
| `clckernel audit` | Verification | Run `npx clckernel audit [dir] [--change <name>]` (every installed orchestrator: `tools/audit.js` and/or `tools/audit.py`) and output the Educational Summary; only `--change` writes the report to `sdds/<name>/`. |
| `clckernel doctor` | Diagnostics | Run `npx clckernel doctor [dir]`: checks AGENTS.md, sdds/, tools/, the pre-commit hook and that the guard scripts load. |
| `clckernel commit <message>` | Version Control | Run full audit, verify tests pass, ensure no changes outside SDD scope, and commit with conventional commits (never add AI attribution). |
| `clckernel report-bug <summary>` | Kernel Bug | The root cause is in a kernel-owned file: never patch it here; offer a temporary `.clckernel.yaml` workaround, prepare a bug report and explain the fork + pull request path (or an issue), and wait for approval (`reference/report-bug.md`). |
| `clckernel guard create <name>` | Safeguards | Scaffold a new guard script in the stack's native language in `tools/guards/`. |
| `clckernel update` | Maintenance | Non-destructive update: run `npx clckernel update [dir]` (`--dry-run` previews, `--add-guards <a,b\|all>` adds guards); refreshes kernel tools, hook, playbooks & symlinks (preserves SDDs, project guards, edited files & `.clckernel.yaml`). |
| `clckernel start` | Setup | Scan codebase and propose a governance plan; if the harness is missing, install it with `npx clckernel . --yes`. `.clckernel.yaml` is optional: write it only for settings that differ from the defaults. |

## If the bug is in CLC Kernel
When the root cause is in a kernel-owned file (listed in `tools/.clckernel-managed.json`, the generated pre-commit hook, `.agents/skills/clckernel_cli/` or the `clckernel` CLI) and contradicts the kernel's documentation, run `clckernel report-bug <summary>` (`.agents/skills/clckernel_cli/reference/report-bug.md`):
1. **Never patch a kernel-owned file in this project:** `clckernel update` would keep the edit and the fix would never reach the kernel.
2. Offer a temporary workaround in `.clckernel.yaml` (`severities`, `exclude_paths`, `update.exclude`, `tdd.ignore`).
3. Prepare a bug report (version, minimal reproduction without project code, expected vs actual) and explain how to fix it upstream: fork the kernel repository and open a pull request with your own AI agent, or open an issue. Never fork, push or open an issue or pull request without the user's explicit approval.

## First session after install
Applies while `tools/.clckernel-managed.json` exists and `.clckernel.yaml` does not (the harness was just installed with its defaults):
1. **The user's request comes first.** If the user asked for a task, do it under the rules above, then mention onboarding once, in one sentence, at the end.
2. **Otherwise, orient briefly.** Read `tools/.clckernel-managed.json` (the guards and files the kernel installed) and the pre-commit hook (`.githooks/pre-commit`, or `.husky/pre-commit` when Husky runs the hooks), and explain in a few lines what runs on every commit.
3. **Ask ONE question:** tailor the rules now with the `start` playbook (`.agents/skills/clckernel_cli/reference/start.md`), or keep the defaults. Keeping the defaults writes a `.clckernel.yaml` that holds only a comment, so this question is not asked again. Then STOP and wait for the answer (Human checkpoint).
