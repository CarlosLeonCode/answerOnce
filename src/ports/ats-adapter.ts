import type { CanonicalKey } from '../domain/canonical-keys';
import type { FieldDescriptor } from '../domain/field';
import type { JobMeta, PageMeta } from '../domain/job-meta';

/** Knowledge about a specific Applicant Tracking System's form markup. */
export interface AtsAdapter {
  readonly id: string;
  readonly name: string;
  /** True when the frame (by URL and DOM hints) belongs to this ATS. */
  detect(frame: { url: string; hints: string[] }): boolean;
  /** Deterministic mapping by field name/id; null to defer to generic rules. */
  mapField(field: FieldDescriptor): CanonicalKey | null;
  /** Company and role of the job, from the frame's URL and header text. Empty strings when unknown. */
  jobMeta(frame: { url: string; meta: PageMeta }): JobMeta;
}
