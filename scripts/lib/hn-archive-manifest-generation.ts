import { createHash } from 'node:crypto';
import { HN_FIREBASE_COMMENT_ASSOCIATIONS, verifyHnArchiveCommentAssociations } from './hn-archive-comment-association';
import { validateHnCandidates } from './hn-archive-reconciliation';
import type { HnMissingCandidate } from './hn-archive-reconciliation';

const maxComments = 200;
const maxDepth = 64;
const maxResponseBytes = 8 * 1024 * 1024;
const maxManifestItemBytes = 32 * 1024 * 1024;
const digest = (body: string): string => createHash('sha256').update(body, 'utf8').digest('hex');

type JsonObject = Record<string, unknown>;
type Comment = Readonly<{ id: number; author: string; createdAt: string; depth: number; text: string }>;
type Response = Readonly<{ url: string; body: string; sha256: string }>;
export type HnArchiveBodyReader = (url: string) => Promise<string>;

function object(value: unknown, reason: string): JsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(reason);
  return value as JsonObject;
}
function id(value: unknown): number {
  const n = typeof value === 'string' && /^[1-9]\d*$/u.test(value) ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 1) throw new Error('Invalid HN provider identity');
  return n;
}
function instant(value: unknown): string {
  if (typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3}0{0,3})?Z$/u.test(value) ||
      !Number.isFinite(Date.parse(value))) throw new Error('Invalid HN provider timestamp');
  const normalized = new Date(value).toISOString();
  if (normalized.slice(0, 19) !== value.slice(0, 19)) throw new Error('Invalid HN provider timestamp');
  return normalized;
}
function parseBody(body: string): JsonObject {
  if (typeof body !== 'string' || Buffer.byteLength(body, 'utf8') > maxResponseBytes) {
    throw new Error('HN provider response exceeds limit');
  }
  try { return object(JSON.parse(body), 'Invalid HN provider response'); }
  catch { throw new Error('Invalid HN provider response'); }
}

/** Captures exact Firebase responses only where a historical comment predates its story. */
async function association(
  storyId: number, comment: Comment, read: HnArchiveBodyReader,
  cache: Map<number, Promise<Response>>,
): Promise<Readonly<{ commentId: number; responses: readonly Response[] }>> {
  const responses: Response[] = [];
  const seen = new Set<number>([storyId]);
  let current = comment.id;
  for (let depth = 0; depth < comment.depth; depth += 1) {
    if (seen.has(current)) throw new Error('HN comment ancestry cycle');
    seen.add(current);
    let pending = cache.get(current);
    if (pending === undefined) {
      const url = `https://hacker-news.firebaseio.com/v0/item/${current}.json`;
      pending = read(url).then(body => ({ url, body, sha256: digest(body) }));
      cache.set(current, pending);
    }
    const response = await pending;
    const value = parseBody(response.body);
    if (value.type !== 'comment' || id(value.id) !== current ||
        typeof value.time !== 'number' || !Number.isSafeInteger(value.time) || value.time < 0 ||
        (depth === 0 && value.time * 1000 !== Date.parse(comment.createdAt))) {
      throw new Error('HN comment ancestry identity mismatch');
    }
    responses.push(response);
    current = id(value.parent);
  }
  if (current !== storyId) throw new Error('HN comment ancestry is incomplete');
  return { commentId: comment.id, responses };
}

