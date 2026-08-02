import {
  canonicalizeReaderSummaryWeeklyJson,
} from "@social-monitor/summary/domain";

import {
  buildReaderSummaryProductionRecoveryGapPlan,
  readerSummaryProductionRecoveryGapDates,
  readerSummaryProductionRecoveryGapExpectedCounts,
  readerSummaryProductionRecoveryGapProviderKeys,
  type ReaderSummaryProductionRecoveryGapAuthorityBinding,
  type ReaderSummaryProductionRecoveryGapDate,
  type ReaderSummaryProductionRecoveryGapEvidenceRow,
  type ReaderSummaryProductionRecoveryGapProviderKey,
} from "./reader-summary-production-recovery-gap-authority";

export const recoveryGapFixtureScope = {
  tenantId: "00000000-0000-7000-8000-000000000901",
  workspaceId: "00000000-0000-7000-8000-000000000902",
  issuedAt: new Date("2026-08-01T21:30:00.000Z"),
} as const;

export const exactRecoveryGapRows = () => {
  let ordinal = 0;
  return readerSummaryProductionRecoveryGapDates.flatMap((date) =>
    readerSummaryProductionRecoveryGapProviderKeys.flatMap((providerKey) =>
      Array.from(
        { length: readerSummaryProductionRecoveryGapExpectedCounts[date][providerKey] },
        () => recoveryGapEvidenceRow(date, providerKey, ++ordinal),
      ),
    ),
  );
};

export const exactRecoveryGapBinding =
  (): ReaderSummaryProductionRecoveryGapAuthorityBinding => {
    const plan = buildReaderSummaryProductionRecoveryGapPlan({
      scope: recoveryGapFixtureScope,
      rows: exactRecoveryGapRows(),
      producer: "ordered_filter",
    });
    const canonicalSha256 = canonicalizeReaderSummaryWeeklyJson(plan).sha256;
    return {
      ...(plan as unknown as Omit<
        ReaderSummaryProductionRecoveryGapAuthorityBinding,
        "canonicalSha256" | "dryRunCanonicalSha256s" | "lease"
      >),
      canonicalSha256,
      dryRunCanonicalSha256s: [canonicalSha256, canonicalSha256],
      lease: {
        state: "CONSUMED",
        issuedAt: recoveryGapFixtureScope.issuedAt.toISOString(),
        consumedAt: recoveryGapFixtureScope.issuedAt.toISOString(),
      },
    };
  };

export const recoveryGapEvidenceRow = (
  requestedUtcDate: ReaderSummaryProductionRecoveryGapDate,
  providerKey: ReaderSummaryProductionRecoveryGapProviderKey,
  ordinal: number,
): ReaderSummaryProductionRecoveryGapEvidenceRow => {
  const github = providerKey === "github-trending-page";
  return {
    requestedUtcDate,
    providerKey,
    feedItemId: uuid(ordinal),
    sourceItemId: uuid(100_000 + ordinal),
    sourceBindingId: uuid(200_000 + readerSummaryProductionRecoveryGapProviderKeys.indexOf(providerKey)),
    interestId: uuid(300_000),
    providerItemId: `${providerKey}:${ordinal}`,
    canonicalUrl: github
      ? `https://github.com/example/repository-${ordinal}`
      : `https://example.test/${providerKey}/${ordinal}`,
    title: `${providerKey} evidence ${ordinal}`,
    bodyPreview: `Immutable evidence ${ordinal}`,
    sourceText: `Immutable evidence ${ordinal}`,
    authorHandle: null,
    sourceContentHash: ordinal.toString(16).padStart(64, "0"),
    sourceProviderContentHash: github
      ? (ordinal + 1).toString(16).padStart(64, "0")
      : null,
    publishedAt: new Date(`${requestedUtcDate}T01:00:00.000Z`),
    observedAt: new Date(`${requestedUtcDate}T01:01:00.000Z`),
    createdAt: new Date(`${requestedUtcDate}T01:02:00.000Z`),
    sourceObservedAt: new Date(`${requestedUtcDate}T01:01:30.000Z`),
    sourceCreatedAt: new Date(`${requestedUtcDate}T01:01:45.000Z`),
    githubResultId: github ? uuid(400_000 + ordinal) : null,
    githubScanJobId: github ? uuid(500_000 + Number(requestedUtcDate.slice(-2))) : null,
    githubAttemptNumber: github ? 1 : null,
    githubRepositoryIdentity: github ? `example/repository-${ordinal}` : null,
    githubRank: github ? ordinal : null,
    githubCheckedAt: github
      ? new Date(`${requestedUtcDate}T00:30:00.000Z`)
      : null,
  };
};

const uuid = (ordinal: number): string =>
  `00000000-0000-7000-8000-${ordinal.toString().padStart(12, "0")}`;
