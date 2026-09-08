import { readerSummaryDailyModelJobIdentity } from "@social-monitor/summary/domain/value-objects/reader-summary-daily-model-job";

import { canonicalJsonBytes, sha256 } from "../reader-summary-daily-canonical-recovery-v4";
import { buildReaderSummaryDailyModelJobReceipt } from "../reader-summary-daily-model-job-receipt";
import type { ReaderSummaryDailyReplayInput } from "../reader-summary-daily-publication-finalizer";
import { verifyReaderSummaryDailySourceAuthority } from "../reader-summary-daily-source-authority-snapshot";

/** Real verified v1 authority and builder-validated structured receipt, offline. */
export const verifiedUnsupportedDailyReplay = (): ReaderSummaryDailyReplayInput => {
  const scope = {
    tenantId: "10000000-0000-4000-8000-000000000001",
    workspaceId: "20000000-0000-4000-8000-000000000002",
    requestedUtcDate: "2026-07-31",
  };
  const ingestionCutoff = "2026-08-01T01:00:00.000Z";
  const canonicalBytes = canonicalJsonBytes({
    schemaVersion: 1, ...scope, ingestionCutoff, items: [],
  });
  const authority = verifyReaderSummaryDailySourceAuthority({
    ...scope,
    authority: {
      requestedUtcDate: scope.requestedUtcDate,
      ingestionCutoff,
      canonicalBytes,
      canonicalSha256: sha256(canonicalBytes),
    },
  });
  const modelJob = readerSummaryDailyModelJobIdentity({
    ...scope, sourceAuthoritySha256: authority.canonicalSha256,
  });
  const responseBytes = canonicalJsonBytes({ headline: "Synthetic stored summary" });
  const receipt = buildReaderSummaryDailyModelJobReceipt({
    modelJob,
    responseBytes,
    attestation: {
      schemaVersion: 1,
      requestId: "unsupported-replay-fixture",
      purpose: "social_monitor.reader_summary.generate.v2",
      canonicalRequestSha256: sha256(Buffer.from("synthetic-request")),
      provider: modelJob.provider,
      model: modelJob.model,
      reasoningEffort: modelJob.reasoningEffort,
      runtimeEngine: modelJob.runtimeEngine,
      runtimePackageVersion: "1.2.3",
      launcherSha256: sha256(Buffer.from("synthetic-launcher")),
      selectedOutputKind: "structured_output",
      selectedOutputSha256: sha256(responseBytes),
    },
    modelTelemetry: {
      provider: modelJob.provider,
      model: modelJob.model,
      reasoningEffort: modelJob.reasoningEffort,
      inputTokens: 120,
      outputTokens: 30,
      totalTokens: 150,
      usageSource: "PROVIDER_REPORTED",
      durationMs: 250,
    },
  });
  return {
    responseBytes,
    receiptBytes: receipt.receiptBytes,
    authoritySha256: authority.canonicalSha256,
    ingestionCutoff,
    modelJobIdentity: modelJob.value,
    authority,
    outputKind: "structured_output",
    modelTelemetry: receipt.modelTelemetry,
  };
};
