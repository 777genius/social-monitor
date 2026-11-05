import type { FetchedSourceItem } from '@social-monitor/ingestion/ports';
import type { JsonValue } from '@social-monitor/shared-kernel';
import {
  archiveNeed, qualifyRssArchiveItem, validateRssArchivePlanShape,
  type RssArchiveManifest, type RssArchiveMissingPlan,
} from './rss-archive-missing-policy';

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return value !== null && typeof value === 'object' &&
    Object.values(value).every(isJsonValue);
}
function isJsonObject(value: unknown): value is Readonly<Record<string, JsonValue>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.values(value).every(isJsonValue);
}
function requireJsonObject(value: unknown, reason: string): Readonly<Record<string, JsonValue>> {
  if (!isJsonObject(value)) throw new Error(reason);
  return value;
}

export type RssArchiveMissingResult = Readonly<{
  inserted: number; alreadyPresent: number; postWritePresent: number;
}>;
export type RssArchiveMissingDependencies = Readonly<{
  existingIds: (ids: readonly string[]) => Promise<readonly string[]>;
  insertMissing: (items: readonly FetchedSourceItem[]) => Promise<number>;
  present: (ids: readonly string[]) => Promise<number>;
}>;

export function normalizeRssArchiveMissing(input: unknown, day: string, selectedIds: readonly string[]): {
  items: readonly FetchedSourceItem[];
} {
  const manifest = parse(input);
  archiveNeed(manifest.items.every(item => item.publishedUtcDate === day), 'RSS packet/item day mismatch');
  archiveNeed(selectedIds.length > 0 && selectedIds.length <= 100 &&
    new Set(selectedIds).size === selectedIds.length, 'RSS packet selection invalid');
  const byId = new Map(manifest.items.map(item => [item.guid, item]));
  archiveNeed(selectedIds.every(id => byId.has(id)), 'RSS selected ID absent from manifest');
  return { items: selectedIds.map(id => normalizeItem(byId.get(id)!)) };
}
function parse(input: unknown): RssArchiveManifest {
  const raw = input as RssArchiveManifest;
  archiveNeed(raw !== null && typeof raw === 'object' && Array.isArray(raw.items), 'RSS manifest invalid');
  return {
    ...raw,
    items: raw.items.map((item, index) => qualifyRssArchiveItem(item, item.publishedUtcDate, index)),
  };
}
function normalizeItem(item: RssArchiveManifest['items'][number]): FetchedSourceItem {
  const fallback = `https://news.google.com/rss/articles/${encodeURIComponent(item.guid)}`;
  return {
    externalId: item.guid,
    canonicalUrl: item.link ?? fallback,
    title: item.title,
    body: item.description ?? '',
    publishedAt: new Date(`${item.publishedUtcDate}T00:00:00.000Z`),
    metadata: {
      kind: 'rss_item', title: item.title, description: item.description,
      provenance: requireJsonObject(item.provenance, 'RSS item provenance must be JSON'), publishedUtcDate: item.publishedUtcDate,
      publishedPrecision: 'day', publishedAtSource: 'day-boundary',
      canonicalUrlSource: item.link === null ? 'google-news-guid-fallback' : 'manifest-link',
      ...(item.link === null ? {} : { link: item.link }),
    },
  };
}
export async function executeRssArchiveMissingImport(
  plan: RssArchiveMissingPlan, manifestInput: unknown,
  dependencies: RssArchiveMissingDependencies,
  expectedPlanSha256 = plan.planSha256,
): Promise<RssArchiveMissingResult> {
  validateRssArchivePlanShape(plan, expectedPlanSha256);
  const normalized = normalizeRssArchiveMissing(manifestInput, plan.day, plan.selectedIds);
  const existing = new Set(await dependencies.existingIds(plan.selectedIds));
  archiveNeed([...existing].every(id => plan.selectedIds.includes(id)), 'RSS existing ID outside packet');
  const missing = normalized.items.filter(item => !existing.has(item.externalId));
  let inserted = 0;
  if (missing.length > 0) {
    inserted = await dependencies.insertMissing(missing);
    archiveNeed(inserted === missing.length, 'RSS insert count uncertain');
  }
  const postWritePresent = await dependencies.present(plan.selectedIds);
  archiveNeed(postWritePresent === plan.selectedIds.length, 'RSS post-write readback uncertain');
  return { inserted, alreadyPresent: existing.size, postWritePresent };
}
