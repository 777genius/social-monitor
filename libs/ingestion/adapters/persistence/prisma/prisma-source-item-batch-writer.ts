import { sourceItemIdentityCandidates } from '../github-trending-source-identities';
import { preserveVerifiedLegacyCapture } from '../../../domain/value-objects/legacy-source-capture';
import { prepareArticleCaptureAttempt } from '../../../domain/value-objects/article-capture-attempt';
import {
  captureNativeText,
  readContentCapture,
  preserveNativeCaptureAvailability,
  preserveSourceCapture,
} from '../../../domain/value-objects/source-content-capture';
import {
  assertGitHubTrendingDurableObservationCoherence,
  GITHUB_TRENDING_PAGE_PROVIDER_KEY,
  sourceItemProviderContentHash,
  SourceItem,
  type SourceItemProps,
} from '../../../domain';
import type {
  SavedSourceItemRef,
  SaveSourceItemsCommand,
  SaveSourceItemsResult,
} from '../../../ports';
import type { PrismaIngestionClient } from './prisma-ingestion-client';
import {
  contentHashForSourceItem,
  sourceItemFromPrisma,
  type PrismaSourceItemRecord,
} from './prisma-ingestion-records';

/** Assumes its caller owns a Serializable transaction and cross-process retry. */
export async function saveSourceItemBatchWithinTransaction(params: {
  readonly transaction: PrismaIngestionClient;
  readonly command: SaveSourceItemsCommand;
  readonly githubObservedAt?: Date;
  readonly writeMode: 'update-existing' | 'insert-only';
  readonly archiveOnly: boolean;
}): Promise<SaveSourceItemsResult> {
  const { transaction, command, githubObservedAt, writeMode, archiveOnly } = params;
  let inserted = 0;
  let contentUpdated = 0;
  let skippedDuplicates = 0;
  const savedItems: SavedSourceItemRef[] = [];
  const existingByProviderItemId = await findExistingSourceItems(
    transaction,
    command,
  );
  if (writeMode === "insert-only" && existingByProviderItemId.size > 0) {
    throw new Error("Insert-only source item batch conflicts with an existing ID");
  }
  if (githubObservedAt !== undefined) {
    for (const existing of existingByProviderItemId.values()) {
      assertGitHubTrendingDurableObservationCoherence({
        providerKey: command.providerKey,
        incomingObservedAt: githubObservedAt,
        persistedObservedAt: existing.observedAt,
      });
    }
  }

  for (const item of command.items) {
    const raw = item.toSnapshot();
    let snapshot = archiveOnly || command.providerKey === GITHUB_TRENDING_PAGE_PROVIDER_KEY ? raw : captureNativeText(raw, command.providerKey, raw.ingestedAt);
    const existing = existingByProviderItemId.get(snapshot.externalId);
    if (existing !== undefined && existing.sourceBindingId === snapshot.sourceBindingId) {
      snapshot = preserveSourceCapture(snapshot, sourceItemFromPrisma(existing).toSnapshot());
      snapshot = preserveVerifiedLegacyCapture(snapshot, sourceItemFromPrisma(existing).toSnapshot(), command.providerKey,
        command.unchangedNativeExternalIds?.includes(snapshot.externalId) ?? false);
    }
    if (!archiveOnly) snapshot = prepareArticleCaptureAttempt(snapshot, raw.ingestedAt);
    const providerContentHash = sourceItemProviderContentHash({
      providerKey: command.providerKey,
      snapshot,
    });
    if (existing !== undefined) {
      if (writeMode === "insert-only") {
        throw new Error("Insert-only source item batch conflicts with an existing ID");
      }
      const update = await updateExistingSourceItem(transaction, {
        existing,
        snapshot,
        providerContentHash,
        providerKey: command.providerKey,
        immutable:
          command.providerKey === GITHUB_TRENDING_PAGE_PROVIDER_KEY,
      });
      existingByProviderItemId.set(snapshot.externalId, update.record);
      contentUpdated += update.contentChanged ? 1 : 0;
      skippedDuplicates += update.contentChanged ? 0 : 1;
      savedItems.push(
        savedItemRef(snapshot.externalId, update.record, update),
      );
      continue;
    }

    const created = await transaction.sourceItem.create({
      data: {
        id: snapshot.id,
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        sourceBindingId: snapshot.sourceBindingId,
        providerKey: command.providerKey,
        providerItemId: snapshot.externalId,
        canonicalUrl: snapshot.canonicalUrl,
        title: snapshot.title,
        body: snapshot.body,
        authorHandle: snapshot.authorHandle ?? null,
        publishedAt: snapshot.publishedAt,
        contentHash: contentHashForSourceItem(snapshot),
        providerContentHash,
        observedAt: snapshot.ingestedAt,
        lastObservedAt: snapshot.ingestedAt,
        contentUpdatedAt: snapshot.ingestedAt,
        metadata: snapshot.metadata ?? {},
      },
    });
    inserted += 1;
    savedItems.push({
      externalId: snapshot.externalId,
      sourceItemId: created.id,
      persistedItem: sourceItemFromPrisma(created),
      inserted: true,
      mutationKind: "inserted",
    });
    existingByProviderItemId.set(snapshot.externalId, created);
  }

  return { inserted, contentUpdated, skippedDuplicates, items: savedItems };

}

