import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

import type { ReaderSummaryTopicRecommendationDecisionStatus } from "./reader-summary-topic-recommendation";

export type ReaderSummaryTopicRecommendationDecisionProps = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly recommendationId: string;
  readonly topicLabel: string;
  readonly status: Exclude<
    ReaderSummaryTopicRecommendationDecisionStatus,
    "pending"
  >;
  readonly decidedBy: string;
  readonly note?: string;
  readonly decidedAt: Date;
  readonly application?: ReaderSummaryTopicRecommendationApplicationSnapshot;
};

export type ReaderSummaryTopicRecommendationApplicationSnapshot = {
  readonly status:
    | "not_requested"
    | "applied"
    | "already_applied"
    | "no_supported_bindings";
  readonly changedSourceBindingCount: number;
  readonly sourceBindingUpdates: readonly ReaderSummaryTopicRecommendationApplicationBindingSnapshot[];
};

export type ReaderSummaryTopicRecommendationApplicationBindingSnapshot = {
  readonly sourceBindingId: string;
  readonly interestId: string;
  readonly providerKey: string;
  readonly changed: boolean;
  readonly changedConfigPaths: readonly string[];
  readonly rollbackToken?: Readonly<Record<string, unknown>>;
};

export class ReaderSummaryTopicRecommendationDecision {
  private constructor(
    private readonly props: ReaderSummaryTopicRecommendationDecisionProps,
  ) {}

  static record(
    props: ReaderSummaryTopicRecommendationDecisionProps,
  ): ReaderSummaryTopicRecommendationDecision {
    this.assertValid(props);

    return new ReaderSummaryTopicRecommendationDecision(props);
  }

  toSnapshot(): ReaderSummaryTopicRecommendationDecisionProps {
    return { ...this.props };
  }

  private static assertValid(
    props: ReaderSummaryTopicRecommendationDecisionProps,
  ): void {
    if (props.recommendationId.trim().length === 0) {
      throw new Error("Topic recommendation decision id must be non-empty");
    }

    if (props.topicLabel.trim().length === 0) {
      throw new Error("Topic recommendation decision topic must be non-empty");
    }

    if (props.decidedBy.trim().length === 0) {
      throw new Error("Topic recommendation decision actor must be non-empty");
    }

    if (props.status !== "accepted" && props.status !== "rejected") {
      throw new Error("Topic recommendation decision status is unsupported");
    }

    if (props.application !== undefined) {
      this.assertApplication(props.application);
    }
  }

  private static assertApplication(
    application: ReaderSummaryTopicRecommendationApplicationSnapshot,
  ): void {
    if (application.status.trim().length === 0) {
      throw new Error("Topic recommendation application status is required");
    }

    if (application.changedSourceBindingCount < 0) {
      throw new Error("Topic recommendation application count is invalid");
    }
  }
}
