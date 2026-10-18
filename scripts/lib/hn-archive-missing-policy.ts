import { createHash } from 'node:crypto';

export type HnArchiveScope = Readonly<{
  tenantId: string; workspaceId: string; interestId: string;
  sourceBindingId: string; scanPolicyId: string;
}>;
export type HnArchiveComment = Readonly<{
  id: number; author: string; createdAt: string; depth: number; text: string;
}>;
export type HnArchiveItem = Readonly<{
  externalId: string; objectId: number; title: string; url: string | null;
  author: string; points: number; createdAt: string; publishedUtcDate: string;
  storyText: string | null; commentCount: number; comments: readonly HnArchiveComment[];
  retrievedForPass: number; provenance: Readonly<Record<string, unknown>>;
}>;
export type HnArchiveManifest = Readonly<{
  generatedAt: string; jobId: string; window: Readonly<{ from: string; to: string }>;
  count: number; fetchErrors: number; items: readonly HnArchiveItem[];
  itemsSha256: string;
}>;
export type HnArchiveMissingPlan = Readonly<{
  schemaVersion: 1; kind: 'hn-archive-missing.v1'; day: string;
  providerKey: 'hacker-news'; coverage: 'PARTIAL_ARCHIVED_OBSERVATIONS';
  semanticKey: string; planSha256: string; packetSha256: string;
  manifestSha256: string; itemsSha256: string; scope: HnArchiveScope;
  bindingConfig: string; bindingConfigSha256: string;
  selectedIds: readonly string[]; candidateIds: readonly string[];
}>;
export type HnArchiveClaim = Readonly<{
  mode: 'import-hn-archive-missing'; inputRoot: string; day: string;
  journalDir: string; semanticKey: string; planSha256: string;
  packetSha256: string; correlationId: string;
}>;

const digest = /^[a-f0-9]{64}$/u;
const dayPattern = /^\d{4}-\d{2}-\d{2}$/u;
const utcPattern = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?Z$/u;
const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;

export function archiveNeed(value: unknown, reason: string): asserts value {
  if (!value) throw new Error(reason);
}
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>).sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
export const archiveHash = (value: string | Buffer): string =>
  createHash('sha256').update(value).digest('hex');
