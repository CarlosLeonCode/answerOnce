import { expect, test } from './support/fixtures';
import { focusPage, SimulatedAgent } from './support/agent';
import { ADA } from './support/profile';

// An AI agent (answeronce-mcp) writes to the same profile.json. By default it only
// adds proposals, which the user reviews in the extension.

const RELOADED = 'Your profile changed (agent or another window). Reloaded.';

test('an agent proposal appears as a banner; review and accept updates the profile', async ({ answeronce }) => {
  const options = await answeronce.setUpFolderWithProfile();
  const agent = await SimulatedAgent.connect(options);
  const result = await agent.submit({
    summary: 'Add headline, skills and new phone',
    changes: { headline: 'Analytical Engine Architect', skills: { add: ['TypeScript', 'Rust'] }, personal: { phone: '+44 20 0000 0001' } },
  });
  expect(result.status).toBe('proposed');

  await focusPage(options);
  await expect(options.getByText(RELOADED)).toBeVisible();
  await options.getByRole('navigation').getByRole('button', { name: 'Overview' }).click();
  const banner = options.getByRole('region', { name: 'Agent proposals' });
  await expect(banner.getByText('4 changes proposed by Claude Code')).toBeVisible();

  // The side panel shows it too.
  const panel = await answeronce.context.newPage();
  await panel.goto(answeronce.url('sidepanel.html'));
  await expect(panel.getByRole('region', { name: 'Agent proposals' }).getByText('4 changes proposed by Claude Code')).toBeVisible();
  await panel.close();

  await banner.getByRole('button', { name: 'Review changes' }).click();
  await expect(options.getByRole('heading', { name: 'Add headline, skills and new phone' })).toBeVisible();
  await options.getByRole('button', { name: 'Review', exact: true }).click();
  await expect(options.getByText('Proposed by Claude Code', { exact: false })).toBeVisible();
  await expect(options.getByLabel('Phone proposed')).toHaveValue('+44 20 0000 0001');
  await options.getByRole('button', { name: 'Accept 4 changes' }).click();
  await expect(options.getByText('Proposal accepted')).toBeVisible({ timeout: 30_000 });
  await expect(options.getByText('No pending proposals')).toBeVisible();

  const profile = (await answeronce.session())!.profile;
  expect(profile.headline).toBe('Analytical Engine Architect');
  expect(profile.skills).toEqual(['TypeScript', 'Rust']);
  expect(profile.personal.phone).toBe('+44 20 0000 0001');
  expect(profile.personal.email).toBe(ADA.email);
  expect(profile.agentProposals).toEqual([]);

  const onDisk = JSON.parse((await answeronce.folderFiles()).find((f) => f.name === 'profile.json')!.text) as Record<string, unknown>;
  expect(onDisk).toMatchObject({ rev: (await answeronce.session())!.revision, headline: 'Analytical Engine Architect', agentProposals: [] });
});

test('rejecting a proposal removes it without touching the profile', async ({ answeronce }) => {
  const options = await answeronce.setUpFolderWithProfile();
  const agent = await SimulatedAgent.connect(options);
  await agent.submit({ client: 'Cursor', summary: 'Rename me', changes: { personal: { firstName: 'Augusta' } } });

  await focusPage(options);
  await options.getByRole('navigation').getByRole('button', { name: /Agent proposals/ }).click();
  const card = options.getByRole('region', { name: 'Proposal from Cursor' });
  await expect(card.getByText('Rename me')).toBeVisible();
  await card.getByRole('button', { name: 'Reject' }).click();
  await expect(options.getByText('Proposal rejected')).toBeVisible({ timeout: 30_000 });
  await expect(options.getByText('No pending proposals')).toBeVisible();

  const profile = (await answeronce.session())!.profile;
  expect(profile.agentProposals).toEqual([]);
  expect(profile.personal.firstName).toBe(ADA.firstName);
});

test('with direct write on, agent changes are reloaded on focus and unsaved edits are kept', async ({ answeronce }) => {
  const options = await answeronce.setUpFolderWithProfile();
  const nav = options.getByRole('navigation');

  // Direct write can only be turned on here, in the extension.
  await nav.getByRole('button', { name: 'AI agents' }).click();
  await options.getByRole('switch', { name: 'Let agents write directly without review' }).click();
  await expect(options.getByText('Agents can now write directly')).toBeVisible({ timeout: 30_000 });
  expect((await answeronce.session())!.profile.agents.directWrite).toBe(true);

  // An unsaved edit in progress...
  await nav.getByRole('button', { name: 'Summary & skills' }).click();
  await options.getByLabel('Summary', { exact: true }).fill('My unsaved summary');
  const revisionBefore = (await answeronce.session())!.revision;

  // ...while an agent writes directly to profile.json.
  const agent = await SimulatedAgent.connect(options);
  expect(await agent.submit({ summary: 'Headline', changes: { headline: 'Countess of Computing' } })).toMatchObject({ status: 'applied' });

  await focusPage(options);
  await expect(options.getByText(RELOADED)).toBeVisible();
  await expect(options.getByText('Your unsaved edits were kept.')).toBeVisible();
  await expect(options.getByLabel('Headline', { exact: true })).toHaveValue('Countess of Computing');
  await expect(options.getByLabel('Summary', { exact: true })).toHaveValue('My unsaved summary');
  expect((await answeronce.session())!.revision).toBe(revisionBefore + 1);

  await options.getByRole('button', { name: 'Save changes' }).click();
  await expect(options.getByText('Changes saved')).toBeVisible({ timeout: 30_000 });
  const profile = (await answeronce.session())!.profile;
  expect(profile).toMatchObject({ headline: 'Countess of Computing', summary: 'My unsaved summary' });
});

test('when an agent and the user change the same section, the user chooses', async ({ answeronce }) => {
  const options = await answeronce.setUpFolderWithProfile();
  const nav = options.getByRole('navigation');
  await nav.getByRole('button', { name: 'AI agents' }).click();
  await options.getByRole('switch', { name: 'Let agents write directly without review' }).click();
  await expect(options.getByText('Agents can now write directly')).toBeVisible({ timeout: 30_000 });

  await nav.getByRole('button', { name: 'Summary & skills' }).click();
  await options.getByLabel('Headline', { exact: true }).fill('Mine');
  const agent = await SimulatedAgent.connect(options);
  await agent.submit({ summary: 'Headline', changes: { headline: 'Theirs' } });

  await focusPage(options);
  const alert = options.getByRole('alert').filter({ hasText: 'Your profile changed while you were editing' });
  await expect(alert).toContainText('Headline');
  await expect(options.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  await alert.getByRole('button', { name: 'Re-apply my edits' }).click();
  await expect(options.getByLabel('Headline', { exact: true })).toHaveValue('Mine');
  await options.getByRole('button', { name: 'Save changes' }).click();
  await expect(options.getByText('Changes saved')).toBeVisible({ timeout: 30_000 });
  expect((await answeronce.session())!.profile.headline).toBe('Mine');
});