async function updateExistingSourceItem(
  transaction: PrismaIngestionClient,
  params: {
    readonly existing: PrismaSourceItemRecord;
    readonly snapshot: SourceItemProps;
    readonly providerContentHash: string;
    readonly providerKey: string;
    readonly immutable: boolean;
  },
): Promise<{
  readonly record: PrismaSourceItemRecord;
  readonly contentChanged: boolean;
  readonly projectionItem?: SourceItem;
}> {
  // Serializable replays can observe a newer committed value than the scan
  // being retried. Do not let an older observation regress content or clocks.
  const persistedObservedAt = params.existing.lastObservedAt ?? params.existing.observedAt;
  if (params.snapshot.ingestedAt.getTime() < persistedObservedAt.getTime()) {
    // The old RSS positional ID may be migrated without overwriting newer
    // content, clocks, or article capture. The Serializable transaction owns it.
    let record = params.existing;
    if (params.providerKey === 'rss' &&
        record.providerItemId !== params.snapshot.externalId) {
      if (transaction.sourceItem.update === undefined) {
        throw new Error("Source item repository requires scoped update support");
      }
      record = await transaction.sourceItem.update({
        where: { id: record.id },
        data: { providerItemId: params.snapshot.externalId },
      });
    }
    return {
      record,
      contentChanged: false,
      ...(record.sourceBindingId === params.snapshot.sourceBindingId ? {} : {
        projectionItem: bindingScopedStaleProjection(
          record, params.snapshot, params.providerKey,
        ),
      }),
    };
  }
  const contentChanged =
    params.existing.providerContentHash === null ||
    params.existing.providerContentHash !== params.providerContentHash;
  // The provider fingerprint includes binding provenance. A shared item
  // observed through another binding still needs that provenance persisted,
  // but must retain its existing assessment revision and cutoff clock when
  // every other fingerprint input is unchanged. This also preserves legacy
  // binding-inclusive content hashes until a real content revision occurs.
  const bindingOnlyChange = contentChanged &&
    params.existing.sourceBindingId !== params.snapshot.sourceBindingId &&
    sourceItemProviderContentHash({
      providerKey: params.providerKey,
      snapshot: sourceItemFromPrisma(params.existing).toSnapshot(),
    }) === sourceItemProviderContentHash({
      providerKey: params.providerKey,
      snapshot: { ...params.snapshot, sourceBindingId: params.existing.sourceBindingId },
    });
  const snapshot = bindingOnlyChange
    ? preserveNativeCaptureAvailability(params.snapshot, sourceItemFromPrisma(params.existing).toSnapshot())
    : params.snapshot;
  if (params.immutable) {
    return { record: params.existing, contentChanged: false };
  }
  if (transaction.sourceItem.update === undefined) {
    throw new Error("Source item repository requires scoped update support");
  }
  const record = await transaction.sourceItem.update({
    where: { id: params.existing.id },
    data: contentChanged
      ? {
          ...(params.existing.providerItemId === params.snapshot.externalId
            ? {} : { providerItemId: params.snapshot.externalId }),
          sourceBindingId: params.snapshot.sourceBindingId,
          canonicalUrl: params.snapshot.canonicalUrl,
          title: params.snapshot.title,
          body: params.snapshot.body,
          authorHandle: params.snapshot.authorHandle ?? null,
          publishedAt: params.snapshot.publishedAt,
          contentHash: bindingOnlyChange ? params.existing.contentHash : contentHashForSourceItem(params.snapshot),
          providerContentHash: params.providerContentHash,
          lastObservedAt: params.snapshot.ingestedAt,
          ...(bindingOnlyChange ? {} : { contentUpdatedAt: params.snapshot.ingestedAt }),
          metadata: snapshot.metadata ?? {},
        }
      : {
          ...(params.existing.providerItemId === params.snapshot.externalId
            ? {} : { providerItemId: params.snapshot.externalId }),
          providerContentHash: params.providerContentHash,
          lastObservedAt: params.snapshot.ingestedAt,
          metadata: params.snapshot.metadata ?? {},
        },
  });
  // Binding-only provenance updates retain their revision, but are still observable writes.
  return { record, contentChanged };
}

