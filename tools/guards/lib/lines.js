/**
 * Shared by the project guards: the lines a change adds to a file, with their line numbers.
 * Lives in lib/ so the audit does not run it as a guard (it runs every tools/guards/*.js).
 * Same snapshot as tools/_changes: the index (staged) or the last commit.
 */
const { execFileSync } = require('child_process');
const { readFile } = require('../../_changes');

/**
 * @param {string} dir - Repository root
 * @param {string} file - Path relative to the root
 * @param {'staged'|'last-commit'} mode - Snapshot (from changedFiles)
 * @returns {{ line: number, text: string }[]} Added lines; every line when there is no parent to diff against
 */
function addedLines(dir, file, mode) {
  const range = mode === 'staged' ? ['--cached'] : ['HEAD~1', 'HEAD'];
  let out;
  try {
    out = execFileSync('git', ['diff', ...range, '-U0', '--no-color', '--no-ext-diff', '--', file], {
      cwd: dir,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    // Root commit: the whole file is new.
    const content = readFile(dir, file, mode) || '';
    return content.split('\n').map((text, i) => ({ line: i + 1, text }));
  }
  const lines = [];
  let next = 0;
  for (const row of out.split('\n')) {
    const hunk = row.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) next = Number(hunk[1]);
    else if (row.startsWith('+') && !row.startsWith('+++')) lines.push({ line: next++, text: row.slice(1) });
  }
  return lines;
}

/** Prints the standard guard result and exits with its code. */
function report(name, lens, violations, okMessage) {
  const exitCode = violations.length > 0 ? 1 : 0;
  const message = exitCode ? `${violations.length} violation(s)` : okMessage;
  console.log(JSON.stringify({ exitCode, skipped: false, name, lens, data: { message, violations } }));
  process.exit(exitCode);
}

module.exports = { addedLines, report };
