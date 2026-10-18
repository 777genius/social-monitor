import { archiveHash, archiveNeed, canonicalJson, type HnArchiveScope } from './hn-archive-missing-policy';

export { archiveHash, archiveNeed, canonicalJson };

export type RssArchiveScope = HnArchiveScope;
export type RssArchiveItem = Readonly<{
  guid: string; publishedUtcDate: string; title: string;
  provenance: Readonly<Record<string, unknown>>; link: string | null; description: string;
}>;
export type RssArchiveManifest = Readonly<{
  generatedAt: string; jobId: string; window: Readonly<{ from: string; to: string }>;
  count: number; enrichedWithLink: number; items: readonly RssArchiveItem[]; itemsSha256: string;
}>;
export type RssArchiveMissingPlan = Readonly<{
  schemaVersion: 1; kind: 'rss-archive-missing.v1'; day: string; providerKey: 'rss';
  coverage: 'PARTIAL_ARCHIVED_OBSERVATIONS'; semanticKey: string; planSha256: string;
  packetSha256: string; manifestSha256: string; itemsSha256: string; scope: RssArchiveScope;
  bindingConfig: string; bindingConfigSha256: string;
  selectedIds: readonly string[]; candidateIds: readonly string[];
}>;
export type RssArchiveClaim = Readonly<{
  mode: 'import-rss-archive-missing'; inputRoot: string; day: string; journalDir: string;
  semanticKey: string; planSha256: string; packetSha256: string; correlationId: string;
}>;

const digest = /^[a-f0-9]{64}$/u;
const dayPattern = /^\d{4}-\d{2}-\d{2}$/u;
const utcPattern = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?Z$/u;
const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;

function object(value: unknown, reason: string): Record<string, unknown> {
  archiveNeed(value !== null && typeof value === 'object' && !Array.isArray(value), reason);
  return value as Record<string, unknown>;
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[], reason: string): void {
  archiveNeed(Object.keys(value).sort().join(',') === [...keys].sort().join(','), reason);
}
export function rssArchiveSemanticKey(input: {
  day: string; itemsSha256: string; selectedIds: readonly string[];
}): string {
  archiveNeed(dayPattern.test(input.day) && digest.test(input.itemsSha256), 'RSS semantic inputs invalid');
  archiveNeed(input.selectedIds.length > 0 && input.selectedIds.length <= 100 &&
    new Set(input.selectedIds).size === input.selectedIds.length &&
    input.selectedIds.every(id => id.trim().length > 0 && id.length <= 2048), 'RSS selected IDs invalid');
  return archiveHash(canonicalJson({
    kind: 'rss-archive-missing.v1', day: input.day,
    itemsSha256: input.itemsSha256, selectedIds: [...input.selectedIds],
  }));
}
export function parseRssArchiveManifest(input: unknown): RssArchiveManifest {
  const value = object(input, 'RSS manifest object required');
  exactKeys(value, ['generatedAt','jobId','window','count','enrichedWithLink','items','itemsSha256'],
    'RSS manifest shape invalid');
  const window = object(value.window, 'RSS manifest window invalid');
  exactKeys(window, ['from','to'], 'RSS manifest window shape invalid');
  archiveNeed(dayPattern.test(String(window.from)) && dayPattern.test(String(window.to)) &&
    Date.parse(`${window.from}T00:00:00Z`) <= Date.parse(`${window.to}T00:00:00Z`), 'RSS manifest window invalid');
  archiveNeed(typeof value.jobId === 'string' && /^[a-zA-Z0-9._:-]{1,128}$/u.test(value.jobId) &&
    Number.isInteger(value.count) && value.count === (value.items as unknown[]).length &&
    typeof value.enrichedWithLink === 'number' && Number.isInteger(value.enrichedWithLink) &&
    value.enrichedWithLink >= 0 && value.enrichedWithLink <= value.count && Array.isArray(value.items) &&
    digest.test(String(value.itemsSha256)), 'RSS manifest integrity invalid');
  archiveNeed(typeof value.generatedAt === 'string' && utcPattern.test(value.generatedAt) &&
    Number.isFinite(Date.parse(value.generatedAt)), 'RSS generatedAt invalid');
  return value as unknown as RssArchiveManifest;
}
export function qualifyRssArchiveItem(input: unknown, day: string, ordinal: number): RssArchiveItem {
  archiveNeed(dayPattern.test(day), 'RSS packet day invalid');
  const value = object(input, `RSS item ${ordinal} invalid`);
  exactKeys(value, ['guid','publishedUtcDate','title','provenance','link','description'],
    `RSS item ${ordinal} shape invalid`);
  archiveNeed(typeof value.guid === 'string' && value.guid.trim().length > 0 &&
    value.guid.length <= 2048 && value.publishedUtcDate === day &&
    typeof value.title === 'string' && value.title.trim().length > 0 &&
    typeof value.description === 'string', `RSS item ${ordinal} identity invalid`);
  archiveNeed(value.link === null || (typeof value.link === 'string' &&
    ['http:','https:'].includes(new URL(value.link).protocol)), `RSS item ${ordinal} link invalid`);
  const provenance = object(value.provenance, `RSS item ${ordinal} provenance invalid`);
  archiveNeed(Object.keys(provenance).length > 0, `RSS item ${ordinal} provenance empty`);
  return value as unknown as RssArchiveItem;
}
export function validateRssArchiveClaim(claim: unknown, plan: RssArchiveMissingPlan): RssArchiveClaim {
  const value = object(claim, 'RSS native claim object required');
  exactKeys(value, ['mode','inputRoot','day','journalDir','semanticKey','planSha256','packetSha256','correlationId'],
    'RSS native claim shape invalid');
  archiveNeed(value.mode === 'import-rss-archive-missing' && value.day === plan.day &&
    value.semanticKey === plan.semanticKey && value.planSha256 === plan.planSha256 &&
    value.packetSha256 === plan.packetSha256 && typeof value.inputRoot === 'string' &&
    typeof value.journalDir === 'string' && typeof value.correlationId === 'string' &&
    /^[a-zA-Z0-9._:-]{1,128}$/u.test(value.correlationId), 'RSS native claim identity invalid');
  return value as unknown as RssArchiveClaim;
}
export function rssArchiveJournalReceipt(input: {
  plan: RssArchiveMissingPlan; coverage: RssArchiveMissingPlan['coverage'];
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
export function validateRssArchivePlanShape(plan: RssArchiveMissingPlan, expectedPlanSha256: string): void {
  archiveNeed(digest.test(expectedPlanSha256) && plan.planSha256 === expectedPlanSha256 &&
    plan.schemaVersion === 1 && plan.kind === 'rss-archive-missing.v1' &&
    plan.providerKey === 'rss' && plan.coverage === 'PARTIAL_ARCHIVED_OBSERVATIONS' &&
    Object.values(plan.scope).every(value => uuidPattern.test(value)) &&
    archiveHash(plan.bindingConfig) === plan.bindingConfigSha256 &&
    plan.selectedIds.length > 0 && plan.selectedIds.length <= 100 &&
    canonicalJson(plan.selectedIds) === canonicalJson(plan.candidateIds) &&
    plan.semanticKey === rssArchiveSemanticKey(plan), 'RSS plan digest/scope mismatch');
}
