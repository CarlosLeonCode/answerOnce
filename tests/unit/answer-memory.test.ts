import { describe, expect, it } from 'vitest';
import { findSavedAnswer, labelSimilarity, upsertAnswer } from '../../src/domain/answer-memory';
import type { SavedAnswer } from '../../src/domain/profile';

const answers: SavedAnswer[] = [
  { id: '1', label: 'Why do you want to work here?', answer: 'Because…', updatedAt: '' },
  { id: '2', label: 'How did you hear about us?', answer: 'LinkedIn', updatedAt: '' },
  { id: '3', label: '¿Por qué quieres trabajar con nosotros?', answer: 'Porque…', updatedAt: '' },
  { id: '4', label: 'Years of experience with TypeScript', answer: '8', updatedAt: '' },
];

describe('answer memory', () => {
  it('matches identical labels regardless of case, accents and punctuation', () => {
    expect(labelSimilarity('How did you hear about us?', 'how did you hear about us')).toBe(1);
    expect(findSavedAnswer('POR QUE QUIERES TRABAJAR CON NOSOTROS', answers)?.answer.id).toBe('3');
  });

  it('matches paraphrased labels', () => {
    expect(findSavedAnswer('How did you hear about this job?', answers)?.answer.id).toBe('2');
    expect(findSavedAnswer('Why do you want to work at Acme?', answers)?.answer.id).toBe('1');
    expect(findSavedAnswer('How many years of experience do you have with TypeScript?', answers)?.answer.id).toBe('4');
  });

  it('does not match unrelated questions', () => {
    expect(findSavedAnswer('What is your favourite programming language?', answers)).toBeNull();
    expect(findSavedAnswer('Expected start date', answers)).toBeNull();
  });

  it('upserts by normalized label', () => {
    const updated = upsertAnswer(answers, 'how did you hear about us', 'A friend', 'new', 'now');
    expect(updated).toHaveLength(answers.length);
    expect(updated.find((a) => a.id === '2')).toMatchObject({ answer: 'A friend', updatedAt: 'now' });
    const added = upsertAnswer(answers, 'Do you have a driving licence?', 'Yes', 'new', 'now');
    expect(added).toHaveLength(answers.length + 1);
  });
});
