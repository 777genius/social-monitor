import {
  conversationSignalBaselineSampleFromUnit,
  type ConversationSignalBaselineSample,
  type ConversationUnit,
} from '../../domain';
import type {
  ConversationSignalBaselineCohortFilter,
  ConversationSignalBaselineRepositoryPort,
  ListConversationSignalBaselineSamplesQuery,
} from '../../ports/conversation-signal-baseline-repository.port';
import type {
  ConversationUnitRepositoryPort,
  ListConversationUnitsByRootQuery,
  SaveConversationUnitsCommand,
  SaveConversationUnitsResult,
} from '../../ports/conversation-unit-repository.port';

export class InMemoryConversationUnitRepository
  implements ConversationUnitRepositoryPort, ConversationSignalBaselineRepositoryPort
{
  private readonly unitsByProviderKey = new Map<string, ConversationUnit>();

  async saveBatch(
    command: SaveConversationUnitsCommand,
  ): Promise<SaveConversationUnitsResult> {
    let saved = 0;

    for (const unit of command.units) {
      const snapshot = unit.toSnapshot();
      if (
        snapshot.tenantId !== command.tenantId ||
        snapshot.workspaceId !== command.workspaceId
      ) {
        continue;
      }

      this.unitsByProviderKey.set(
        [snapshot.tenantId, snapshot.providerKey, snapshot.providerUnitId].join(':'),
        unit,
      );
      saved += 1;
    }

    return { saved };
  }

  async listByRootFeedItemIds(
    query: ListConversationUnitsByRootQuery,
  ): Promise<readonly ConversationUnit[]> {
    const rootIds = new Set(query.rootFeedItemIds);
    const grouped = new Map<string, ConversationUnit[]>();

    for (const unit of this.unitsByProviderKey.values()) {
      const snapshot = unit.toSnapshot();
      if (
        snapshot.tenantId !== query.tenantId ||
        snapshot.workspaceId !== query.workspaceId ||
        !rootIds.has(snapshot.rootFeedItemId)
      ) {
        continue;
      }

      const existing = grouped.get(snapshot.rootFeedItemId) ?? [];
      existing.push(unit);
      grouped.set(snapshot.rootFeedItemId, existing);
    }

    return [...grouped.values()].flatMap((units) =>
      units.sort(compareConversationUnits).slice(0, query.limitPerRoot),
    );
  }

  async listSamples(
    query: ListConversationSignalBaselineSamplesQuery,
  ): Promise<readonly ConversationSignalBaselineSample[]> {
    return [...this.unitsByProviderKey.values()]
      .flatMap((unit) => {
        const snapshot = unit.toSnapshot();
        const inScope =
          snapshot.tenantId === query.tenantId &&
          snapshot.workspaceId === query.workspaceId &&
          (query.interestId === undefined ||
            snapshot.interestId === query.interestId) &&
          snapshot.observedAt.getTime() > query.observedAfter.getTime();

        if (!inScope) {
          return [];
        }

        const sample = conversationSignalBaselineSampleFromUnit(unit);

        return sample === undefined ? [] : [sample];
      })
      .filter((sample) =>
        matchesBaselineCohortFilters(sample, query.cohortFilters ?? []),
      )
      .sort(compareConversationSignalBaselineSamples)
      .slice(0, query.limit);
  }

  all(): readonly ConversationUnit[] {
    return [...this.unitsByProviderKey.values()];
  }
}

const compareConversationUnits = (
  left: ConversationUnit,
  right: ConversationUnit,
): number => {
  const leftSnapshot = left.toSnapshot();
  const rightSnapshot = right.toSnapshot();
  const scoreDiff =
    readScore(rightSnapshot.providerMetadata) -
    readScore(leftSnapshot.providerMetadata);

  if (scoreDiff !== 0) {
    return scoreDiff;
  }

  const rankDiff = readRank(leftSnapshot.providerMetadata) -
    readRank(rightSnapshot.providerMetadata);
  if (rankDiff !== 0) {
    return rankDiff;
  }

  const depthDiff = leftSnapshot.depth - rightSnapshot.depth;
  if (depthDiff !== 0) {
    return depthDiff;
  }

  return rightSnapshot.publishedAt.getTime() - leftSnapshot.publishedAt.getTime();
};

const compareConversationSignalBaselineSamples = (
  left: ConversationSignalBaselineSample,
  right: ConversationSignalBaselineSample,
): number => {
  const observedDiff = right.observedAt.getTime() - left.observedAt.getTime();

  if (observedDiff !== 0) {
    return observedDiff;
  }

  return right.conversationUnitId.localeCompare(left.conversationUnitId);
};

const matchesBaselineCohortFilters = (
  sample: ConversationSignalBaselineSample,
  filters: readonly ConversationSignalBaselineCohortFilter[],
): boolean =>
  filters.length === 0 ||
  filters.some(
    (filter) =>
      sample.providerKey === filter.providerKey &&
      sample.sourceKey === filter.sourceKey &&
      sample.contentType === filter.contentType,
  );

const readScore = (metadata: unknown): number => {
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
    return 0;
  }

  const value = (metadata as Readonly<Record<string, unknown>>).score;

  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
};

const readRank = (metadata: unknown): number => {
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
    return Number.POSITIVE_INFINITY;
  }

  const value = (metadata as Readonly<Record<string, unknown>>).rank;

  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : Number.POSITIVE_INFINITY;
};
