import { createHash } from 'node:crypto';

import {
  type Clock,
  DomainError,
  type IdGenerator,
  err,
  ok,
  type Result,
} from '@social-monitor/shared-kernel';

import type { DigestProvenanceItem } from '../../domain';
import { Digest } from '../../domain';
import type { DigestRepositoryPort, DigestSourceReaderPort } from '../../ports';
import type { QueueDeliveryAttemptUseCase } from '../queue-delivery-attempt/queue-delivery-attempt.use-case';
import { presentDigest } from '../shared/digest-presenter';
import type { AssembleDigestCommand } from './assemble-digest.command';
import type { AssembleDigestResult } from './assemble-digest.result';

type AssembleDigestFailure = DomainError | Error;

export class AssembleDigestUseCase {
  constructor(
    private readonly digests: DigestRepositoryPort,
    private readonly sources: DigestSourceReaderPort,
    private readonly queueDeliveryAttempt: QueueDeliveryAttemptUseCase,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(command: AssembleDigestCommand): Promise<Result<AssembleDigestResult, AssembleDigestFailure>> {
    const validation = validate(command);

    if (validation !== null) {
      return err(validation);
    }

    const interestIds = uniqueSorted(command.interestIds);
    const windowId = buildWindowId(command.windowStartedAt, command.windowEndedAt);
    const existing = await this.digests.findByWindow({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      recipientKey: command.recipientKey,
      channel: command.channel,
      windowId,
    });

    if (existing !== null) {
      return ok({
        digest: presentDigest(existing),
        created: false,
      });
    }

    const sourceWindow = await this.sources.readWindow({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      interestIds,
      startedAt: command.windowStartedAt,
      endedAt: command.windowEndedAt,
    });
    const includedSummaries = sourceWindow.summaries.filter(
      (summary) => command.includeNoSignal || summary.signal !== 'no_signal',
    );
    const summaryIds = uniqueSorted(includedSummaries.map((summary) => summary.summaryId));
    const feedItemIds = uniqueSorted(sourceWindow.feedItems.map((feedItem) => feedItem.feedItemId));
    const provenance = [
      ...includedSummaries.map<DigestProvenanceItem>((summary) => ({
        resourceType: 'summary',
        resourceId: summary.summaryId,
        interestId: summary.interestId,
        includedReason: summary.signal === 'high' ? 'high_signal' : 'within_window',
      })),
      ...sourceWindow.feedItems.map<DigestProvenanceItem>((feedItem) => ({
        resourceType: 'feed_item',
        resourceId: feedItem.feedItemId,
        interestId: feedItem.interestId,
        includedReason: feedItem.signal === 'high' ? 'high_signal' : 'within_window',
      })),
    ].sort(compareProvenance);
    const status = provenance.length === 0 ? 'empty' : 'assembled';
    const contentHash = buildContentHash({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      recipientKey: command.recipientKey,
      channel: command.channel,
      windowId,
      summaryIds,
      feedItemIds,
      provenance,
    });
    const digest = Digest.assemble({
      id: this.ids.generate(),
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      recipientKey: command.recipientKey,
      channel: command.channel,
      window: {
        windowId,
        startedAt: command.windowStartedAt,
        endedAt: command.windowEndedAt,
      },
      status,
      summaryIds,
      feedItemIds,
      provenance,
      contentHash,
      assembledAt: this.clock.now(),
    });

    await this.digests.save(digest);

    if (status === 'empty') {
      return ok({
        digest: presentDigest(digest),
        created: true,
      });
    }

    const queued = await this.queueDeliveryAttempt.execute({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      idempotencyKey: buildDeliveryIdempotencyKey({
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        recipientKey: command.recipientKey,
        channel: command.channel,
        windowId,
        contentHash,
      }),
      channel: command.channel,
      recipientKey: command.recipientKey,
      resourceType: 'digest',
      resourceId: digest.toSnapshot().id,
      maxRetries: command.maxRetries,
    });

    if (!queued.ok) {
      return err(queued.error);
    }

    return ok({
      digest: presentDigest(digest),
      created: true,
      deliveryAttemptId: queued.value.deliveryAttemptId,
    });
  }
}

const validate = (command: AssembleDigestCommand): DomainError | null => {
  if (command.recipientKey.trim().length === 0) {
    return new DomainError('validation.failed', 'Digest recipient key must be non-empty');
  }

  if (command.interestIds.length === 0) {
    return new DomainError('validation.failed', 'Digest must include at least one interest');
  }

  if (command.interestIds.some((interestId) => interestId.trim().length === 0)) {
    return new DomainError('validation.failed', 'Digest interest ids must be non-empty');
  }

  if (command.windowEndedAt.getTime() <= command.windowStartedAt.getTime()) {
    return new DomainError('validation.failed', 'Digest window end must be after start');
  }

  return null;
};

const uniqueSorted = (values: readonly string[]): string[] => [...new Set(values)].sort((left, right) => left.localeCompare(right));

const buildWindowId = (startedAt: Date, endedAt: Date): string =>
  `digest:${startedAt.toISOString()}:${endedAt.toISOString()}`;

const compareProvenance = (left: DigestProvenanceItem, right: DigestProvenanceItem): number => {
  const typeDiff = left.resourceType.localeCompare(right.resourceType);

  if (typeDiff !== 0) {
    return typeDiff;
  }

  return left.resourceId.localeCompare(right.resourceId);
};

const buildContentHash = (payload: Record<string, unknown>): string =>
  createHash('sha256').update(JSON.stringify(payload)).digest('hex');

const buildDeliveryIdempotencyKey = (params: {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly recipientKey: string;
  readonly channel: string;
  readonly windowId: string;
  readonly contentHash: string;
}): string =>
  [
    'digest',
    params.tenantId,
    params.workspaceId,
    params.recipientKey,
    params.channel,
    params.windowId,
    params.contentHash,
  ].join(':');
