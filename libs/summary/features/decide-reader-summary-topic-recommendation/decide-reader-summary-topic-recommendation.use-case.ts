import {
  type Clock,
  DomainError,
  type IdGenerator,
  causationId,
  correlationId,
  eventId,
  err,
  ok,
  type Result,
} from "@social-monitor/shared-kernel";

import { ReaderSummaryTopicRecommendationDecision } from "../../domain";
import type {
  ReaderSummaryAcceptedTopicApplication,
  ReaderSummaryAcceptedTopicReversion,
  ReaderSummaryAcceptedTopicApplierPort,
  ReaderSummaryTopicRecommendationDecisionRepositoryPort,
  SummaryEventPublisherPort,
} from "../../ports";
import type { DecideReaderSummaryTopicRecommendationCommand } from "./decide-reader-summary-topic-recommendation.command";
import type { DecideReaderSummaryTopicRecommendationResult } from "./decide-reader-summary-topic-recommendation.result";

export class DecideReaderSummaryTopicRecommendationUseCase {
  constructor(
    private readonly decisions: ReaderSummaryTopicRecommendationDecisionRepositoryPort,
    private readonly clock: Clock,
    private readonly acceptedTopicApplier: ReaderSummaryAcceptedTopicApplierPort,
    private readonly events: SummaryEventPublisherPort,
    private readonly ids: IdGenerator,
  ) {}

  async execute(
    command: DecideReaderSummaryTopicRecommendationCommand,
  ): Promise<
    Result<DecideReaderSummaryTopicRecommendationResult, DomainError>
  > {
    const validation = validateCommand(command);
    if (!validation.ok) {
      return err(validation.error);
    }

    const recommendationId = command.recommendationId.trim();
    const topicLabel = command.topicLabel.trim();
    if (command.action === "undo") {
      return this.undoDecision(command, recommendationId, topicLabel);
    }

    const application =
      command.action === "accept"
        ? await this.applyAcceptedTopic(command, recommendationId, topicLabel)
        : ok(notRequestedApplication());
    if (!application.ok) {
      return err(topicApplicationError(application.error));
    }

    const decision = ReaderSummaryTopicRecommendationDecision.record({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      recommendationId,
      topicLabel,
      status: command.action === "accept" ? "accepted" : "rejected",
      decidedBy: command.decidedBy.trim(),
      note: normalizedOptional(command.note),
      decidedAt: this.clock.now(),
      application: application.value,
    });

    await this.decisions.save(decision);
    await this.publishDecisionEvent({
      command,
      recommendationId,
      topicLabel,
      decision,
      decisionStatus: decision.toSnapshot().status,
      application: application.value,
      reversion: notRequestedReversion(),
    });

    return ok({
      decision,
      decisionStatus: decision.toSnapshot().status,
      application: application.value,
      reversion: notRequestedReversion(),
    });
  }

  private async undoDecision(
    command: DecideReaderSummaryTopicRecommendationCommand,
    recommendationId: string,
    topicLabel: string,
  ): Promise<
    Result<DecideReaderSummaryTopicRecommendationResult, DomainError>
  > {
    const existing = await this.decisions.findByRecommendationId({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      recommendationId,
    });
    if (existing === null) {
      return ok({
        decisionStatus: "pending",
        application: notRequestedApplication(),
        reversion: notRequestedReversion(),
      });
    }

    const snapshot = existing.toSnapshot();
    const reversion =
      snapshot.status === "accepted"
        ? await this.revertAcceptedTopic(command, snapshot.application)
        : ok(notRequestedReversion());
    if (!reversion.ok) {
      return err(topicApplicationError(reversion.error));
    }

    if (reversion.value.status === "blocked") {
      return err(
        new DomainError(
          "operation.conflict",
          "Accepted topic recommendation cannot be undone because collection config changed after it was applied",
          {
            recommendationId,
            topicLabel,
          },
        ),
      );
    }

    await this.decisions.deleteByRecommendationId({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      recommendationId,
    });
    await this.publishDecisionEvent({
      command,
      recommendationId,
      topicLabel,
      decisionStatus: "pending",
      application: notRequestedApplication(),
      reversion: reversion.value,
    });

    return ok({
      decisionStatus: "pending",
      application: notRequestedApplication(),
      reversion: reversion.value,
    });
  }

  private async applyAcceptedTopic(
    command: DecideReaderSummaryTopicRecommendationCommand,
    recommendationId: string,
    topicLabel: string,
  ): Promise<
    Result<ReaderSummaryAcceptedTopicApplication, DomainError | Error>
  > {
    return this.acceptedTopicApplier.apply({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      recommendationId,
      topicLabel,
      interestIds: command.interestIds ?? [],
      providerKeys: command.providerKeys,
      decidedBy: command.decidedBy.trim(),
      idempotencyKey: recommendationDecisionIdempotencyKey(command),
      correlationId: recommendationDecisionCorrelationId(command),
    });
  }

