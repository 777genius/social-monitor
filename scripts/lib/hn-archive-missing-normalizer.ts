import type { FetchedConversationUnit, FetchedSourceItem } from '@social-monitor/ingestion/ports';
import type { JsonValue } from '@social-monitor/shared-kernel';
import {
  archiveNeed, qualifyHnArchiveItem, validateHnArchivePlanShape,
  type HnArchiveItem, type HnArchiveManifest, type HnArchiveMissingPlan,
} from './hn-archive-missing-policy';

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

export type HnArchiveMissingResult = Readonly<{
  inserted: number; alreadyPresent: number; postWritePresent: number;
}>;
export type HnArchiveMissingDependencies = Readonly<{
  existingIds: (ids: readonly string[]) => Promise<readonly string[]>;
  insertMissing: (items: readonly FetchedSourceItem[]) => Promise<number>;
  present: (ids: readonly string[]) => Promise<number>;
  projectComments: (units: readonly FetchedConversationUnit[]) => Promise<number>;
}>;

export function normalizeHnArchiveMissing(input: unknown, day: string, selectedIds: readonly string[]): {
  items: readonly FetchedSourceItem[]; conversationUnits: readonly FetchedConversationUnit[];
} {
  const manifest = parse(input);
  archiveNeed(manifest.items.every(item => item.publishedUtcDate === day), 'HN packet/item day mismatch');
  archiveNeed(selectedIds.length > 0 && selectedIds.length <= 100 &&
    new Set(selectedIds).size === selectedIds.length, 'HN packet selection invalid');
  const byId = new Map(manifest.items.map(item => [item.externalId, item]));
  archiveNeed(selectedIds.every(id => byId.has(id)), 'HN selected ID absent from manifest');
  const items = selectedIds.map(id => normalizeItem(byId.get(id)!));
  return {
    items,
    conversationUnits: selectedIds.flatMap(id => normalizeComments(byId.get(id)!)),
  };
}
function parse(input: unknown): HnArchiveManifest {
  const raw = input as HnArchiveManifest;
  archiveNeed(raw !== null && typeof raw === 'object' && Array.isArray(raw.items), 'HN manifest invalid');
  return {
    ...raw,
    items: raw.items.map((item, index) => qualifyHnArchiveItem(item, item.publishedUtcDate, index)),
  };
}
function normalizeItem(item: HnArchiveItem): FetchedSourceItem {
  return {
    externalId: item.externalId,
    canonicalUrl: item.url ?? `https://news.ycombinator.com/item?id=${item.objectId}`,
    title: item.title,
    body: item.storyText ?? '',
    authorHandle: item.author,
    publishedAt: new Date(item.createdAt),
    metadata: {
      kind: 'hacker_news_story', title: item.title, author: item.author,
      points: item.points, storyText: item.storyText, commentCount: item.commentCount,
      provenance: requireJsonObject(item.provenance, 'HN item provenance must be JSON'), retrievedForPass: item.retrievedForPass,
      publishedUtcDate: item.publishedUtcDate,
    },
  };
}
function normalizeComments(item: HnArchiveItem): readonly FetchedConversationUnit[] {
  const rootExternalId = item.externalId;
  return item.comments.map(comment => ({
    rootExternalId,
    rootProviderItemId: String(item.objectId),
    providerUnitId: `hn:${comment.id}`,
    canonicalUrl: `https://news.ycombinator.com/item?id=${comment.id}`,
    body: comment.text,
    authorHandle: comment.author,
    publishedAt: new Date(comment.createdAt),
    threadExternalId: rootExternalId,
    depth: comment.depth,
    role: comment.depth === 1 ? 'top_level_comment' : 'reply',
    metadata: {
      kind: 'hacker_news_comment', contentType: 'comment', rootProviderItemId: item.objectId,
      commentId: comment.id, author: comment.author, createdAt: comment.createdAt,
      depth: comment.depth, text: comment.text,
      provenance: requireJsonObject(item.provenance, 'HN item provenance must be JSON'),
    },
  }));
}
export async function executeHnArchiveMissingImport(
  plan: HnArchiveMissingPlan, manifestInput: unknown,
  dependencies: HnArchiveMissingDependencies,
  expectedPlanSha256 = plan.planSha256,
): Promise<HnArchiveMissingResult> {
  validateHnArchivePlanShape(plan, expectedPlanSha256);
  const normalized = normalizeHnArchiveMissing(manifestInput, plan.day, plan.selectedIds);
  const existing = new Set(await dependencies.existingIds(plan.selectedIds));
  archiveNeed([...existing].every(id => plan.selectedIds.includes(id)), 'HN existing ID outside packet');
  const missing = normalized.items.filter(item => !existing.has(item.externalId));
  const missingIds = new Set(missing.map(item => item.externalId));
  let inserted = 0;
  if (missing.length > 0) {
    inserted = await dependencies.insertMissing(missing);
    archiveNeed(inserted === missing.length, 'HN insert count uncertain');
    const projected = await dependencies.projectComments(
      normalized.conversationUnits.filter(unit => missingIds.has(unit.rootExternalId)));
    archiveNeed(projected === normalized.conversationUnits.filter(unit => missingIds.has(unit.rootExternalId)).length,
      'HN conversation projection uncertain');
  }
  const postWritePresent = await dependencies.present(plan.selectedIds);
  archiveNeed(postWritePresent === plan.selectedIds.length, 'HN post-write readback uncertain');
  return { inserted, alreadyPresent: existing.size, postWritePresent };
}
