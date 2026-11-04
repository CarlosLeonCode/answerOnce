import { describe, expect, it } from 'vitest';
import { rebaseDraft } from '../../src/domain/draft-rebase';
import { sampleProfile } from '../helpers/dom';

describe('rebasing an unsaved draft onto a newer vault version', () => {
  const base = sampleProfile();

  it('keeps the user edits and takes untouched sections from the vault', () => {
    const draft = { ...base, headline: 'Edited by me' };
    const incoming = { ...base, summary: 'Written by an agent', agentProposals: [] };
    const r = rebaseDraft(base, draft, incoming);
    expect(r.conflicts).toEqual([]);
    expect(r.dirty).toBe(true);
    expect(r.mine).toMatchObject({ headline: 'Edited by me', summary: 'Written by an agent' });
  });

  it('reports sections changed on both sides', () => {
    const draft = { ...base, personal: { ...base.personal, phone: '1' } };
    const incoming = { ...base, personal: { ...base.personal, phone: '2' } };
    const r = rebaseDraft(base, draft, incoming);
    expect(r.conflicts).toEqual(['personal']);
    expect(r.mine.personal.phone).toBe('1');
    expect(r.theirs.personal.phone).toBe('2');
  });

  it('is clean when both sides made the same change, and always takes vault-managed sections', () => {
    const draft = { ...base, headline: 'Same', documents: [] };
    const incoming = { ...base, headline: 'Same', agents: { directWrite: true } };
    const r = rebaseDraft(base, draft, incoming);
    expect(r).toMatchObject({ conflicts: [], dirty: false });
    expect(r.mine.documents).toEqual(base.documents);
    expect(r.mine.agents.directWrite).toBe(true);
  });
});
