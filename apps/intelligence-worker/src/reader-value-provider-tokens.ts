import { createHash } from 'node:crypto';
import type { ReaderValueCleanupPolicy } from '@social-monitor/relevance/application/contracts/reader-value-assessment-store';

export const READER_VALUE_CLEANUP_OPTIONS = Symbol('READER_VALUE_CLEANUP_OPTIONS');
export type ReaderValueCleanupOptions = {
  readonly policy: ReaderValueCleanupPolicy;
  readonly policySha256: string;
  readonly policySource: 'READER_VALUE_RETENTION_HOLD_WORKSPACE_IDS';
};

/** The operational retention triage list must be explicit, even when empty.
 * Invalid or absent policy pauses erasure and emits a health signal, not an empty hold set.
 */
export function resolveReaderValueCleanupOptions(env: NodeJS.ProcessEnv): ReaderValueCleanupOptions {
  let holds: readonly string[] | null = null;
  try {
    const parsed: unknown = JSON.parse(env.READER_VALUE_RETENTION_HOLD_WORKSPACE_IDS ?? 'null');
    if (Array.isArray(parsed) && parsed.length <= 10_000 && parsed.every((id) => typeof id === 'string'
      && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(id))) {
      holds = [...new Set((parsed as string[]).map((id) => id.toLowerCase()))].sort();
    }
  } catch { /* Unknown operational policy: cleanup returns deferredUnknownPolicy. */ }
  const policy: ReaderValueCleanupPolicy = {
    version: 'reader-value-retention.v1', retentionHoldWorkspaceIds: holds,
    // Scope erasure is an explicit operational privacy triage decision, separate from TTL.
    eraseRevokedScopes: env.READER_VALUE_ERASE_REVOKED_SCOPES === 'true',
  };
  return { policy, policySha256: createHash('sha256').update(JSON.stringify(policy)).digest('hex'),
    policySource: 'READER_VALUE_RETENTION_HOLD_WORKSPACE_IDS' };
}
