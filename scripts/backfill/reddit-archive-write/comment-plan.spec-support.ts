import { normalizeRedditArchiveComments, REDDIT_ARCHIVE_COMMENTS_SOURCE_URL,
  REDDIT_ARCHIVE_COMMENTS_RAW_SHA256 } from '@social-monitor/ingestion/adapters/source/reddit/reddit-archive-comment-normalizer';
import { redditArchiveHash as hash } from '../../lib/reddit-archive-finite-policy';
import type { RedditArchiveCommentPlan } from './comment-plan';

export const archiveIdentity = { nativeParentId: '1wuktlf',
  nativeCommentIds: ['pdhrwqg', 'pd5e1lp'] as const, subreddit: 'LocalLLaMA' };
export const archiveProvenance = { sourceUrl: REDDIT_ARCHIVE_COMMENTS_SOURCE_URL,
  rawSha256: REDDIT_ARCHIVE_COMMENTS_RAW_SHA256, acquiredAt: '2026-10-16T12:58:32.860Z' };
/** Synthetic text only; these bytes do not claim to be the retained raw response. */
export function commentResponse() {
  return { data: [
    { id: 'pdhrwqg', name: 't1_pdhrwqg', created_utc: 1790976121, retrieved_on: 1790976143 },
    { id: 'pd5e1lp', name: 't1_pd5e1lp', created_utc: 1790830260, retrieved_on: 1790830287 },
  ].map(row => ({ ...row, body: 'Synthetic archive fixture.', score: 1, removal_reason: null,
    link_id: 't3_1wuktlf', parent_id: 't3_1wuktlf', subreddit: 'LocalLLaMA',
    permalink: `/r/LocalLLaMA/comments/1wuktlf/synthetic/${row.id}/` })) };
}
export function commentPlan(): RedditArchiveCommentPlan {
  const scope = { tenantId: '00000000-0000-7000-8000-000000006101',
    workspaceId: '00000000-0000-7000-8000-000000006102', interestId: '00000000-0000-7000-8000-000000006105',
    sourceBindingId: '00000000-0000-7000-8000-000000006113', scanPolicyId: '00000000-0000-7000-8000-000000006123' };
  const candidates = [...normalizeRedditArchiveComments(commentResponse(), archiveProvenance, archiveIdentity)]
    .sort((a, b) => a.providerUnitId.localeCompare(b.providerUnitId));
  const bindingConfig = JSON.stringify({ scanPasses: Array.from({ length: 6 }, () => ({
    mode: 'listing', subreddit: 'LocalLLaMA', listing: 'new', minScore: 0, includeComments: true,
    maxCommentsPerPost: 2 })) });
  const unsigned = { providerKey: 'reddit' as const, coverage: 'PARTIAL_ARCHIVED_OBSERVATIONS' as const,
    semanticKey: 'a'.repeat(64), packetSha256: 'b'.repeat(64), rawSha256: archiveProvenance.rawSha256,
    commentsSha256: hash(JSON.stringify(candidates)), sourceUrl: archiveProvenance.sourceUrl,
    acquiredAt: archiveProvenance.acquiredAt, identity: archiveIdentity,
    originalDays: ['2026-10-01', '2026-10-02'] as const, scope, bindingConfig,
    bindingConfigSha256: hash(bindingConfig), matchedLaneOrdinal: 6,
    sourceQuery: { mode: 'listing' as const, query: 'LocalLLaMA' },
    scanPolicy: { id: scope.scanPolicyId, intervalSeconds: 1800, freshnessSeconds: 1800, retryBudget: 3 }, candidates };
  return { ...unsigned, planSha256: hash(JSON.stringify(unsigned)) };
}
