import { expect, test } from './support/fixtures';

// The AI agents page: Claude Desktop gets a download of the packaged answeronce.mcpb;
// developer tools get the connector written into the profile folder and
// snippets built from the one path the user pastes. That path is kept in
// settings.json (never in profile.json, which agents read).

const PROFILE = '/Users/ada/AnswerOnce Profile';
const NODE = '/Users/ada/.nvm/versions/node/v24.1.0/bin/node';

test('Claude Desktop download, connector in the folder and snippets from the folder path', async ({ answeronce }) => {
  const options = await answeronce.setUpFolder();
  await options.getByRole('button', { name: 'Skip, fill manually' }).click();

  // The empty Agent proposals page links here.
  await options.getByRole('navigation').getByRole('button', { name: 'Agent proposals' }).click();
  await options.getByRole('button', { name: 'Connect an agent' }).click();
  await expect(options).toHaveURL(/options\.html#\/agents$/);
  await expect(options.getByRole('heading', { name: 'AI agents', level: 1 })).toBeVisible();

  // Claude Desktop: a download of the bundle packaged with the extension.
  const download = options.getByRole('link', { name: 'Download AnswerOnce for Claude Desktop' });
  await expect(download).toHaveAttribute('href', `chrome-extension://${answeronce.extensionId}/answeronce.mcpb`);
  await expect(download).toHaveAttribute('download', 'answeronce.mcpb');
  const bundle = await options.evaluate(async (href) => {
    const bytes = new Uint8Array(await (await fetch(href)).arrayBuffer());
    return { size: bytes.length, zip: bytes[0] === 0x50 && bytes[1] === 0x4b };
  }, (await download.getAttribute('href'))!);
  expect(bundle.zip).toBe(true);
  expect(bundle.size).toBeGreaterThan(100_000);
  const [file] = await Promise.all([options.waitForEvent('download'), download.click()]);
  expect(file.suggestedFilename()).toBe('answeronce.mcpb');
  await expect(options.getByText('Choose your profile folder — it\'s the folder named “answeronce”.')).toBeVisible();

  // Developer tools: collapsed until opened, no project path or build step anywhere.
  const addConnector = options.getByRole('button', { name: 'Add the connector to your profile folder' });
  await expect(addConnector).toBeHidden();
  await options.getByText('Claude Code, Codex, Antigravity, OpenCode or Cursor', { exact: true }).click();
  await expect(options.getByText(/pnpm|build:mcp|answeronce-mcp init|project folder/i)).toHaveCount(0);

  await addConnector.click();
  await expect(options.getByText('Connector added to your profile folder.', { exact: false })).toBeVisible({ timeout: 30_000 });
  const connector = (await answeronce.folderFiles()).find((f) => f.name === '.answeronce/answeronce-mcp.js');
  expect(connector?.size).toBeGreaterThan(100_000);
  expect(connector!.text.startsWith('#!/usr/bin/env node')).toBe(true);

  // Snippets need only the folder path. Placeholders until it is pasted.
  const claudeCode = options.getByLabel('Claude Code command', { exact: true });
  await expect(claudeCode).toHaveText('claude mcp add --transport stdio --scope user answeronce -- node /path/to/answeronce/.answeronce/answeronce-mcp.js');

  await options.getByLabel('Profile folder location').fill(PROFILE);
  await expect(claudeCode).toHaveText(`claude mcp add --transport stdio --scope user answeronce -- node '${PROFILE}/.answeronce/answeronce-mcp.js'`);
  // The pasted folder is named differently from the one picked in AnswerOnce ("answeronce").
  await expect(options.getByText('This path ends in “AnswerOnce Profile”, but your profile folder is named “answeronce”.', { exact: false })).toBeVisible();

  await options.getByRole('tab', { name: 'Codex' }).click();
  await expect(options.getByLabel('Codex command', { exact: true })).toHaveText(`codex mcp add answeronce -- node '${PROFILE}/.answeronce/answeronce-mcp.js'`);
  await expect(options.getByLabel('Codex config', { exact: true })).toHaveText(`[mcp_servers.answeronce]\ncommand = "node"\nargs = ["${PROFILE}/.answeronce/answeronce-mcp.js"]`);

  await options.getByRole('tab', { name: 'Antigravity' }).click();
  await expect(options.getByLabel('Antigravity command', { exact: true })).toHaveText(`agy mcp add answeronce -- node '${PROFILE}/.answeronce/answeronce-mcp.js'`);
  const antigravity = JSON.parse((await options.getByLabel('Antigravity config', { exact: true }).textContent())!) as unknown;
  expect(antigravity).toEqual({ mcpServers: { answeronce: { command: 'node', args: [`${PROFILE}/.answeronce/answeronce-mcp.js`] } } });

  await options.getByRole('tab', { name: 'OpenCode' }).click();
  const opencode = JSON.parse((await options.getByLabel('OpenCode config', { exact: true }).textContent())!) as unknown;
  expect(opencode).toEqual({
    $schema: 'https://opencode.ai/config.json',
    mcp: { answeronce: { type: 'local', command: ['node', `${PROFILE}/.answeronce/answeronce-mcp.js`], enabled: true } },
  });

  // The node path lives under Troubleshooting.
  await options.getByText('Troubleshooting').click();
  await options.getByLabel('Node path').fill(NODE);
  await options.getByRole('tab', { name: 'Cursor' }).click();
  const cursor = JSON.parse((await options.getByLabel('Cursor config', { exact: true }).textContent())!) as unknown;
  expect(cursor).toEqual({ mcpServers: { answeronce: { type: 'stdio', command: NODE, args: [`${PROFILE}/.answeronce/answeronce-mcp.js`] } } });

  await options.getByRole('button', { name: 'Save changes' }).click();
  await expect(options.getByText('Changes saved')).toBeVisible({ timeout: 30_000 });

  const agentSetup = { profileFolder: PROFILE, nodePath: NODE };
  const files = await answeronce.folderFiles();
  const settings = JSON.parse(files.find((f) => f.name === 'settings.json')!.text) as Record<string, unknown>;
  expect(settings.agentSetup).toEqual(agentSetup);
  expect(files.find((f) => f.name === 'profile.json')!.text).not.toContain(PROFILE);

  // Reloaded from the folder in a new session; the connector is still found.
  await answeronce.clearSession();
  await options.reload();
  await options.getByText('Claude Code, Codex, Antigravity, OpenCode or Cursor', { exact: true }).click();
  await expect(options.getByLabel('Profile folder location')).toHaveValue(PROFILE, { timeout: 30_000 });
  await options.getByText('Troubleshooting').click();
  await expect(options.getByLabel('Node path')).toHaveValue(NODE);
  await expect(options.getByText('Connector added to your profile folder.', { exact: false })).toBeVisible();
  expect((await answeronce.session())!.profile.agentSetup).toEqual(agentSetup);
});