  private async revertAcceptedTopic(
    command: DecideReaderSummaryTopicRecommendationCommand,
    application: ReaderSummaryAcceptedTopicApplication | undefined,
  ): Promise<
    Result<ReaderSummaryAcceptedTopicReversion, DomainError | Error>
  > {
    if (application === undefined) {
      return err(
        new DomainError(
          "validation.failed",
          "Accepted topic recommendation cannot be undone without rollback data",
        ),
      );
    }

    return this.acceptedTopicApplier.revert({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      recommendationId: command.recommendationId.trim(),
      topicLabel: command.topicLabel.trim(),
      application,
      decidedBy: command.decidedBy.trim(),
      idempotencyKey: `${recommendationDecisionIdempotencyKey(command)}:undo`,
      correlationId: recommendationDecisionCorrelationId(command),
    });
  }

  private async publishDecisionEvent(params: {
    readonly command: DecideReaderSummaryTopicRecommendationCommand;
    readonly recommendationId: string;
    readonly topicLabel: string;
    readonly decision?: ReaderSummaryTopicRecommendationDecision;
    readonly decisionStatus: "pending" | "accepted" | "rejected";
    readonly application: ReaderSummaryAcceptedTopicApplication;
    readonly reversion: ReaderSummaryAcceptedTopicReversion;
  }): Promise<void> {
    const snapshot = params.decision?.toSnapshot();
    await this.events.publish({
      eventId: eventId(this.ids.generate()),
      eventType: "summary.reader-summary-topic-recommendation.decided",
      schemaVersion: 1,
      occurredAt: this.clock.now(),
      tenantId: params.command.tenantId,
      workspaceId: params.command.workspaceId,
      correlationId: correlationId(
        recommendationDecisionCorrelationId(params.command),
      ),
      causationId: causationId(
        recommendationDecisionIdempotencyKey(params.command),
      ),
      payload: {
        recommendationId: params.recommendationId,
        topicLabel: params.topicLabel,
        status: params.decisionStatus,
        decidedBy: params.command.decidedBy.trim(),
        note: snapshot?.note,
        applicationStatus: params.application.status,
        changedSourceBindingCount: params.application.changedSourceBindingCount,
        sourceBindingUpdates: params.application.sourceBindingUpdates.map(
          (update) => ({
            sourceBindingId: update.sourceBindingId,
            interestId: update.interestId,
            providerKey: update.providerKey,
            changed: update.changed,
            changedConfigPaths: update.changedConfigPaths,
          }),
        ),
        reversionStatus: params.reversion.status,
        revertedSourceBindingCount:
          params.reversion.revertedSourceBindingCount,
      },
    });
  }
}

const validateCommand = (
  command: DecideReaderSummaryTopicRecommendationCommand,
): Result<true, DomainError> => {
  if (command.recommendationId.trim().length === 0) {
    return err(
      new DomainError(
        "validation.failed",
        "ReaderSummary topic recommendation id must be non-empty",
      ),
    );
  }

  if (command.topicLabel.trim().length === 0) {
    return err(
      new DomainError(
        "validation.failed",
        "ReaderSummary topic recommendation topicLabel must be non-empty",
      ),
    );
  }

  if (
    command.action !== "accept" &&
    command.action !== "reject" &&
    command.action !== "undo"
  ) {
    return err(
      new DomainError(
        "validation.failed",
        "ReaderSummary topic recommendation action must be accept, reject or undo",
      ),
    );
  }

  if (command.decidedBy.trim().length === 0) {
    return err(
      new DomainError(
        "validation.failed",
        "ReaderSummary topic recommendation actor must be non-empty",
      ),
    );
  }

  if (
    command.action === "accept" &&
    uniqueNormalized(command.interestIds ?? []).length === 0
  ) {
    return err(
      new DomainError(
        "validation.failed",
        "Accepted topic recommendation requires at least one interest id",
      ),
    );
  }

  return ok(true);
};

const normalizedOptional = (value: string | undefined): string | undefined => {
  const normalized = value?.trim() ?? "";

  return normalized.length === 0 ? undefined : normalized;
};

const recommendationDecisionIdempotencyKey = (
  command: DecideReaderSummaryTopicRecommendationCommand,
): string =>
  normalizedOptional(command.idempotencyKey) ??
  `reader-summary-topic-recommendation:${command.recommendationId.trim()}:${command.action}`;

const recommendationDecisionCorrelationId = (
  command: DecideReaderSummaryTopicRecommendationCommand,
): string =>
  normalizedOptional(command.correlationId) ??
  recommendationDecisionIdempotencyKey(command);

const notRequestedApplication = (): ReaderSummaryAcceptedTopicApplication => ({
  status: "not_requested",
  changedSourceBindingCount: 0,
  sourceBindingUpdates: [],
});

const notRequestedReversion = (): ReaderSummaryAcceptedTopicReversion => ({
  status: "not_requested",
  revertedSourceBindingCount: 0,
  sourceBindingReversions: [],
});

const topicApplicationError = (error: DomainError | Error): DomainError =>
  error instanceof DomainError
    ? error
    : new DomainError(
        "external.dependency_unavailable",
        "Accepted topic recommendation application failed",
      );

const uniqueNormalized = (values: readonly string[]): readonly string[] => [
  ...new Set(values.map((value) => value.trim()).filter(Boolean)),
];
