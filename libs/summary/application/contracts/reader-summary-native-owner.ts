import { DomainError } from "@social-monitor/shared-kernel";
import type { ReaderSummaryJobProps } from '../../domain/entities/reader-summary-job';

/** New namespace only. Existing durable-reader-summary-daily keys remain legacy. */
export const READER_SUMMARY_NATIVE_V3_PREFIX = 'native-reader-summary-v3:';
export interface ReaderSummaryNativeOwner {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly idempotencyKey: string;
  readonly cutoffAt: string;
  readonly preparationDeadlineAt: string;
}

export const isNativeReaderSummary = (key: string): boolean =>
  key.startsWith(READER_SUMMARY_NATIVE_V3_PREFIX);

/** Constructor injection is internal composition context, never public authorization. */
export const matchesReaderSummaryNativeOwner = (
  owner: ReaderSummaryNativeOwner | undefined,
  job: Pick<ReaderSummaryJobProps, 'tenantId' | 'workspaceId' | 'idempotencyKey'>,
): boolean => owner !== undefined && isNativeReaderSummary(job.idempotencyKey) &&
  owner.tenantId === job.tenantId && owner.workspaceId === job.workspaceId &&
  owner.idempotencyKey === job.idempotencyKey;

export const readerSummaryNativeExecutionError = (
  owner: ReaderSummaryNativeOwner | undefined, snapshot: ReaderSummaryJobProps,
): DomainError | undefined => isNativeReaderSummary(snapshot.idempotencyKey) &&
  (!matchesReaderSummaryNativeOwner(owner, snapshot) ||
    snapshot.selectionStrategy !== "jev_primary_v3" ||
    snapshot.preparationCutoffAt !== owner?.cutoffAt ||
    snapshot.preparationDeadlineAt !== owner?.preparationDeadlineAt)
  ? new DomainError("operation.conflict", "Native summary execution ownership mismatch") : undefined;
