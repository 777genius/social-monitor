import type { EventEnvelope } from '@social-monitor/shared-kernel';

import type { SummaryArtifact } from '../../../domain';
import type { PrismaSummaryClient } from './prisma-summary-client';
import {
  serializeSummaryArtifact,
  summaryArtifactStatusToPrisma,
  summaryQualitySignalsToPrisma,
} from './prisma-summary-records';

export const summaryArtifactWrite = (
  artifact: SummaryArtifact,
): Parameters<PrismaSummaryClient['summaryArtifact']['upsert']>[0] => {
  const snapshot = artifact.toSnapshot();
  const mutation = {
    status: summaryArtifactStatusToPrisma(artifact),
    userId: snapshot.userId ?? null,
    subscriptionId: snapshot.subscriptionId ?? null,
    modelVersion: snapshot.lineage.modelVersion,
    promptVersion: snapshot.lineage.promptVersion,
    headline: snapshot.headline,
    summaryText: snapshot.executiveSummary,
    artifactPayload: serializeSummaryArtifact(artifact),
    citations: snapshot.citationMap,
    qualitySignals: summaryQualitySignalsToPrisma(artifact),
  };
  return {
    where: { id: snapshot.summaryId },
    update: mutation,
    create: {
      ...mutation,
      id: snapshot.summaryId,
      tenantId: snapshot.tenantId,
      workspaceId: snapshot.workspaceId,
      interestId: snapshot.interestId,
      schemaVersion: 1,
    },
  };
};

export const summaryEventWrite = (
  event: EventEnvelope<Readonly<Record<string, unknown>>>,
): Parameters<PrismaSummaryClient['outboxEvent']['create']>[0] => ({
  data: {
    id: event.eventId,
    tenantId: event.tenantId ?? null,
    workspaceId: event.workspaceId ?? null,
    eventType: event.eventType,
    schemaVersion: event.schemaVersion,
    payload: event.payload,
    correlationId: event.correlationId,
    causationId: event.causationId ?? null,
  },
});
