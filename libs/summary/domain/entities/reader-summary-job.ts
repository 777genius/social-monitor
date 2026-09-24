import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

import type { ReaderSummaryPeriod } from "../value-objects/reader-summary-period";
import { assertReaderSummaryPeriod } from "../value-objects/reader-summary-period";
import type { ReaderSummaryScope } from "../value-objects/reader-summary-scope";
import {
  assertReaderSummaryScope,
  sameReaderSummaryScope,
} from "../value-objects/reader-summary-scope";
import type {
  ReaderSummaryPreparationConfig,
  ReaderSummaryPreparationFailureCode,
  ReaderSummaryPreparationManifest,
  ReaderSummarySelectionStrategy,
} from "../value-objects/reader-summary-preparation";
import { assertReaderSummaryPreparationManifest } from
  "../value-objects/reader-summary-preparation";
import { canonicalReaderSummaryPreparationTimestamp,
  compareReaderSummaryPreparationTimestamps } from
  "../value-objects/reader-summary-preparation";

export type ReaderSummaryJobStatus =
  | "requested"
  | "running"
  | "completed"
  | "no_signal"
  | "failed"
  | "quality_rejected";

export type ReaderSummaryJobProps = {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly scope: ReaderSummaryScope;
  readonly period: ReaderSummaryPeriod;
  readonly userId?: string;
  readonly subscriptionId?: string;
  readonly status: ReaderSummaryJobStatus;
  readonly idempotencyKey: string;
  readonly requestedAt: Date;
  readonly startedAt?: Date;
  readonly completedAt?: Date;
  readonly failedAt?: Date;
  readonly readerSummaryId?: string;
  readonly failureReason?: string;
  readonly selectionStrategy?: ReaderSummarySelectionStrategy;
  readonly preparationConfig?: ReaderSummaryPreparationConfig;
  readonly preparationManifest?: ReaderSummaryPreparationManifest;
  readonly preparationManifestSha256?: string;
  readonly preparationCutoffAt?: string;
  readonly preparationDeadlineAt?: string;
  readonly preparationNextCheckAt?: Date;
  readonly preparationReadyAt?: Date;
  readonly terminalFailureCode?: ReaderSummaryPreparationFailureCode;
};

export class ReaderSummaryJob {
  private constructor(private readonly props: ReaderSummaryJobProps) {}

  static request(
    props: Omit<ReaderSummaryJobProps, "status">,
  ): ReaderSummaryJob {
    this.assertValidRequest(props);

    return new ReaderSummaryJob({
      ...props,
      status: "requested",
    });
  }

  static rehydrate(props: ReaderSummaryJobProps): ReaderSummaryJob {
    this.assertValidRequest(props);

    if (props.preparationManifest !== undefined) {
      assertReaderSummaryPreparationManifest(props.preparationManifest);
    }
    if (props.selectionStrategy === "jev_primary_v3" && props.status === "running" &&
        (props.preparationManifest === undefined ||
          props.preparationReadyAt === undefined)) {
      throw new Error("Running V3 reader summary job requires ready frozen preparation");
    }
    if (props.terminalFailureCode !== undefined && props.status !== "failed") {
      throw new Error("Terminal preparation failure requires failed status");
    }

    if (
      (props.status === "completed" || props.status === "no_signal") &&
      props.readerSummaryId === undefined
    ) {
      throw new Error(
        "Completed reader summary job must reference a reader summary artifact",
      );
    }

    if (props.status === "running" && props.startedAt === undefined) {
      throw new Error("Running reader summary job must have start time");
    }

    if (
      (props.status === "completed" || props.status === "no_signal") &&
      props.completedAt === undefined
    ) {
      throw new Error("Completed reader summary job must have completion time");
    }

    if (
      (props.status === "failed" || props.status === "quality_rejected") &&
      ((props.failureReason ?? "").trim().length === 0 ||
        props.failedAt === undefined)
    ) {
      throw new Error(
        "Terminal failed reader summary job must include failure time and reason",
      );
    }

    if (
      props.status === "quality_rejected" &&
      props.readerSummaryId === undefined
    ) {
      throw new Error(
        "Quality rejected reader summary job must reference a rejected artifact",
      );
    }

    return new ReaderSummaryJob({
      ...props,
      failureReason: props.failureReason?.trim(),
    });
  }

  start(params: { readonly startedAt: Date }): ReaderSummaryJob {
    if (this.props.status !== "requested") {
      throw new Error(
        "Reader summary job can only start from requested status",
      );
    }
    if (this.props.selectionStrategy === "jev_primary_v3") {
      throw new Error("V3 reader summary job requires an atomically ready manifest");
    }

    return new ReaderSummaryJob({
      ...this.props,
      status: "running",
      startedAt: params.startedAt,
    });
  }

