import {
  normalizeRedditArchiveComments,
  REDDIT_ARCHIVE_COMMENTS_RAW_SHA256,
  type RedditArchiveCommentIdentity,
  type RedditArchiveCommentProvenance,
} from '@social-monitor/ingestion/adapters/source/reddit/reddit-archive-comment-normalizer';
import type { FetchedConversationUnit } from '@social-monitor/ingestion/ports';
import {
  archiveNeed as need,
  redditArchiveHash as hash,
  redditArchiveLane,
  type RedditArchiveScope,
  type RedditArchiveScanPolicy,
} from '../../lib/reddit-archive-finite-policy';

export type RedditArchiveCommentPacket = Readonly<{
  schemaVersion: 1;
  providerKey: 'reddit';
  provenance: RedditArchiveCommentProvenance;
  identity: RedditArchiveCommentIdentity;
  scope: RedditArchiveScope;
  bindingConfig: string;
  bindingConfigSha256: string;
  matchedLaneOrdinal: number;
  scanPolicy: RedditArchiveScanPolicy;
}>;

export type RedditArchiveCommentPlan = Readonly<{
  providerKey: 'reddit';
  coverage: 'PARTIAL_ARCHIVED_OBSERVATIONS';
  semanticKey: string;
  planSha256: string;
  packetSha256: string;
  rawSha256: string;
  commentsSha256: string;
  sourceUrl: string;
  acquiredAt: string;
  identity: RedditArchiveCommentIdentity;
  originalDays: readonly [string, string];
  scope: RedditArchiveScope;
  bindingConfig: string;
  bindingConfigSha256: string;
  matchedLaneOrdinal: number;
  sourceQuery: Readonly<{ mode: 'listing'; query: string }>;
  scanPolicy: RedditArchiveScanPolicy;
  candidates: readonly FetchedConversationUnit[];
}>;

export const planRedditArchiveComments = (
  rawBytes: Buffer,
  packetBytes: Buffer,
): RedditArchiveCommentPlan => {
  need(rawBytes.length === 4750 && packetBytes.length > 0 && packetBytes.length <= 65536,
    'Reddit archive comment packet bounds invalid');
  const packet = JSON.parse(packetBytes.toString('utf8')) as RedditArchiveCommentPacket;
  need(
    Object.keys(packet).sort().join(',') ===
      [
        'schemaVersion',
        'providerKey',
        'provenance',
        'identity',
        'scope',
        'bindingConfig',
        'bindingConfigSha256',
        'matchedLaneOrdinal',
        'scanPolicy',
      ].sort().join(','),
    'Reddit archive comment packet shape invalid',
  );
  need(
    packet.schemaVersion === 1 &&
      packet.providerKey === 'reddit' &&
      hash(rawBytes) === REDDIT_ARCHIVE_COMMENTS_RAW_SHA256 &&
      hash(rawBytes) === packet.provenance.rawSha256 &&
      packet.bindingConfigSha256 ===
        'e33aeab36268f4b553afd8090ccf509437a034ea70868eb5acaf1717535171c2' &&
      hash(packet.bindingConfig) === packet.bindingConfigSha256,
    'Reddit archive comment input digest invalid',
  );
  need(
    Object.keys(packet.scope).sort().join(',') ===
      ['tenantId', 'workspaceId', 'interestId', 'sourceBindingId', 'scanPolicyId'].sort().join(',') &&
      Object.entries(packet.scope).every(([key, id]) => id ===
        `00000000-0000-7000-8000-00000000${({ tenantId: '6101', workspaceId: '6102',
          interestId: '6105', sourceBindingId: '6113', scanPolicyId: '6123' } as Record<string, string>)[key]}`),
    'Reddit archive comment exact scope required',
  );
  need(
    Object.keys(packet.scanPolicy).sort().join(',') ===
      ['id', 'intervalSeconds', 'freshnessSeconds', 'retryBudget'].sort().join(',') &&
      packet.scanPolicy.id === packet.scope.scanPolicyId &&
      packet.scanPolicy.intervalSeconds === 1800 &&
      packet.scanPolicy.freshnessSeconds === 1800 &&
      packet.scanPolicy.retryBudget === 3 &&
      [packet.scanPolicy.intervalSeconds, packet.scanPolicy.freshnessSeconds].every(
        (value) => Number.isInteger(value) && value > 0 && value <= 31_536_000,
      ) &&
      Number.isInteger(packet.scanPolicy.retryBudget) &&
      packet.scanPolicy.retryBudget >= 0 &&
      packet.scanPolicy.retryBudget <= 100,
    'Reddit archive comment scan policy invalid',
  );

  const { lane, minScore } = redditArchiveLane(
    packet.bindingConfig,
    packet.matchedLaneOrdinal,
  );
  const pass = readPinnedCommentPass(packet.bindingConfig, packet.matchedLaneOrdinal);
  need(
    packet.matchedLaneOrdinal === 6 &&
      lane.subreddit === 'LocalLLaMA' &&
      lane.listing === 'new' &&
      minScore === 0 &&
      pass.includeComments === true &&
      pass.maxCommentsPerPost === 2,
    'Reddit archive comment configured lane mismatch',
  );

  const candidates = normalizeRedditArchiveComments(
    JSON.parse(rawBytes.toString('utf8')),
    packet.provenance,
    packet.identity,
  );
  const ordered = [...candidates].sort((left, right) =>
    left.providerUnitId.localeCompare(right.providerUnitId),
  );
  const originalDays = ordered.map((unit) =>
    unit.publishedAt.toISOString().slice(0, 10),
  );
  need(
    originalDays.length === 2 &&
      new Set(originalDays).size === 2 &&
      originalDays.includes('2026-10-01') &&
      originalDays.includes('2026-10-02'),
    'Reddit archive comment original dates must remain distinct',
  );

  const semanticKey = hash(
    JSON.stringify({
      kind: 'reddit-archive-comments-missing.v1',
      rawSha256: packet.provenance.rawSha256,
      provenance: packet.provenance,
      identity: packet.identity,
      scope: packet.scope,
      selectedIds: ordered.map((unit) => unit.providerUnitId),
    }),
  );
  const unsigned = {
    providerKey: 'reddit' as const,
    coverage: 'PARTIAL_ARCHIVED_OBSERVATIONS' as const,
    semanticKey,
    packetSha256: hash(packetBytes),
    rawSha256: packet.provenance.rawSha256,
    commentsSha256: hash(JSON.stringify(ordered)),
    sourceUrl: packet.provenance.sourceUrl,
    acquiredAt: packet.provenance.acquiredAt,
    identity: packet.identity,
    originalDays: originalDays as [string, string],
    scope: packet.scope,
    bindingConfig: packet.bindingConfig,
    bindingConfigSha256: packet.bindingConfigSha256,
    matchedLaneOrdinal: packet.matchedLaneOrdinal,
    sourceQuery: { mode: 'listing' as const, query: lane.query },
    scanPolicy: packet.scanPolicy,
    candidates: ordered,
  };
  return { ...unsigned, planSha256: hash(JSON.stringify(unsigned)) };
};

const readPinnedCommentPass = (
  configText: string,
  ordinal: number,
): Readonly<Record<string, unknown>> => {
  const config = JSON.parse(configText) as Record<string, unknown>;
  const passes = config.scanPasses ?? config.passes;
  need(Array.isArray(passes), 'Reddit archive comment scan passes required');
  const pass = passes[ordinal - 1];
  need(
    pass !== null &&
      typeof pass === 'object' &&
      !Array.isArray(pass),
    'Reddit archive comment scan pass required',
  );
  return pass as Record<string, unknown>;
};
