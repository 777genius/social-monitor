import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

import type { ReaderSummaryPeriod } from "../value-objects/reader-summary-period";
import { assertReaderSummaryPeriod } from "../value-objects/reader-summary-period";
import type { ReaderSummaryScope } from "../value-objects/reader-summary-scope";
import {
  assertReaderSummaryScope,
  sameReaderSummaryScope,
} from "../value-objects/reader-summary-scope";

export type ReaderSummaryJobStatus =
  | "requested"
  | "running"
  | "completed"
  | "no_signal"
  | "failed";

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
      props.status === "failed" &&
      ((props.failureReason ?? "").trim().length === 0 ||
        props.failedAt === undefined)
    ) {
      throw new Error(
        "Failed reader summary job must include failure time and reason",
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

    return new ReaderSummaryJob({
      ...this.props,
      status: "running",
      startedAt: params.startedAt,
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

  retry(params: { readonly requestedAt: Date }): ReaderSummaryJob {
    if (this.props.status !== "failed") {
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
