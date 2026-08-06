import {
  DomainError,
  err,
  ok,
  type Result,
  type TenantId,
  type WorkspaceId,
} from "@social-monitor/shared-kernel";

import type { PersistedReaderSummaryWeeklyArtifact } from "../../ports/reader-summary-artifact-repository.port";
import type {
  ReaderSummaryWeeklyEvidenceLimitation,
  ReaderSummaryWeeklyProjectionReaderPort,
} from "../../ports/reader-summary-weekly-projection-reader.port";

export const readerSummaryWeeklyProjectionSchemaVersion =
  "reader_summary.weekly_projection.v1" as const;

export const readerSummaryWeeklyProjectionBlockingReasons = [
  "certified_daily_evidence_incomplete",
  "active_weekly_certified_artifact_missing",
] as const;

export type ReaderSummaryWeeklyProjectionBlockingReason =
  (typeof readerSummaryWeeklyProjectionBlockingReasons)[number];

export type GetReaderSummaryWeeklyProjectionQuery = Readonly<{
  tenantId: TenantId;
  workspaceId: WorkspaceId;
  weekStartedOn: string;
}>;

export type ReaderSummaryWeeklyProjection = Readonly<{
  schemaVersion: typeof readerSummaryWeeklyProjectionSchemaVersion;
  tenantId: TenantId;
  workspaceId: WorkspaceId;
  weekStartedOn: string;
  weekEndedOn: string;
  status: "unavailable" | "partial" | "complete";
  certifiedDailyEvidenceDates: readonly string[];
  missingDailyEvidenceDates: readonly string[];
  blockingReasons: readonly ReaderSummaryWeeklyProjectionBlockingReason[];
  activeWeeklyCertifiedArtifactPresent: boolean;
  evidenceLimitations: readonly ReaderSummaryWeeklyEvidenceLimitation[];
  artifact: PersistedReaderSummaryWeeklyArtifact | null;
}>;

export type GetReaderSummaryWeeklyProjectionResult = Result<
  ReaderSummaryWeeklyProjection,
  DomainError
>;

const dayMs = 86_400_000;

export class GetReaderSummaryWeeklyProjectionUseCase {
  constructor(
    private readonly projections: ReaderSummaryWeeklyProjectionReaderPort,
  ) {}

  async execute(
    query: GetReaderSummaryWeeklyProjectionQuery,
  ): Promise<GetReaderSummaryWeeklyProjectionResult> {
    const window = weeklyWindow(query.weekStartedOn);
    if (!window.ok) return window;

    const read = await this.projections.read({
      tenantId: query.tenantId,
      workspaceId: query.workspaceId,
      weekStartedOn: window.value.weekStartedOn,
      weekEndedOn: window.value.weekEndedOn,
    });
    const certifiedDatesResult = exactCertifiedDates(
      read.certifiedDailyEvidenceDates,
      window.value.dates,
    );
    if (!certifiedDatesResult.ok) return certifiedDatesResult;
    const certifiedDates = certifiedDatesResult.value;
    if (
      typeof read.activeWeeklyCertifiedArtifactPresent !== "boolean" ||
      read.activeWeeklyCertifiedArtifactPresent !== (read.artifact !== null)
    ) {
      return invalidProjection("artifact presence");
    }
    const evidenceLimitationsResult = exactEvidenceLimitations(
      read.evidenceLimitations,
      certifiedDates,
    );
    if (!evidenceLimitationsResult.ok) return evidenceLimitationsResult;
    const foundDates = new Set(certifiedDates);
    const missingDates = window.value.dates.filter(
      (date) => !foundDates.has(date),
    );
    const blockingReasons: ReaderSummaryWeeklyProjectionBlockingReason[] = [];
    if (certifiedDates.length !== 7) {
      blockingReasons.push("certified_daily_evidence_incomplete");
    }
    if (!read.activeWeeklyCertifiedArtifactPresent) {
      blockingReasons.push("active_weekly_certified_artifact_missing");
    }
    const status = certifiedDates.length === 0 &&
        !read.activeWeeklyCertifiedArtifactPresent
      ? "unavailable"
      : blockingReasons.length === 0
        ? "complete"
        : "partial";

    return ok(Object.freeze({
      schemaVersion: readerSummaryWeeklyProjectionSchemaVersion,
      tenantId: query.tenantId,
      workspaceId: query.workspaceId,
      weekStartedOn: window.value.weekStartedOn,
      weekEndedOn: window.value.weekEndedOn,
      status,
      certifiedDailyEvidenceDates: Object.freeze(certifiedDates),
      missingDailyEvidenceDates: Object.freeze(missingDates),
      blockingReasons: Object.freeze(blockingReasons),
      activeWeeklyCertifiedArtifactPresent:
        read.activeWeeklyCertifiedArtifactPresent,
      evidenceLimitations: evidenceLimitationsResult.value,
      artifact: status === "complete" ? read.artifact : null,
    }));
  }
}

