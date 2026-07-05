import { ApplyAcceptedTopicRecommendationUseCase } from "@social-monitor/monitoring/features/apply-accepted-topic-recommendation/apply-accepted-topic-recommendation.use-case";

import type {
  ApplyReaderSummaryAcceptedTopicCommand,
  ReaderSummaryAcceptedTopicApplierPort,
  ReaderSummaryAcceptedTopicApplication,
  ReaderSummaryAcceptedTopicReversion,
  RevertReaderSummaryAcceptedTopicCommand,
} from "../../ports";

export class MonitoringReaderSummaryAcceptedTopicApplier
  implements ReaderSummaryAcceptedTopicApplierPort
{
  constructor(
    private readonly applyAcceptedTopicRecommendation: ApplyAcceptedTopicRecommendationUseCase,
  ) {}

  async apply(command: ApplyReaderSummaryAcceptedTopicCommand) {
    const result = await this.applyAcceptedTopicRecommendation.execute(command);

    if (!result.ok) {
      return result;
    }

    return {
      ok: true as const,
      value: {
        status: result.value.status,
        changedSourceBindingCount: result.value.changedSourceBindingCount,
        sourceBindingUpdates: result.value.sourceBindingUpdates.map(
          (update) => ({
            sourceBindingId: update.sourceBindingId,
            interestId: update.interestId,
            providerKey: update.providerKey,
            changed: update.changed,
            changedConfigPaths: update.changedConfigPaths,
            rollbackToken: update.rollbackToken,
          }),
        ),
      } satisfies ReaderSummaryAcceptedTopicApplication,
    };
  }

  async revert(command: RevertReaderSummaryAcceptedTopicCommand) {
    const result = await this.applyAcceptedTopicRecommendation.revert({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      recommendationId: command.recommendationId,
      topicLabel: command.topicLabel,
      sourceBindingUpdates: command.application.sourceBindingUpdates,
      decidedBy: command.decidedBy,
      idempotencyKey: command.idempotencyKey,
      correlationId: command.correlationId,
    });

    if (!result.ok) {
      return result;
    }

    return {
      ok: true as const,
      value: {
        status: result.value.status,
        revertedSourceBindingCount: result.value.revertedSourceBindingCount,
        sourceBindingReversions: result.value.sourceBindingReversions.map(
          (reversion) => ({
            sourceBindingId: reversion.sourceBindingId,
            interestId: reversion.interestId,
            providerKey: reversion.providerKey,
            reverted: reversion.reverted,
            reason: reversion.reason,
            restoredConfigPaths: reversion.restoredConfigPaths,
          }),
        ),
      } satisfies ReaderSummaryAcceptedTopicReversion,
    };
  }
}
