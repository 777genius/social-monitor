import { normalizeRedditArchive, type RedditArchiveProvenance } from '@social-monitor/ingestion/adapters/source/reddit/reddit-archive-normalizer';
import type { FetchedSourceItem } from '@social-monitor/ingestion/ports';
import { archiveNeed as need, redditArchiveHash as hash, redditArchiveLane, type RedditArchiveScope, type RedditArchiveScanPolicy } from '../../lib/reddit-archive-finite-policy';

export type RedditArchivePacket = Readonly<{
  schemaVersion: 1; providerKey: 'reddit'; provenance: RedditArchiveProvenance;
  nativeIds: readonly string[]; scope: RedditArchiveScope;
  bindingConfig: string; bindingConfigSha256: string; matchedLaneOrdinal: number;
  scanPolicy: RedditArchiveScanPolicy;
}>;
export type RedditArchivePlan = Readonly<{
  day: string; providerKey: 'reddit'; coverage: 'PARTIAL_ARCHIVED_OBSERVATIONS';
  semanticKey: string; planSha256: string; packetSha256: string; archiveSha256: string;
  itemsSha256: string; scope: RedditArchiveScope; bindingConfig: string; bindingConfigSha256: string;
  matchedLaneOrdinal: number; sourceQuery: Readonly<{ mode: 'listing'; query: string }>;
  scanPolicy: RedditArchiveScanPolicy;
  candidates: readonly Readonly<{ externalId: string; item: FetchedSourceItem }>[];
}>;
export function planRedditArchive(bytes: Buffer, packetBytes: Buffer): RedditArchivePlan {
  const p = JSON.parse(packetBytes.toString('utf8')) as RedditArchivePacket;
  need(Object.keys(p).sort().join(',') === ['schemaVersion','providerKey','provenance','nativeIds','scope',
    'bindingConfig','bindingConfigSha256','matchedLaneOrdinal','scanPolicy'].sort().join(','), 'Archive packet shape invalid');
  need(p.schemaVersion === 1 && p.providerKey === 'reddit' && hash(bytes) === p.provenance.rawSha256 &&
    hash(p.bindingConfig) === p.bindingConfigSha256, 'Archive input digest invalid');
  need(Object.keys(p.scope).sort().join(',') === ['tenantId','workspaceId','interestId','sourceBindingId','scanPolicyId'].sort().join(',') &&
    Object.values(p.scope).every(id => /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(id)), 'Archive exact scope required');
  const { lane, minScore } = redditArchiveLane(p.bindingConfig, p.matchedLaneOrdinal);
  need(Object.keys(p.scanPolicy).sort().join(',') === ['id','intervalSeconds','freshnessSeconds','retryBudget'].sort().join(',') &&
    p.scanPolicy.id === p.scope.scanPolicyId && [p.scanPolicy.intervalSeconds, p.scanPolicy.freshnessSeconds].every(n =>
      Number.isInteger(n) && n > 0 && n <= 31_536_000) && Number.isInteger(p.scanPolicy.retryBudget) &&
      p.scanPolicy.retryBudget >= 0 && p.scanPolicy.retryBudget <= 100, 'Archive actual scan policy required');
  const items = normalizeRedditArchive(JSON.parse(bytes.toString('utf8')), p.provenance, p.nativeIds, lane, minScore)
    .slice().sort((a, b) => a.externalId.localeCompare(b.externalId));
  const candidates = items.map(item => ({ externalId: item.externalId, item }));
  const semanticKey = hash(JSON.stringify({ kind: 'reddit-archive-missing.v1', archive: hash(bytes),
    provenance: p.provenance, scope: p.scope, selectedIds: items.map(x => x.externalId) }));
  const unsigned = { day: p.provenance.day, providerKey: 'reddit' as const, coverage: 'PARTIAL_ARCHIVED_OBSERVATIONS' as const,
    semanticKey, packetSha256: hash(packetBytes), archiveSha256: hash(bytes), itemsSha256: hash(JSON.stringify(candidates)),
    scope: p.scope, bindingConfig: p.bindingConfig, bindingConfigSha256: p.bindingConfigSha256,
    matchedLaneOrdinal: p.matchedLaneOrdinal, scanPolicy: p.scanPolicy,
    sourceQuery: { mode: 'listing' as const, query: lane.query }, candidates };
  return { ...unsigned, planSha256: hash(JSON.stringify(unsigned)) };
}
