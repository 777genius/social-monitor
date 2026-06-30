import {
  emptyJsonObjectAsUndefined,
  normalizeJsonObject,
  tenantId,
  workspaceId,
} from '@social-monitor/shared-kernel';

import {
  contentHashForConversationUnit,
  ConversationUnit,
  type ConversationUnitProps,
  type ConversationUnitRole,
} from '../../../domain';
import type {
  PrismaConversationSignalBaselineSampleRecord,
  PrismaConversationUnitRecord,
} from './prisma-conversation-client';

export const conversationUnitFromPrisma = (
  record: PrismaConversationUnitRecord,
): ConversationUnit =>
  ConversationUnit.rehydrate({
    id: record.id,
    tenantId: tenantId(record.tenantId),
    workspaceId: workspaceId(record.workspaceId),
    interestId: record.interestId,
    sourceBindingId: record.sourceBindingId,
    rootFeedItemId: record.rootFeedItemId,
    rootProviderItemId: record.rootProviderItemId,
    providerKey: record.providerKey,
    providerUnitId: record.providerUnitId,
    canonicalUrl: record.canonicalUrl,
    authorHandle: record.authorHandle ?? undefined,
    body: record.body,
    publishedAt: record.publishedAt,
    observedAt: record.observedAt,
    threadExternalId: record.threadExternalId,
    parentProviderUnitId: record.parentProviderUnitId ?? undefined,
    depth: record.depth,
    role: readRole(record.role),
    providerMetadata: emptyJsonObjectAsUndefined(
      normalizeJsonObject(record.providerMetadata),
    ),
    contentHash: record.contentHash,
    schemaVersion: record.schemaVersion,
  } satisfies ConversationUnitProps);

export const conversationSignalBaselineSampleFromPrisma = (
  record: PrismaConversationSignalBaselineSampleRecord,
) => ({
  unitId: record.conversationUnitId,
  conversationUnitId: record.conversationUnitId,
  interestId: record.interestId,
  providerKey: record.providerKey,
  sourceKey: record.sourceKey,
  contentType: record.contentType,
  strength: record.strength,
  publishedAt: record.publishedAt,
  observedAt: record.observedAt,
});

const readRole = (value: string): ConversationUnitRole =>
  value === 'reply' ? 'reply' : 'top_level_comment';
