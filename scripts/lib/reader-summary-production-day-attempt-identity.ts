import { createHash } from "node:crypto";

export type ReaderSummaryProductionDayAttemptIdentityInput = Readonly<{
  tenantId: string;
  workspaceId: string;
  periodKey: string;
  mode:
    | Readonly<{ kind: "live-production" }>
    | Readonly<{
        kind: "historical-regeneration";
        datasetManifestSha256: string;
        timestampPolicy: "published_at" | "observed_at";
        historicalGitHubOmissionReason?: string;
      }>;
}>;

export const readerSummaryProductionDayAttemptIdentity = (
  input: ReaderSummaryProductionDayAttemptIdentityInput,
): string =>
  sha256(JSON.stringify({
    schemaVersion: "reader_summary.production_day_attempt.v1",
    tenantId: requiredText(input.tenantId, "tenant"),
    workspaceId: requiredText(input.workspaceId, "workspace"),
    periodKey: requiredText(input.periodKey, "period"),
    mode:
      input.mode.kind === "live-production"
        ? { kind: input.mode.kind }
        : {
            kind: input.mode.kind,
            datasetManifestSha256: requiredSha256(
              input.mode.datasetManifestSha256,
            ),
            timestampPolicy: input.mode.timestampPolicy,
            ...(input.mode.historicalGitHubOmissionReason === undefined
              ? {}
              : {
                  historicalGitHubOmissionReason: requiredText(
                    input.mode.historicalGitHubOmissionReason,
                    "historical GitHub omission reason",
                  ),
                }),
          },
  }));

export const readerSummaryProductionDayIdempotencyKey = (
  attemptIdentity: string,
): string =>
  `durable-reader-summary-daily:${requiredSha256(attemptIdentity)}`;

const requiredText = (value: string, label: string): string => {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error(`Reader summary production-day ${label} is required`);
  }
  return normalized;
};

const requiredSha256 = (value: string): string => {
  if (!/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error("Reader summary production-day SHA-256 is invalid");
  }
  return value;
};

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");
