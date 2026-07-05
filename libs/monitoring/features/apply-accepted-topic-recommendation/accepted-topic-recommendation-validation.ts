import {
  DomainError,
  err,
  ok,
  type Result,
} from "@social-monitor/shared-kernel";

import type {
  ApplyAcceptedTopicRecommendationCommand,
  RevertAcceptedTopicRecommendationCommand,
} from "./apply-accepted-topic-recommendation.command";

export const validateApplyAcceptedTopicRecommendationCommand = (
  command: ApplyAcceptedTopicRecommendationCommand,
): Result<true, DomainError> => {
  if (command.recommendationId.trim().length === 0) {
    return err(new DomainError("validation.failed", "Recommendation id must be non-empty"));
  }

  if (command.topicLabel.trim().length === 0) {
    return err(new DomainError("validation.failed", "Topic label must be non-empty"));
  }

  if (uniqueNormalized(command.interestIds).length === 0) {
    return err(
      new DomainError(
        "validation.failed",
        "Accepted topic recommendation requires at least one interest id",
      ),
    );
  }

  if (command.decidedBy.trim().length === 0) {
    return err(
      new DomainError(
        "validation.failed",
        "Recommendation decision actor must be non-empty",
      ),
    );
  }

  if (command.idempotencyKey.trim().length === 0) {
    return err(
      new DomainError(
        "validation.failed",
        "Recommendation application idempotency key must be non-empty",
      ),
    );
  }

  if (command.correlationId.trim().length === 0) {
    return err(
      new DomainError(
        "validation.failed",
        "Recommendation application correlation id must be non-empty",
      ),
    );
  }

  return ok(true);
};

export const validateRevertAcceptedTopicRecommendationCommand = (
  command: RevertAcceptedTopicRecommendationCommand,
): Result<true, DomainError> => {
  if (command.recommendationId.trim().length === 0) {
    return err(new DomainError("validation.failed", "Recommendation id must be non-empty"));
  }

  if (command.topicLabel.trim().length === 0) {
    return err(new DomainError("validation.failed", "Topic label must be non-empty"));
  }

  if (command.decidedBy.trim().length === 0) {
    return err(
      new DomainError(
        "validation.failed",
        "Recommendation undo actor must be non-empty",
      ),
    );
  }

  if (command.idempotencyKey.trim().length === 0) {
    return err(
      new DomainError(
        "validation.failed",
        "Recommendation reversion idempotency key must be non-empty",
      ),
    );
  }

  if (command.correlationId.trim().length === 0) {
    return err(
      new DomainError(
        "validation.failed",
        "Recommendation reversion correlation id must be non-empty",
      ),
    );
  }

  return ok(true);
};

export const uniqueNormalized = (values: readonly string[]): readonly string[] => [
  ...new Set(values.map((value) => value.trim()).filter(Boolean)),
];
