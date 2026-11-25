import type { JsonObject, JsonValue } from '@social-monitor/shared-kernel';
import type { SaveSourceItemsCommand } from '../../../ports/source-item-repository.port';

const isObject = (value: JsonValue | undefined): value is JsonObject =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export type RedditArchiveInsertCommand = SaveSourceItemsCommand & Readonly<{ providerKey: 'reddit' }>;
/** Trusted archive entrypoint only; ordinary providers cannot suppress capture via arbitrary metadata. */
export function assertRedditArchiveInsert(command: RedditArchiveInsertCommand): void {
  const valid = command.providerKey === 'reddit' && command.items.length >= 1 && command.items.length <= 3 &&
    command.items.every(item => {
      const s = item.toSnapshot(), m = s.metadata, a = m?.redditArchive;
      if (!isObject(a) || m?.kind !== 'reddit_post' ||
        m.contentCapture !== undefined || m.articleCaptureAttempt !== undefined) return false;
      const created = a.originalCreatedUtc, retrieved = a.archiveRetrievedUtc;
      return /^reddit:t3_[a-z0-9]{4,12}$/u.test(s.externalId) && a.schemaVersion === 1 &&
        a.origin === 'arctic_shift' && a.coverage === 'PARTIAL_ARCHIVED_OBSERVATIONS' &&
        typeof a.rawSha256 === 'string' && /^[a-f0-9]{64}$/u.test(a.rawSha256) &&
        typeof a.sourceUrl === 'string' && a.sourceUrl.startsWith('https://arctic-shift.photon-reddit.com/api/posts/ids?') &&
        typeof a.acquiredAt === 'string' && Number.isFinite(Date.parse(a.acquiredAt)) &&
        typeof created === 'number' && Number.isSafeInteger(created) && created * 1000 === s.publishedAt?.getTime() &&
        typeof retrieved === 'number' && Number.isSafeInteger(retrieved) && retrieved >= created &&
        retrieved * 1000 <= Date.parse(a.acquiredAt) && Date.parse(a.acquiredAt) <= s.ingestedAt.getTime() &&
        a.over18 === false && a.removedByCategory === null && [false, 'UNKNOWN_ABSENT'].includes(a.removed as false | string) &&
        a.liveProviderChecked === 'UNKNOWN' && a.originalCollectionAttempt === 'UNKNOWN' &&
        m.archiveImportObservedAt === s.ingestedAt.toISOString();
    });
  if (!valid) throw new Error('Validated Reddit archive provenance required for archive-only insertion');
}
