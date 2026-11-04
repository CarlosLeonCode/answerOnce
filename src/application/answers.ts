import { upsertAnswer } from '../domain/answer-memory';
import { newId, type Profile } from '../domain/profile';
import { buildAnswerPrompt } from '../domain/prompt';
import type { LlmProvider } from '../ports/llm-provider';
import type { ProfileSession } from '../ports/session-store';
import { saveProfile, NotConnectedError, type VaultDeps } from './vault';

/** Asks the configured LLM to draft an answer. The user reviews it before use. */
export async function generateAnswer(
  llm: LlmProvider,
  input: { question: string; jobDescription: string; profile: Profile },
  signal?: AbortSignal,
): Promise<string> {
  return llm.complete(buildAnswerPrompt(input.question, input.jobDescription, input.profile), { signal });
}

/** Stores a label -> answer pair in the profile (answer memory). */
export async function rememberAnswer(deps: VaultDeps, label: string, answer: string): Promise<ProfileSession> {
  const session = await deps.session.get();
  if (!session) throw new NotConnectedError();
  const savedAnswers = upsertAnswer(session.profile.savedAnswers, label.trim(), answer.trim(), newId(), new Date().toISOString());
  return saveProfile(deps, { ...session.profile, savedAnswers });
}
