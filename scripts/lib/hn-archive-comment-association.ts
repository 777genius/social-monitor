import { createHash } from 'node:crypto';

/** Optional, packet-digest-bound provenance. Original archive comments stay byte-for-byte unchanged. */
export const HN_FIREBASE_COMMENT_ASSOCIATIONS = 'hnFirebaseCommentAssociationsV1';
export const HN_ASSOCIATION_MAX_DEPTH = 64;
const MAX_RESPONSE_BYTES = 64 * 1024;

type Comment = Readonly<{ id: number; createdAt: string; depth: number }>;
function need(value: unknown, reason: string): asserts value {
  if (!value) throw new Error(`HN comment association ${reason}`);
}
function record(value: unknown): Record<string, unknown> {
  need(value !== null && typeof value === 'object' && !Array.isArray(value), 'object required');
  return value as Record<string, unknown>;
}
function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  const result = record(value);
  need(Object.keys(result).sort().join(',') === [...keys].sort().join(','), 'shape invalid');
  return result;
}
const nativeId = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

/** Hashes establish retained response integrity, not independent proof of provider transport authenticity. */
export function verifyHnArchiveCommentAssociations(input: {
  readonly storyId: number;
  readonly comments: readonly Comment[];
  readonly evidence: unknown;
}): ReadonlyMap<number, number> {
  const parents = new Map<number, number>();
  if (input.evidence === undefined) return parents;
  const evidence = exact(input.evidence, ['schemaVersion', 'storyId', 'chains']);
  need(evidence.schemaVersion === 1 && evidence.storyId === input.storyId, 'story identity invalid');
  need(Array.isArray(evidence.chains) && evidence.chains.length > 0 &&
    evidence.chains.length <= input.comments.length && evidence.chains.length <= 1_000, 'chain count invalid');
  const comments = new Map(input.comments.map(comment => [comment.id, comment]));
  const observed = new Map<number, string>();
  for (const value of evidence.chains) {
    const chain = exact(value, ['commentId', 'responses']);
    need(nativeId(chain.commentId) && !parents.has(chain.commentId), 'leaf identity invalid');
    const leaf = comments.get(chain.commentId);
    need(leaf !== undefined && Array.isArray(chain.responses) && chain.responses.length === leaf.depth &&
      leaf.depth >= 1 && leaf.depth <= HN_ASSOCIATION_MAX_DEPTH, 'depth invalid');
    const seen = new Set<number>([input.storyId]);
    let expectedId = leaf.id;
    let firstParent: number | undefined;
    for (const [index, value] of chain.responses.entries()) {
      const response = exact(value, ['url', 'body', 'sha256']);
      need(typeof response.body === 'string' && response.body.length > 0 &&
        Buffer.byteLength(response.body, 'utf8') <= MAX_RESPONSE_BYTES &&
        Buffer.from(response.body, 'utf8').toString('utf8') === response.body &&
        typeof response.sha256 === 'string' && /^[a-f0-9]{64}$/u.test(response.sha256) &&
        createHash('sha256').update(response.body, 'utf8').digest('hex') === response.sha256, 'response digest invalid');
      const raw = record(JSON.parse(response.body));
      need(raw.type === 'comment' && nativeId(raw.id) && raw.id === expectedId && !seen.has(raw.id) &&
        nativeId(raw.parent) && typeof raw.time === 'number' && Number.isSafeInteger(raw.time) &&
        raw.time >= 0 && Number.isSafeInteger(raw.time * 1_000) &&
        Number.isFinite(new Date(raw.time * 1_000).getTime()) &&
        response.url === `https://hacker-news.firebaseio.com/v0/item/${raw.id}.json`, 'provider response invalid');
      const identity = JSON.stringify([raw.parent, raw.time]);
      need(!observed.has(raw.id) || observed.get(raw.id) === identity, 'conflicting provider observations');
      observed.set(raw.id, identity);
      seen.add(raw.id);
      const retained = comments.get(raw.id);
      need(retained === undefined || Date.parse(retained.createdAt) === raw.time * 1_000 &&
        retained.depth === leaf.depth - index, 'retained identity/time/depth mismatch');
      const last = index === chain.responses.length - 1;
      need(last ? raw.parent === input.storyId : !seen.has(raw.parent), 'parent chain invalid');
      firstParent ??= raw.parent;
      expectedId = raw.parent;
    }
    need(firstParent !== undefined, 'empty chain');
    parents.set(leaf.id, firstParent);
  }
  return parents;
}
