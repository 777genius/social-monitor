import type { SourceItem } from "../../domain";
import {
  SourceItemPersistenceContractError,
  type FetchedSourceItem,
  type SavedSourceItemRef,
} from "../../ports";

export const mergeEnrichedSourceCandidates = (params: {
  readonly fetchedItems: readonly FetchedSourceItem[];
  readonly itemsRequiringEnrichment: readonly FetchedSourceItem[];
  readonly enrichedItems: readonly FetchedSourceItem[];
}): readonly FetchedSourceItem[] => {
  const requiresEnrichment = new Set(
    params.itemsRequiringEnrichment.map((item) => item.externalId),
  );
  const enrichedByExternalId = new Map(
    params.enrichedItems.map((item) => [item.externalId, item]),
  );
  return params.fetchedItems.flatMap((item) => {
    if (!requiresEnrichment.has(item.externalId)) {
      return [item];
    }
    const enriched = enrichedByExternalId.get(item.externalId);
    return enriched === undefined ? [] : [enriched];
  });
};

export const rehydratePersistedSourceItems = (
  items: readonly SourceItem[],
  refs: readonly SavedSourceItemRef[],
): readonly SourceItem[] => {
  if (items.length !== refs.length) {
    throw new SourceItemPersistenceContractError(
      `Source item repository returned ${refs.length} saved refs for ${items.length} source items`,
    );
  }

  const persistedRefByExternalId = new Map<string, SavedSourceItemRef>();
  for (const ref of refs) {
    const existing = persistedRefByExternalId.get(ref.externalId);
    if (existing !== undefined && existing.sourceItemId !== ref.sourceItemId) {
      throw new SourceItemPersistenceContractError(
        `Source item repository returned conflicting ids for external item ${ref.externalId}`,
      );
    }

    const persistedSnapshot = ref.persistedItem.toSnapshot();
    if (
      persistedSnapshot.externalId !== ref.externalId ||
      persistedSnapshot.id !== ref.sourceItemId
    ) {
      throw new SourceItemPersistenceContractError(
        `Source item repository returned incoherent persisted identity for external item ${ref.externalId}`,
      );
    }
    persistedRefByExternalId.set(ref.externalId, ref);
  }

  return items.map((item) => {
    const snapshot = item.toSnapshot();
    const persistedRef = persistedRefByExternalId.get(snapshot.externalId);
    if (persistedRef === undefined) {
      throw new SourceItemPersistenceContractError(
        `Source item repository did not return a saved ref for external item ${snapshot.externalId}`,
      );
    }
    const persistedSnapshot = persistedRef.persistedItem.toSnapshot();
    if (
      persistedSnapshot.tenantId !== snapshot.tenantId ||
      persistedSnapshot.workspaceId !== snapshot.workspaceId ||
      persistedSnapshot.sourceBindingId !== snapshot.sourceBindingId
    ) {
      throw new SourceItemPersistenceContractError(
        `Source item repository returned an out-of-scope persisted item for external item ${snapshot.externalId}`,
      );
    }
    return persistedRef.persistedItem;
  });
};
