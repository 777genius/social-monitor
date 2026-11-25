import { createHash } from 'node:crypto';
import { readScanPasses, readOptionalNonNegativeInteger } from '@social-monitor/ingestion/adapters/source/reddit/reddit-source-support';
import type { RedditSourceQueryLaneMetadata } from '@social-monitor/ingestion/adapters/source/reddit/reddit-post-normalizer';
import type { JsonObject } from '@social-monitor/shared-kernel';

export const redditArchiveHash = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
export function archiveNeed(value: unknown, reason: string): asserts value { if (!value) throw new Error(reason); }
export type RedditArchiveScope = Readonly<{
  tenantId: string; workspaceId: string; interestId: string; sourceBindingId: string; scanPolicyId: string;
}>;
export type RedditArchiveScanPolicy = Readonly<{ id: string; intervalSeconds: number; freshnessSeconds: number; retryBudget: number }>;
/** Listing only: exact configured ordinal, never invent a permissive alternative. */
export function redditArchiveLane(configText: string, ordinal: number): {
  lane: RedditSourceQueryLaneMetadata; minScore: number | undefined;
} {
  const config = JSON.parse(configText) as JsonObject;
  archiveNeed(config !== null && typeof config === 'object' && !Array.isArray(config), 'Archive config required');
  archiveNeed(Number.isInteger(ordinal) && ordinal >= 1 && ordinal <= 48, 'Archive lane ordinal invalid');
  const pass = readScanPasses(config)?.[ordinal - 1];
  archiveNeed(pass?.mode === 'listing', 'Archive requires actual configured listing lane');
  return { lane: { providerKey: 'reddit', mode: 'listing', query: pass.subreddit,
    subreddit: pass.subreddit, listing: pass.listing, ...(pass.topTime ? { topTime: pass.topTime } : {}) },
  minScore: pass.minScore ?? readOptionalNonNegativeInteger(config.minScore, 1_000_000) };
}
export const scopedRedditArchiveRelationSql = `
 SELECT 1 FROM tenants t JOIN workspaces w ON w.tenant_id=t.id AND w.deleted_at IS NULL
 JOIN interests i ON i.tenant_id=t.id AND i.workspace_id=w.id AND i.status='ENABLED' AND i.deleted_at IS NULL
 JOIN source_bindings b ON b.tenant_id=t.id AND b.workspace_id=w.id AND b.interest_id=i.id
  AND b.status='ENABLED' AND b.deleted_at IS NULL
 JOIN source_catalog_entries c ON c.id=b.source_catalog_entry_id AND c.provider_key='reddit'
 JOIN scan_policies p ON p.tenant_id=t.id AND p.workspace_id=w.id AND p.source_binding_id=b.id
 WHERE t.id=$1::uuid AND t.deleted_at IS NULL AND w.id=$2::uuid AND i.id=$3::uuid
  AND b.id=$4::uuid AND p.id=$5::uuid AND b.config=$6::jsonb
  AND p.interval_seconds=$7::int AND p.freshness_seconds=$8::int AND p.retry_budget=$9::int`;