async function materialize(candidate: HnMissingCandidate, read: HnArchiveBodyReader, reconciliationSha256: string) {
  const archiveUrl = `https://hn.algolia.com/api/v1/items/${candidate.id}`;
  const root = parseBody(await read(archiveUrl));
  const createdAt = instant(root.created_at);
  if (id(root.id) !== candidate.id || root.type !== 'story' || createdAt !== candidate.createdAt ||
      typeof root.title !== 'string' || root.title.trim().length === 0 ||
      typeof root.author !== 'string' || root.author.trim().length === 0 ||
      !(root.url === null || typeof root.url === 'string') ||
      !(root.text === null || typeof root.text === 'string') || !Array.isArray(root.children)) {
    throw new Error('HN story does not match reconciliation');
  }
  if (root.url !== null) {
    let url: URL;
    try { url = new URL(root.url as string); } catch { throw new Error('Invalid HN story URL'); }
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid HN story URL');
  }
  const points = root.points === null ? 0 : root.points;
  if (typeof points !== 'number' || !Number.isSafeInteger(points) || points < 0) {
    throw new Error('Invalid HN story points');
  }
  const comments: Comment[] = [];
  const ids = new Set<number>();
  let omitted = 0;
  const visit = (values: readonly unknown[], depth: number): void => {
    if (depth > maxDepth) throw new Error('HN comment depth limit exceeded');
    for (const value of values) {
      const child = object(value, 'Invalid HN comment');
      const commentId = id(child.id);
      if (ids.has(commentId)) throw new Error('Duplicate HN comment identity');
      ids.add(commentId);
      if (ids.size > 10_000) throw new Error('HN comment tree limit exceeded');
      if (!Array.isArray(child.children)) throw new Error('HN comment tree is incomplete');
      if (child.type === 'comment' && typeof child.author === 'string' &&
          typeof child.text === 'string' && child.text.trim().length > 0) {
        const comment = { id: commentId, author: child.author, createdAt: instant(child.created_at), depth, text: child.text };
        if (comments.length < maxComments) comments.push(comment); else omitted += 1;
      } else {
        omitted += 1;
      }
      if (child.children.length > 0) visit(child.children, depth + 1);
    }
  };
  visit(root.children, 1);
  const cache = new Map<number, Promise<Response>>();
  const older = comments.filter(comment => Date.parse(comment.createdAt) < Date.parse(createdAt));
  const chains = [];
  for (const comment of older) chains.push(await association(candidate.id, comment, read, cache));
  const evidence = chains.length === 0 ? undefined : { schemaVersion: 1, storyId: candidate.id, chains };
  verifyHnArchiveCommentAssociations({ storyId: candidate.id, comments, evidence });
  return {
    externalId: `hn:${candidate.id}`, objectId: candidate.id, title: root.title,
    url: root.url, author: root.author, points, createdAt, publishedUtcDate: candidate.day,
    storyText: root.text, commentCount: comments.length, comments, retrievedForPass: candidate.pass,
    provenance: { archive: archiveUrl, reconciliationSha256, omittedComments: omitted,
      ...(evidence === undefined ? {} : { [HN_FIREBASE_COMMENT_ASSOCIATIONS]: evidence }) },
  };
}

/** Fetch-only: any invalid or incomplete response rejects the entire manifest. */
export async function generateHnArchiveManifest(input: {
  readonly candidates: readonly HnMissingCandidate[]; readonly from: string; readonly to: string;
  readonly generatedAt: Date; readonly jobId: string; readonly read: HnArchiveBodyReader;
  readonly reconciliationSha256: string;
}) {
  if (!Number.isFinite(input.generatedAt.getTime()) || !/^[A-Za-z0-9._:-]{1,128}$/u.test(input.jobId) ||
      !/^[a-f0-9]{64}$/u.test(input.reconciliationSha256)) {
    throw new Error('Invalid HN manifest identity');
  }
  validateHnCandidates(input.candidates, input.from, input.to);
  if (Date.parse(`${input.to}T00:00:00.000Z`) + 86_400_000 > input.generatedAt.getTime()) {
    throw new Error('HN archive window must be closed');
  }
  const items = new Array<Awaited<ReturnType<typeof materialize>>>(input.candidates.length);
  let next = 0;
  let itemBytes = 0;
  let failure: unknown;
  let failed = false;
  const workers = Array.from({ length: Math.min(4, input.candidates.length) }, async () => {
    while (!failed) {
      const index = next++;
      if (index >= input.candidates.length) return;
      try {
        const item = await materialize(input.candidates[index]!, input.read, input.reconciliationSha256);
        itemBytes += Buffer.byteLength(JSON.stringify(item), 'utf8');
        if (itemBytes > maxManifestItemBytes) throw new Error('HN manifest size limit exceeded');
        items[index] = item;
      }
      catch (error) { if (!failed) failure = error; failed = true; return; }
    }
  });
  await Promise.all(workers);
  if (failed) throw failure;
  return { generatedAt: input.generatedAt.toISOString(), jobId: input.jobId,
    window: { from: input.from, to: input.to }, count: items.length, fetchErrors: 0,
    items, itemsSha256: digest(JSON.stringify(items)) };
}

/** Fixed public provider origins; callers never supply provider URLs. */
export async function readHnArchiveBody(url: string): Promise<string> {
  if (!/^https:\/\/(?:hn\.algolia\.com\/api\/v1\/items\/[1-9]\d*|hacker-news\.firebaseio\.com\/v0\/item\/[1-9]\d*\.json)$/u.test(url)) {
    throw new Error('Invalid HN provider URL');
  }
  let response: globalThis.Response;
  try { response = await fetch(url, { signal: AbortSignal.timeout(15_000), redirect: 'error' }); }
  catch { throw new Error('HN provider request failed'); }
  if (!response.ok || response.body === null) throw new Error('HN provider request failed');
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of response.body) {
    total += chunk.byteLength;
    if (total > maxResponseBytes) throw new Error('HN provider response exceeds limit');
    chunks.push(chunk);
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
}