const weeklyWindow = (
  weekStartedOn: string,
): Result<Readonly<{
  weekStartedOn: string;
  weekEndedOn: string;
  dates: readonly string[];
}>, DomainError> => {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(weekStartedOn)) {
    return invalidWeek();
  }
  const startedAt = Date.parse(`${weekStartedOn}T00:00:00.000Z`);
  if (
    !Number.isFinite(startedAt) ||
    new Date(startedAt).toISOString().slice(0, 10) !== weekStartedOn ||
    new Date(startedAt).getUTCDay() !== 1
  ) {
    return invalidWeek();
  }
  const dates = Array.from({ length: 7 }, (_, index) =>
    new Date(startedAt + index * dayMs).toISOString().slice(0, 10),
  );
  return ok(Object.freeze({
    weekStartedOn,
    weekEndedOn: dates[6]!,
    dates: Object.freeze(dates),
  }));
};

const exactCertifiedDates = (
  values: readonly string[],
  expectedDates: readonly string[],
): Result<readonly string[], DomainError> => {
  if (!Array.isArray(values)) {
    return err(new DomainError(
      "external.dependency_unavailable",
      "Reader summary weekly projection evidence is invalid",
    ));
  }
  const expected = new Set(expectedDates);
  const dates = [...values];
  if (
    dates.some((date) => !expected.has(date)) ||
    new Set(dates).size !== dates.length ||
    dates.some((date, index) => index > 0 && dates[index - 1]! >= date)
  ) {
    return err(new DomainError(
      "external.dependency_unavailable",
      "Reader summary weekly projection evidence dates are invalid",
    ));
  }
  return ok(dates);
};

const exactEvidenceLimitations = (
  values: readonly ReaderSummaryWeeklyEvidenceLimitation[],
  certifiedDates: readonly string[],
): Result<readonly ReaderSummaryWeeklyEvidenceLimitation[], DomainError> => {
  if (!Array.isArray(values)) return invalidProjection("evidence limitations");
  const certified = new Set(certifiedDates);
  const limitations: ReaderSummaryWeeklyEvidenceLimitation[] = [];
  let previousKey: string | null = null;
  for (const value of values) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return invalidProjection("evidence limitations");
    }
    const keys = Object.keys(value).sort();
    if (
      keys.join(",") !== "evidenceState,providerKey,requestedUtcDate" ||
      !certified.has(value.requestedUtcDate) ||
      value.providerKey !== "github-trending-page" ||
      value.evidenceState !== "historical_unavailable"
    ) {
      return invalidProjection("evidence limitations");
    }
    const key = `${value.requestedUtcDate}:${value.providerKey}:${value.evidenceState}`;
    if (previousKey !== null && previousKey >= key) {
      return invalidProjection("evidence limitations");
    }
    previousKey = key;
    limitations.push(Object.freeze({ ...value }));
  }
  return ok(Object.freeze(limitations));
};

const invalidProjection = (field: string) =>
  err(new DomainError(
    "external.dependency_unavailable",
    `Reader summary weekly projection ${field} is invalid`,
  ));

const invalidWeek = () =>
  err(new DomainError(
    "validation.failed",
    "ReaderSummary weekStartedOn must be a Monday UTC date in YYYY-MM-DD format",
  ));
