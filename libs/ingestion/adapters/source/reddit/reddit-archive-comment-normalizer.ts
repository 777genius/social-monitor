import type { FetchedConversationUnit } from '../../../ports';

export const REDDIT_ARCHIVE_COMMENTS_SOURCE_URL =
  'https://arctic-shift.photon-reddit.com/api/comments/search?link_id=1wuktlf&limit=2';

export const REDDIT_ARCHIVE_COMMENTS_RAW_SHA256 =
  'f385d4bd196c4fa91e14705062624eea63871c8e58e292ea0d7d85143b9933b1';
export const REDDIT_ARCHIVE_COMMENTS_ACQUIRED_AT = '2026-10-16T12:58:32.860Z';
const retainedTimes: Readonly<Record<string, readonly [number, number]>> = {
  pdhrwqg: [1790976121, 1790976143],
  pd5e1lp: [1790830260, 1790830287],
};

export type RedditArchiveCommentProvenance = Readonly<{
  sourceUrl: string;
  acquiredAt: string;
  rawSha256: string;
}>;

export type RedditArchiveCommentIdentity = Readonly<{
  nativeParentId: string;
  nativeCommentIds: readonly [string, string];
  subreddit: string;
}>;

const record = (value: unknown, reason: string): Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(reason);
  }
  return value as Record<string, unknown>;
};

function need(value: unknown, reason: string): asserts value {
  if (!value) throw new Error(reason);
}

/**
 * Normalizes a retained comments/search response without live-state inference.
 * Absent removal fields remain UNKNOWN in metadata and are never treated as safe.
 */
export const normalizeRedditArchiveComments = (
  input: unknown,
  provenance: RedditArchiveCommentProvenance,
  identity: RedditArchiveCommentIdentity,
): readonly FetchedConversationUnit[] => {
  need(
    Object.keys(provenance).sort().join(',') ===
      ['sourceUrl', 'acquiredAt', 'rawSha256'].sort().join(','),
    'Reddit archive comment provenance shape invalid',
  );
  need(
    provenance.sourceUrl === REDDIT_ARCHIVE_COMMENTS_SOURCE_URL,
    'Reddit archive comments/search URL invalid',
  );
  need(
    identity.nativeParentId === '1wuktlf' &&
      identity.subreddit === 'LocalLLaMA' &&
      identity.nativeCommentIds.length === 2 &&
      new Set(identity.nativeCommentIds).size === 2 &&
      [...identity.nativeCommentIds].sort().join(',') === 'pd5e1lp,pdhrwqg',
    'Reddit archive comment identity bounds invalid',
  );
  const acquiredAt = Date.parse(provenance.acquiredAt);
  need(
    Number.isFinite(acquiredAt) &&
      new Date(acquiredAt).toISOString() === provenance.acquiredAt &&
      provenance.rawSha256 === REDDIT_ARCHIVE_COMMENTS_RAW_SHA256 &&
      provenance.acquiredAt === REDDIT_ARCHIVE_COMMENTS_ACQUIRED_AT,
    'Reddit archive comment provenance invalid',
  );

  const envelope = record(input, 'Reddit archive comments envelope required');
  need(
    Object.keys(envelope).length === 1 &&
      Array.isArray(envelope.data) &&
      envelope.data.length === 2,
    'Reddit archive comments response must contain exactly two rows',
  );

  const expectedIds = new Set(identity.nativeCommentIds);
  const seen = new Set<string>();
  const units = envelope.data.map((value) => {
    const row = record(value, 'Reddit archive comment row required');
    const id = row.id;
    const name = row.name;
    const createdUtc = row.created_utc;
    const retrievedUtc = row.retrieved_on;
    const body = row.body;

    need(
      typeof id === 'string' &&
        expectedIds.has(id) &&
        !seen.has(id) &&
        name === `t1_${id}`,
      'Reddit archive comment ID/name invalid',
    );
    seen.add(id);
    need(
      typeof createdUtc === 'number' &&
        Number.isSafeInteger(createdUtc) &&
        createdUtc > 0 &&
        typeof retrievedUtc === 'number' &&
        Number.isSafeInteger(retrievedUtc) &&
        createdUtc === retainedTimes[id]?.[0] &&
        retrievedUtc === retainedTimes[id]?.[1] &&
        retrievedUtc >= createdUtc &&
        retrievedUtc * 1000 <= acquiredAt,
      'Reddit archive comment chronology invalid',
    );
    need(
      typeof body === 'string' &&
        body.trim().length > 0 &&
        !['[deleted]', '[removed]'].includes(body.trim().toLowerCase()),
      'Reddit archive comment body invalid',
    );
    need(
      row.link_id === `t3_${identity.nativeParentId}` &&
        row.parent_id === `t3_${identity.nativeParentId}` &&
        (row.root === undefined || row.root === `t3_${identity.nativeParentId}`),
      'Reddit archive comment parent/root invalid',
    );
    need(
      typeof row.subreddit === 'string' &&
        row.subreddit === identity.subreddit,
      'Reddit archive comment subreddit invalid',
    );
    need(
      typeof row.score === 'number' &&
        Number.isSafeInteger(row.score) &&
        row.score >= 0,
      'Reddit archive comment score invalid',
    );
    need(
      row.removal_reason === null &&
        !Object.hasOwn(row, 'removed_by_category') &&
        !Object.hasOwn(row, 'removed') &&
        !Object.hasOwn(row, 'deleted'),
      'Reddit archive comment removal state must remain unknown',
    );
    need(
      typeof row.permalink === 'string' &&
        new RegExp(
          `^/r/${identity.subreddit}/comments/${identity.nativeParentId}/[^/?#]+/${id}/?$`,
          'u',
        ).test(row.permalink),
      'Reddit archive comment canonical URL invalid',
    );

    return {
      rootExternalId: `reddit:t3_${identity.nativeParentId}`,
      rootProviderItemId: `t3_${identity.nativeParentId}`,
      providerUnitId: `t1_${id}`,
      canonicalUrl: new URL(row.permalink, 'https://www.reddit.com').toString(),
      body,
      publishedAt: new Date(createdUtc * 1000),
      threadExternalId: `t3_${identity.nativeParentId}`,
      depth: 0,
      role: 'top_level_comment',
      metadata: {
        kind: 'reddit_comment',
        contentType: 'comment',
        parentPostId: `t3_${identity.nativeParentId}`,
        rootProviderItemId: `t3_${identity.nativeParentId}`,
        parentId: `t3_${identity.nativeParentId}`,
        subreddit: identity.subreddit,
        redditArchiveComments: {
          schemaVersion: 1,
          origin: 'arctic_shift',
          coverage: 'PARTIAL_ARCHIVED_OBSERVATIONS',
          sourceUrl: provenance.sourceUrl,
          rawSha256: provenance.rawSha256,
          acquiredAt: provenance.acquiredAt,
          originalCreatedUtc: createdUtc,
          archiveScore: row.score,
          archiveRetrievedUtc: retrievedUtc,
          removalReason: null,
          removedByCategory: 'UNKNOWN_ABSENT',
          deletionStatus: 'UNKNOWN',
          removalStatus: 'UNKNOWN',
          liveProviderChecked: 'UNKNOWN',
          originalCollectionAttempt: 'UNKNOWN',
        },
      },
    } satisfies FetchedConversationUnit;
  });

  need(
    seen.size === 2 &&
      [...seen].sort().join(',') ===
        [...expectedIds].sort().join(','),
    'Reddit archive comment response identity set invalid',
  );
  return units;
};