  freezePreparation(params: {
    readonly strategy: ReaderSummarySelectionStrategy;
    readonly config: ReaderSummaryPreparationConfig;
    readonly cutoffAt: string;
    readonly deadlineAt: string;
    readonly nextCheckAt: Date;
  }): ReaderSummaryJob {
    if (this.props.status !== "requested") {
      throw new Error("Reader summary preparation can only freeze while requested");
    }
    if (this.props.selectionStrategy !== undefined) {
      if (this.props.selectionStrategy !== params.strategy ||
          (this.props.preparationConfig !== undefined &&
            JSON.stringify(this.props.preparationConfig) !== JSON.stringify(params.config))) {
        throw new Error("Reader summary preparation identity is immutable");
      }
      if (this.props.preparationConfig !== undefined) return this;
    }
    const cutoffAt = canonicalReaderSummaryPreparationTimestamp(params.cutoffAt);
    const deadlineAt = canonicalReaderSummaryPreparationTimestamp(params.deadlineAt);
    if (compareReaderSummaryPreparationTimestamps(deadlineAt, cutoffAt) <= 0 ||
        params.nextCheckAt.getTime() > Date.parse(deadlineAt)) {
      throw new Error("Reader summary preparation timing is invalid");
    }
    return new ReaderSummaryJob({
      ...this.props,
      selectionStrategy: params.strategy,
      preparationConfig: params.config,
      preparationCutoffAt: cutoffAt,
      preparationDeadlineAt: deadlineAt,
      preparationNextCheckAt: params.nextCheckAt,
    });
  }

  freezePreparationManifest(params: {
    readonly manifest: ReaderSummaryPreparationManifest;
    readonly manifestSha256: string;
  }): ReaderSummaryJob {
    if (this.props.status !== "requested" || this.props.selectionStrategy === undefined) {
      throw new Error("Reader summary manifest requires frozen requested preparation");
    }
    assertReaderSummaryPreparationManifest(params.manifest);
    if (!/^[0-9a-f]{64}$/u.test(params.manifestSha256)) {
      throw new Error("Reader summary manifest digest is invalid");
    }
    if (this.props.preparationManifest !== undefined) {
      if (this.props.preparationManifestSha256 !== params.manifestSha256) {
        throw new Error("Reader summary preparation manifest is write-once");
      }
      return this;
    }
    return new ReaderSummaryJob({
      ...this.props,
      preparationManifest: params.manifest,
      preparationManifestSha256: params.manifestSha256,
    });
  }

  deferPreparation(nextCheckAt: Date): ReaderSummaryJob {
    if (this.props.status !== "requested" || this.props.preparationDeadlineAt === undefined ||
        nextCheckAt.getTime() > Date.parse(this.props.preparationDeadlineAt)) {
      throw new Error("Reader summary preparation deferral is invalid");
    }
    return new ReaderSummaryJob({ ...this.props, preparationNextCheckAt: nextCheckAt });
  }

  startPrepared(params: { readonly startedAt: Date; readonly readyAt: Date }): ReaderSummaryJob {
    if (this.props.status !== "requested" ||
        this.props.selectionStrategy !== "jev_primary_v3" ||
        this.props.preparationManifest === undefined) {
      throw new Error("Prepared reader summary job requires a frozen manifest");
    }
    return new ReaderSummaryJob({
      ...this.props,
      status: "running",
      startedAt: params.startedAt,
      preparationReadyAt: params.readyAt,
      preparationNextCheckAt: undefined,
    });
  }

  failPreparation(params: {
    readonly failedAt: Date;
    readonly failureReason: string;
    readonly terminalFailureCode: ReaderSummaryPreparationFailureCode;
  }): ReaderSummaryJob {
    if (this.props.status !== "requested") {
      throw new Error("Reader summary preparation can only fail from requested status");
    }
    if (params.failureReason.trim().length === 0) {
      throw new Error("Failed reader summary preparation requires a reason");
    }
    return new ReaderSummaryJob({
      ...this.props,
      status: "failed",
      failedAt: params.failedAt,
      failureReason: params.failureReason.trim(),
      terminalFailureCode: params.terminalFailureCode,
      preparationNextCheckAt: undefined,
    });
  }

  failTerminal(params: {
    readonly failedAt: Date;
    readonly failureReason: string;
    readonly terminalFailureCode: ReaderSummaryPreparationFailureCode;
  }): ReaderSummaryJob {
    if (this.props.status !== "running") {
      throw new Error("Reader summary terminal execution failure requires running status");
    }
    if (params.failureReason.trim().length === 0) {
      throw new Error("Reader summary terminal execution failure requires a reason");
    }
    return new ReaderSummaryJob({ ...this.props, status: "failed",
      failedAt: params.failedAt, failureReason: params.failureReason.trim(),
      terminalFailureCode: params.terminalFailureCode,
      preparationNextCheckAt: undefined });
  }