/** Reuse newer native content without copying another binding's article capture or changing DB state. */
function bindingScopedStaleProjection(
  existing: PrismaSourceItemRecord,
  incoming: SourceItemProps,
  providerKey: string,
): SourceItem {
  const saved = sourceItemFromPrisma(existing).toSnapshot();
  const captured = readContentCapture(saved);
  const nativeBody = captured === undefined
    ? incoming.body
    : saved.body.slice(captured.native.offset, captured.native.offset + captured.native.length);
  const metadata = Object.fromEntries(
    Object.entries(incoming.metadata ?? {}).filter(
      ([key]) => !['contentCapture', 'articleCaptureAttempt', 'articleContent'].includes(key),
    ),
  );
  return SourceItem.rehydrate(captureNativeText({
    ...saved,
    sourceBindingId: incoming.sourceBindingId,
    body: nativeBody,
    metadata,
  }, providerKey, saved.ingestedAt));
}

function matchExistingSourceItems(
  command: SaveSourceItemsCommand,
  records: readonly PrismaSourceItemRecord[],
): Map<string, PrismaSourceItemRecord> {
  const byId = new Map(records.map((record) => [record.providerItemId, record]));
  const found = new Map(byId);
  for (const item of command.items) {
    const snapshot = item.toSnapshot();
    const matches = sourceItemIdentityCandidates(command.providerKey, snapshot)
      .flatMap((id) => byId.has(id) ? [byId.get(id)!] : []);
    if (matches.length > 1) throw new Error('Ambiguous GitHub Trending source identity');
    if (matches.length === 1) found.set(snapshot.externalId, matches[0]!);
  }
  return found;
}

async function findExistingSourceItems(
  transaction: PrismaIngestionClient,
  command: SaveSourceItemsCommand,
): Promise<Map<string, PrismaSourceItemRecord>> {
  const externalIds = [
    ...new Set(command.items.flatMap((item) => sourceItemIdentityCandidates(command.providerKey, item.toSnapshot()))),
  ];
  if (externalIds.length === 0) {
    return new Map();
  }
  if (transaction.sourceItem.findMany === undefined) {
    const records = await Promise.all(
      externalIds.map((providerItemId) =>
        transaction.sourceItem.findFirst({
          where: {
            tenantId: command.tenantId,
            workspaceId: command.workspaceId,
            providerKey: command.providerKey,
            providerItemId,
          },
        }),
      ),
    );
    return matchExistingSourceItems(command, records.filter((record): record is PrismaSourceItemRecord => record !== null));
  }
  const records = await transaction.sourceItem.findMany({
    where: {
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      providerKey: command.providerKey,
      providerItemId: { in: externalIds },
    },
  });
  const found = matchExistingSourceItems(command, records);
  // Older RSS versions used canonicalUrl#<feed-index> for GUID-less items.
  // Reuse only an unambiguous, tenant-scoped legacy row and migrate the
  // provider ID in the same Serializable transaction, retaining its DB ID.
  const pendingRss = command.providerKey === 'rss'
    ? command.items.map((item) => item.toSnapshot()).filter((snapshot) =>
        !found.has(snapshot.externalId) &&
        snapshot.externalId.startsWith(`${snapshot.canonicalUrl}#rss2-`))
    : [];
  if (pendingRss.length === 0) return found;
  const legacyClient = transaction.sourceItem as typeof transaction.sourceItem & {
    findMany(args: { readonly where: {
      readonly tenantId: string;
      readonly workspaceId: string;
      readonly providerKey: string;
      readonly canonicalUrl: { readonly in: readonly string[] };
    } }): Promise<readonly PrismaSourceItemRecord[]>;
  };
  const legacyRows = await legacyClient.findMany({
    where: {
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      providerKey: command.providerKey,
      canonicalUrl: { in: [...new Set(pendingRss.map((item) => item.canonicalUrl))] },
    },
  });
  const claimedLegacyIds = new Set<string>();
  for (const incoming of pendingRss) {
    const prefix = `${incoming.canonicalUrl}#`;
    const matches = legacyRows.filter((existing) =>
      existing.canonicalUrl === incoming.canonicalUrl &&
      existing.providerItemId.startsWith(prefix) &&
      /^\d+$/.test(existing.providerItemId.slice(prefix.length)) &&
      existing.title === incoming.title &&
      existing.publishedAt.getTime() === incoming.publishedAt.getTime());
    if (matches.length !== 1 || claimedLegacyIds.has(matches[0]!.id)) continue;
    found.set(incoming.externalId, matches[0]!);
    claimedLegacyIds.add(matches[0]!.id);
  }
  return found;
}

const savedItemRef = (
  externalId: string,
  record: PrismaSourceItemRecord,
  update: { readonly contentChanged: boolean; readonly projectionItem?: SourceItem },
): SavedSourceItemRef => ({
  externalId,
  sourceItemId: record.id,
  persistedItem: sourceItemFromPrisma(record),
  ...(update.projectionItem === undefined ? {} : { projectionItem: update.projectionItem }),
  inserted: false,
  mutationKind: update.contentChanged ? "content_updated" : "unchanged",
});

