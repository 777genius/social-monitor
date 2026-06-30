import {
  contentHashForConversationUnit,
  ConversationUnit,
  type ConversationUnitProps,
} from '@social-monitor/conversation/domain';
import type { ConversationUnitRepositoryPort } from '@social-monitor/conversation/ports';
import type {
  ConversationProjectionPort,
  ProjectConversationUnitsCommand,
  ProjectConversationUnitsResult,
} from '@social-monitor/ingestion/ports';
import {
  emptyJsonObjectAsUndefined,
  normalizeJsonObject,
} from '@social-monitor/shared-kernel';
import type { IdGenerator } from '@social-monitor/shared-kernel';

export class ConversationUnitProjectionAdapter implements ConversationProjectionPort {
  constructor(
    private readonly repository: ConversationUnitRepositoryPort,
    private readonly ids: IdGenerator,
  ) {}

  async project(
    command: ProjectConversationUnitsCommand,
  ): Promise<ProjectConversationUnitsResult> {
    const roots = rootFeedItemIdByExternalId(command.projectedFeedItems);
    const units: ConversationUnit[] = [];
    let skippedOrphans = 0;
    let skippedInvalid = 0;

    for (const fetched of command.conversationUnits) {
      const rootFeedItemId = roots.get(fetched.rootExternalId);

      if (rootFeedItemId === undefined) {
        skippedOrphans += 1;
        continue;
      }

      try {
        const props: ConversationUnitProps = {
          id: this.ids.generate(),
          tenantId: command.tenantId,
          workspaceId: command.workspaceId,
          interestId: command.interestId,
          sourceBindingId: command.sourceBindingId,
          rootFeedItemId,
          rootProviderItemId: fetched.rootProviderItemId,
          providerKey: command.providerKey,
          providerUnitId: fetched.providerUnitId,
          canonicalUrl: fetched.canonicalUrl,
          authorHandle: fetched.authorHandle,
          body: fetched.body,
          publishedAt: fetched.publishedAt,
          observedAt: command.observedAt,
          threadExternalId: fetched.threadExternalId,
          parentProviderUnitId: fetched.parentProviderUnitId,
          depth: fetched.depth,
          role: fetched.role,
          providerMetadata: emptyJsonObjectAsUndefined(
            normalizeJsonObject(fetched.metadata),
          ),
          contentHash: '',
          schemaVersion: 1,
        };

        units.push(
          ConversationUnit.capture({
            ...props,
            contentHash: contentHashForConversationUnit(props),
          }),
        );
      } catch {
        skippedInvalid += 1;
      }
    }

    const result = await this.repository.saveBatch({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      units,
    });

    return {
      projected: result.saved,
      skippedOrphans,
      skippedInvalid,
    };
  }
}

const rootFeedItemIdByExternalId = (
  refs: readonly ProjectConversationUnitsCommand['projectedFeedItems'][number][],
): ReadonlyMap<string, string> => {
  const result = new Map<string, string>();

  for (const ref of refs) {
    result.set(ref.sourceExternalId, ref.feedItemId);
  }

  return result;
};