  cancelByOperator(params: { readonly cancelledAt: Date }): ReaderSummaryJob {
    if (this.props.status !== "requested" && this.props.status !== "running") {
      throw new Error("Only requested or running jobs can be cancelled");
    }
    return new ReaderSummaryJob({
      ...this.props,
      status: "failed",
      failedAt: params.cancelledAt,
      completedAt: undefined,
      readerSummaryId: undefined,
      failureReason: "Reader summary job cancelled by operator",
      terminalFailureCode: "operator_cancelled",
      preparationNextCheckAt: undefined,
    });
  }

  complete(params: {
    readonly completedAt: Date;
    readonly readerSummaryId: string;
  }): ReaderSummaryJob {
    if (this.props.status !== "running") {
      throw new Error(
        "Reader summary job can only complete from running status",
      );
    }

    assertReaderSummaryId(params.readerSummaryId);

    return new ReaderSummaryJob({
      ...this.props,
      status: "completed",
      completedAt: params.completedAt,
      readerSummaryId: params.readerSummaryId,
    });
  }

  markNoSignal(params: {
    readonly completedAt: Date;
    readonly readerSummaryId: string;
  }): ReaderSummaryJob {
    if (this.props.status !== "running") {
      throw new Error(
        "Reader summary job can only become no_signal from running status",
      );
    }

    assertReaderSummaryId(params.readerSummaryId);

    return new ReaderSummaryJob({
      ...this.props,
      status: "no_signal",
      completedAt: params.completedAt,
      readerSummaryId: params.readerSummaryId,
    });
  }

  fail(params: {
    readonly failedAt: Date;
    readonly failureReason: string;
  }): ReaderSummaryJob {
    if (this.props.status !== "running") {
      throw new Error("Reader summary job can only fail from running status");
    }

    if (params.failureReason.trim().length === 0) {
      throw new Error("Failed reader summary job must include failure reason");
    }

    return new ReaderSummaryJob({
      ...this.props,
      status: "failed",
      failedAt: params.failedAt,
      failureReason: params.failureReason.trim(),
    });
  }

  rejectForQuality(params: {
    readonly rejectedAt: Date;
    readonly failureReason: string;
    readonly readerSummaryId: string;
  }): ReaderSummaryJob {
    if (this.props.status !== "running") {
      throw new Error(
        "Reader summary job can only be quality rejected from running status",
      );
    }

    if (params.failureReason.trim().length === 0) {
      throw new Error(
        "Quality rejected reader summary job must include rejection reason",
      );
    }

    assertReaderSummaryId(params.readerSummaryId);

    return new ReaderSummaryJob({
      ...this.props,
      status: "quality_rejected",
      failedAt: params.rejectedAt,
      readerSummaryId: params.readerSummaryId,
      failureReason: params.failureReason.trim(),
    });
  }

  retry(params: { readonly requestedAt: Date }): ReaderSummaryJob {
    if (this.props.status !== "failed" || this.props.terminalFailureCode !== undefined) {
      throw new Error("Reader summary job can only retry from failed status");
    }

    return new ReaderSummaryJob({
      id: this.props.id,
      tenantId: this.props.tenantId,
      workspaceId: this.props.workspaceId,
      scope: this.props.scope,
      period: this.props.period,
      userId: this.props.userId,
      subscriptionId: this.props.subscriptionId,
      status: "requested",
      idempotencyKey: this.props.idempotencyKey,
      requestedAt: params.requestedAt,
      selectionStrategy: this.props.selectionStrategy,
    });
  }

  isSameRequest(params: {
    readonly scope: ReaderSummaryScope;
    readonly periodKey: string;
    readonly userId?: string;
    readonly subscriptionId?: string;
  }): boolean {
    return (
      sameReaderSummaryScope(this.props.scope, params.scope) &&
      this.props.period.periodKey === params.periodKey &&
      this.props.userId === params.userId &&
      this.props.subscriptionId === params.subscriptionId
    );
  }

  toSnapshot(): ReaderSummaryJobProps {
    return { ...this.props };
  }

  private static assertValidRequest(
    props: Omit<ReaderSummaryJobProps, "status"> | ReaderSummaryJobProps,
  ): void {
    if (props.id.trim().length === 0) {
      throw new Error("Reader summary job id must be non-empty");
    }

    assertReaderSummaryScope(props.scope);
    assertReaderSummaryPeriod(props.period);

    if (props.idempotencyKey.trim().length === 0) {
      throw new Error("Reader summary job idempotency key must be non-empty");
    }

    if (
      (props.userId ?? "").trim().length === 0 &&
      props.subscriptionId !== undefined
    ) {
      throw new Error(
        "Subscription-scoped reader summary job must include user id",
      );
    }
  }
}

const assertReaderSummaryId = (readerSummaryId: string): void => {
  if (readerSummaryId.trim().length === 0) {
    throw new Error(
      "Completed reader summary job must reference a reader summary artifact",
    );
  }
};