export function hnArchiveSemanticKey(input: {
  day: string; itemsSha256: string; selectedIds: readonly string[];
}): string {
  archiveNeed(dayPattern.test(input.day) && digest.test(input.itemsSha256), 'HN semantic inputs invalid');
  archiveNeed(input.selectedIds.length > 0 && input.selectedIds.length <= 100 &&
    new Set(input.selectedIds).size === input.selectedIds.length &&
    input.selectedIds.every(id => /^hn:\d+$/u.test(id)), 'HN selected IDs invalid');
  return archiveHash(canonicalJson({
    kind: 'hn-archive-missing.v1', day: input.day,
    itemsSha256: input.itemsSha256, selectedIds: [...input.selectedIds],
  }));
}
function object(value: unknown, reason: string): Record<string, unknown> {
  archiveNeed(value !== null && typeof value === 'object' && !Array.isArray(value), reason);
  return value as Record<string, unknown>;
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[], reason: string): void {
  archiveNeed(Object.keys(value).sort().join(',') === [...keys].sort().join(','), reason);
}
function iso(value: unknown, reason: string): string {
  archiveNeed(typeof value === 'string' && utcPattern.test(value) && Number.isFinite(Date.parse(value)), reason);
  return value;
}
export function parseHnArchiveManifest(input: unknown): HnArchiveManifest {
  const value = object(input, 'HN manifest object required');
  exactKeys(value, ['generatedAt','jobId','window','count','fetchErrors','items','itemsSha256'], 'HN manifest shape invalid');
  const window = object(value.window, 'HN manifest window invalid');
  exactKeys(window, ['from','to'], 'HN manifest window shape invalid');
  archiveNeed(dayPattern.test(String(window.from)) && dayPattern.test(String(window.to)) &&
    Date.parse(`${window.from}T00:00:00Z`) <= Date.parse(`${window.to}T00:00:00Z`), 'HN manifest window invalid');
  archiveNeed(typeof value.jobId === 'string' && /^[a-zA-Z0-9._:-]{1,128}$/u.test(value.jobId) &&
    Number.isInteger(value.count) && value.count === (value.items as unknown[]).length &&
    value.fetchErrors === 0 &&
    Array.isArray(value.items) && digest.test(String(value.itemsSha256)), 'HN manifest integrity invalid');
  iso(value.generatedAt, 'HN generatedAt invalid');
  return value as unknown as HnArchiveManifest;
}
export function qualifyHnArchiveItem(input: unknown, day: string, ordinal: number): HnArchiveItem {
  archiveNeed(dayPattern.test(day), 'HN packet day invalid');
  const value = object(input, `HN item ${ordinal} invalid`);
  exactKeys(value, ['externalId','objectId','title','url','author','points','createdAt','publishedUtcDate',
    'storyText','commentCount','comments','retrievedForPass','provenance'], `HN item ${ordinal} shape invalid`);
  archiveNeed(value.externalId === `hn:${value.objectId}` && Number.isInteger(value.objectId) &&
    Number(value.objectId) > 0 && typeof value.title === 'string' && value.title.trim().length > 0 &&
    value.publishedUtcDate === day && typeof value.author === 'string' &&
    typeof value.points === 'number' && Number.isInteger(value.points) && value.points >= 0 &&
    typeof value.commentCount === 'number' && Number.isInteger(value.commentCount) &&
    value.commentCount >= 0 && Number.isInteger(value.retrievedForPass), `HN item ${ordinal} identity invalid`);
  archiveNeed(value.url === null || (typeof value.url === 'string' &&
    ['http:','https:'].includes(new URL(value.url).protocol)), `HN item ${ordinal} URL invalid`);
  archiveNeed(value.storyText === null || typeof value.storyText === 'string', `HN item ${ordinal} storyText invalid`);
  iso(value.createdAt, `HN item ${ordinal} createdAt invalid`);
  const provenance = object(value.provenance, `HN item ${ordinal} provenance invalid`);
  archiveNeed(Object.keys(provenance).length > 0, `HN item ${ordinal} provenance empty`);
  archiveNeed(Array.isArray(value.comments) && value.comments.length === value.commentCount,
    `HN item ${ordinal} comment count mismatch`);
  const ids = new Set<number>();
  const comments = (value.comments as unknown[]).map((raw, index): HnArchiveComment => {
    const comment = object(raw, `HN comment ${ordinal}.${index} invalid`);
    exactKeys(comment, ['id','author','createdAt','depth','text'], `HN comment ${ordinal}.${index} shape invalid`);
    archiveNeed(Number.isInteger(comment.id) && Number(comment.id) > 0 && !ids.has(Number(comment.id)) &&
      typeof comment.author === 'string' && Number.isInteger(comment.depth) && Number(comment.depth) >= 1 &&
      typeof comment.text === 'string' && comment.text.trim().length > 0, `HN comment ${ordinal}.${index} invalid`);
    iso(comment.createdAt, `HN comment ${ordinal}.${index} createdAt invalid`);
    archiveNeed(Date.parse(comment.createdAt as string) >= Date.parse(value.createdAt as string),
      `HN comment ${ordinal}.${index} predates story`);
    ids.add(Number(comment.id));
    return comment as unknown as HnArchiveComment;
  });
  return { ...value, comments } as unknown as HnArchiveItem;
}
export function validateHnArchiveClaim(claim: unknown, plan: HnArchiveMissingPlan): HnArchiveClaim {
  const value = object(claim, 'HN native claim object required');
  exactKeys(value, ['mode','inputRoot','day','journalDir','semanticKey','planSha256','packetSha256','correlationId'],
    'HN native claim shape invalid');
  archiveNeed(value.mode === 'import-hn-archive-missing' && value.day === plan.day &&
    value.semanticKey === plan.semanticKey && value.planSha256 === plan.planSha256 &&
    value.packetSha256 === plan.packetSha256 && typeof value.inputRoot === 'string' &&
    typeof value.journalDir === 'string' && typeof value.correlationId === 'string' &&
    /^[a-zA-Z0-9._:-]{1,128}$/u.test(value.correlationId), 'HN native claim identity invalid');
  return value as unknown as HnArchiveClaim;
}
export function hnArchiveJournalReceipt(input: {
  plan: HnArchiveMissingPlan; coverage: HnArchiveMissingPlan['coverage'];
  status: 'started' | 'complete'; inserted: number; alreadyPresent: number; postWritePresent: number;
}): Readonly<Record<string, unknown>> {
  const p = input.plan;
  return {
    schemaVersion: 1, day: p.day, coverage: input.coverage, providerKey: p.providerKey,
    semanticKey: p.semanticKey, planSha256: p.planSha256, packetSha256: p.packetSha256,
    bindingConfigSha256: p.bindingConfigSha256, itemsSha256: p.itemsSha256,
    scope: p.scope, candidateIds: p.candidateIds, status: input.status,
    inserted: input.inserted, alreadyPresent: input.alreadyPresent, postWritePresent: input.postWritePresent,
  };
}
export function validateHnArchivePlanShape(plan: HnArchiveMissingPlan, expectedPlanSha256: string): void {
  archiveNeed(digest.test(expectedPlanSha256) && plan.planSha256 === expectedPlanSha256 &&
    plan.schemaVersion === 1 && plan.kind === 'hn-archive-missing.v1' &&
    plan.providerKey === 'hacker-news' && plan.coverage === 'PARTIAL_ARCHIVED_OBSERVATIONS' &&
    Object.values(plan.scope).every(value => uuidPattern.test(value)) &&
    archiveHash(plan.bindingConfig) === plan.bindingConfigSha256 &&
    plan.selectedIds.length > 0 && plan.selectedIds.length <= 100 &&
    canonicalJson(plan.selectedIds) === canonicalJson(plan.candidateIds) &&
    plan.semanticKey === hnArchiveSemanticKey(plan), 'HN plan digest/scope mismatch');
}
