import { StoryClusteringService } from "@social-monitor/summary/domain";
import { openAiReaderSummaryJsonSchema } from "@social-monitor/summary/adapters/model/openai-responses-reader-summary-schema";
import type { ReaderSummaryHistoricalGitHubOmission } from "@social-monitor/summary/features/execute-reader-summary-job/reader-summary-prepublication-gate";
import {
  UNAVAILABLE_READER_SUMMARY_GITHUB_PROJECTION_READER,
  type ReaderSummaryDailyCanonicalRecoveryV4Audit,
  type ReaderSummaryDailyCanonicalRecoveryV4Binding,
  type ReaderSummaryDailyCanonicalRecoveryV4ProvenancePort,
  type ReaderSummaryEvidenceSelectorPort,
  type ReaderSummaryGitHubProjectionReaderPort,
} from "@social-monitor/summary/ports";
import type { Clock } from "@social-monitor/shared-kernel";

import {
  assertDailyOutputCitationsMatchSourceAuthority,
  assertDailyOutputMatchesJsonSchema,
  canonicalJsonBytes,
  parseStrictDailyOutputText,
  sha256,
} from "./reader-summary-daily-canonical-recovery-v4";
import {
  verifyReaderSummaryDailyCanonicalRecoveryReceipt,
} from "./reader-summary-daily-model-job-receipt";
import {
  isReaderSummaryDailySourceAuthorityV2,
  verifyReaderSummaryDailySourceAuthority,
  type ReaderSummaryDailySourceItemV2,
  type VerifiedReaderSummaryDailySourceAuthority,
  type VerifiedReaderSummaryDailySourceAuthorityV2,
} from "./reader-summary-daily-source-authority-snapshot";

export type ReaderSummaryDailyFrozenOutputTextWiring = Readonly<{
  evidenceSelector: ReaderSummaryEvidenceSelectorPort;
  githubProjectionReader: ReaderSummaryGitHubProjectionReaderPort;
  recoveryProvenance: ReaderSummaryDailyCanonicalRecoveryV4ProvenancePort;
  historicalGithubOmission?: ReaderSummaryHistoricalGitHubOmission;
}>;

/**
 * Daily V4 recovery is an opaque, output_text-only lane. It never converts
 * the sealed checked-at anchor into ordinary GitHub evaluator fields.
 */
export const createReaderSummaryDailyFrozenOutputTextWiring = (input: {
  readonly authority: VerifiedReaderSummaryDailySourceAuthority;
  readonly sourceAuthoritySha256: string;
  readonly ingestionCutoff: string;
  readonly modelJobIdentity: string;
  readonly responseBytes: Buffer;
  readonly receiptBytes: Buffer;
  readonly clock: Clock;
}): ReaderSummaryDailyFrozenOutputTextWiring => {
  const authority = requireV2Authority(verifyReaderSummaryDailySourceAuthority({
    tenantId: input.authority.tenantId,
    workspaceId: input.authority.workspaceId,
    requestedUtcDate: input.authority.requestedUtcDate,
    authority: {
      requestedUtcDate: input.authority.requestedUtcDate,
      ingestionCutoff: input.authority.ingestionCutoff,
      canonicalBytes: Buffer.from(input.authority.canonicalBytes),
      canonicalSha256: input.authority.canonicalSha256,
    },
  }));
  if (
    input.sourceAuthoritySha256 !== authority.canonicalSha256 ||
    input.ingestionCutoff !== authority.ingestionCutoff
  ) {
    throw new Error("Daily output_text replay is not bound to immutable authority v2");
  }
  const outputTextBytes = parseStrictDailyOutputText(
    Buffer.from(input.responseBytes).toString("utf8"),
  );
  if (!outputTextBytes.equals(input.responseBytes)) {
    throw new Error("Daily output_text replay bytes are not strict canonical output_text");
  }
  assertOutputTextUsesAuthority(outputTextBytes, authority);
  const preservesNoSignal = assertDailyOutputTextSignalState(outputTextBytes);
  const receipt = verifyReaderSummaryDailyCanonicalRecoveryReceipt({
    modelJobIdentity: input.modelJobIdentity,
    requestedUtcDate: authority.requestedUtcDate,
    sourceAuthoritySha256: authority.canonicalSha256,
    responseBytes: outputTextBytes,
    receiptBytes: input.receiptBytes,
  });
  const recoveryProvenance = frozenRecoveryProvenance({
    authority,
    modelJobIdentity: input.modelJobIdentity,
    outputTextSha256: receipt.responseSha256,
    outputTextByteLength: outputTextBytes.length,
  });
  const historicalGithubOmission = authority.githubProjection.mode ===
    "historical_omission"
    ? Object.freeze({
        reason: authority.githubProjection.reason,
        authorizedAt: new Date(authority.githubProjection.authorizedAt),
      })
    : undefined;
  return Object.freeze({
    evidenceSelector: frozenAuthorityEvidenceSelector(
      authority,
      input.clock,
      preservesNoSignal,
    ),
    // Any path that tries to invoke the ordinary evaluator fails closed. The
    // verified provenance port below is the only recovery GitHub authority.
    githubProjectionReader: UNAVAILABLE_READER_SUMMARY_GITHUB_PROJECTION_READER,
    recoveryProvenance,
    ...(historicalGithubOmission === undefined
      ? {}
      : { historicalGithubOmission }),
  });
};

const frozenRecoveryProvenance = (input: {
  readonly authority: VerifiedReaderSummaryDailySourceAuthorityV2;
  readonly modelJobIdentity: string;
  readonly outputTextSha256: string;
  readonly outputTextByteLength: number;
}): ReaderSummaryDailyCanonicalRecoveryV4ProvenancePort => {
  const { authority } = input;
  const recovery = recoveryBinding(input);
  return Object.freeze({
    recoveryVersion: "reader_summary.daily_canonical_recovery.v4" as const,
    selectedOutputKind: recovery.selectedOutputKind,
    sourceAuthoritySchemaVersion: recovery.sourceAuthoritySchemaVersion,
    tenantId: authority.tenantId,
    workspaceId: authority.workspaceId,
    requestedUtcDate: authority.requestedUtcDate,
    ingestionCutoff: authority.ingestionCutoff,
    sourceAuthoritySha256: authority.canonicalSha256,
    modelJobIdentity: input.modelJobIdentity,
    outputTextSha256: input.outputTextSha256,
    outputTextByteLength: input.outputTextByteLength,
    githubProjectionSha256: recovery.githubProjectionSha256,
    verifyPrepublication: (params) => {
      assertRecoveryPrepublication({ authority, params });
      const audit = recoveryAudit({ authority, recovery });
      return Object.freeze({ audit, findings: [] });
    },
  });
};

const recoveryBinding = (input: {
  readonly authority: VerifiedReaderSummaryDailySourceAuthorityV2;
  readonly modelJobIdentity: string;
  readonly outputTextSha256: string;
  readonly outputTextByteLength: number;
}): ReaderSummaryDailyCanonicalRecoveryV4Binding => Object.freeze({
  schemaVersion: "reader_summary.daily_canonical_recovery_provenance.v2",
  recoveryVersion: "reader_summary.daily_canonical_recovery.v4",
  selectedOutputKind: "output_text",
  sourceAuthoritySchemaVersion: 2,
  tenantId: input.authority.tenantId,
  workspaceId: input.authority.workspaceId,
  requestedUtcDate: input.authority.requestedUtcDate,
  ingestionCutoff: input.authority.ingestionCutoff,
  sourceAuthoritySha256: input.authority.canonicalSha256,
  modelJobIdentity: input.modelJobIdentity,
  outputTextSha256: input.outputTextSha256,
  outputTextByteLength: input.outputTextByteLength,
  githubProjectionSha256: sha256(canonicalJsonBytes(input.authority.githubProjection)),
});

const recoveryAudit = (input: {
  readonly authority: VerifiedReaderSummaryDailySourceAuthorityV2;
  readonly recovery: ReaderSummaryDailyCanonicalRecoveryV4Binding;
}): ReaderSummaryDailyCanonicalRecoveryV4Audit => {
  const projection = input.authority.githubProjection;
  if (projection.mode === "historical_omission") {
    return Object.freeze({
      schemaVersion: "reader_summary.github_projection.v1" as const,
      status: "not_required" as const,
      requestedUtcDay: input.authority.requestedUtcDate,
      pageCount: 0,
      scannedItemCount: 0,
      eligibleBindingIds: Object.freeze([]),
      historicalOmission: Object.freeze({
        mode: "github_projection_unavailable_historical" as const,
        reason: projection.reason,
        authorizedAt: projection.authorizedAt,
      }),
      bindings: Object.freeze([]),
      violationCodes: Object.freeze([]),
      reasons: Object.freeze([]),
      recoveryV4: input.recovery,
    }) as ReaderSummaryDailyCanonicalRecoveryV4Audit;
  }
  return Object.freeze({
    schemaVersion: "reader_summary.github_projection.v1" as const,
    // This is intentionally not an ordinary projection audit: the legacy
    // record has no stars/window/fetchStartedAt facts to represent one.
    status: "verified" as const,
    requestedUtcDay: input.authority.requestedUtcDate,
    pageCount: projection.pageCount,
    scannedItemCount: projection.items.length,
    eligibleBindingIds: Object.freeze([...projection.eligibleBindingIds]),
    observedThrough: input.authority.ingestionCutoff,
    bindings: Object.freeze([]),
    violationCodes: Object.freeze([]),
    reasons: Object.freeze([]),
    recoveryV4: input.recovery,
  }) as ReaderSummaryDailyCanonicalRecoveryV4Audit;
};

const assertRecoveryPrepublication = (input: {
  readonly authority: VerifiedReaderSummaryDailySourceAuthorityV2;
  readonly params: Parameters<
    ReaderSummaryDailyCanonicalRecoveryV4ProvenancePort["verifyPrepublication"]
  >[0];
}): void => {
  const snapshot = input.params.artifact.toSnapshot();
  const expectedStart = `${input.authority.requestedUtcDate}T00:00:00.000Z`;
  const expectedEnd = nextDay(input.authority.requestedUtcDate);
  if (
    snapshot.tenantId !== input.authority.tenantId ||
    snapshot.workspaceId !== input.authority.workspaceId ||
    snapshot.scope.type !== "workspace" ||
    snapshot.period.cadence !== "daily" ||
    snapshot.period.timezone !== "UTC" ||
    snapshot.period.startedAt.toISOString() !== expectedStart ||
    snapshot.period.endedAt.toISOString() !== expectedEnd ||
    input.params.observedThrough.toISOString() !== input.authority.ingestionCutoff
  ) {
    throw new Error("Daily canonical recovery prepublication binding diverged");
  }
  const allowed = input.authority.githubProjection.mode === "historical_omission"
    ? input.authority.items.filter((item) => item.providerKey !== "github-trending-page")
    : input.authority.items;
  const preservesNoSignal = snapshot.qualityFlags.includes("no_signal");
  const windowAuthority = allowed.slice(0, dailyCanonicalRecoveryEvidenceLimit);
  const selectedAuthority = preservesNoSignal ? [] : windowAuthority;
  if (
    input.params.evidence.selectedEvidence.length !== selectedAuthority.length ||
    input.params.evidence.selectedEvidence.some((item, index) => {
      const sealed = selectedAuthority[index];
      return sealed === undefined ||
        item.feedItemId !== sealed.feedItemId ||
        item.sourceItemId !== sealed.sourceItemId ||
        item.sourceBindingId !== sealed.sourceBindingId ||
        item.interestId !== sealed.interestId ||
        item.providerKey !== sealed.providerKey ||
        item.canonicalUrl !== sealed.canonicalUrl ||
        item.title !== sealed.title ||
        item.bodyPreview !== sealed.bodyPreview ||
        (item.authorHandle ?? null) !== sealed.authorHandle ||
        item.publishedAt.toISOString() !== sealed.publishedAt ||
        item.observedAt.toISOString() !== sealed.observedAt ||
        !sameOrderedValues(
          item.whyImportant,
          [`immutable-content-sha256:${sealed.contentHash}`],
        ) ||
        !sameOrderedValues(
          item.matchedRules ?? [],
          [`daily-canonical-authority:${input.authority.canonicalSha256}`],
        );
    })
  ) {
    throw new Error("Daily canonical recovery selected evidence diverged from authority bytes");
  }
  const expectedWindow = sourceWindowBounds(windowAuthority);
  if (
    !sameOrderedValues(
      input.params.evidence.sourceWindow.selectedFeedItemIds,
      selectedAuthority.map((item) => item.feedItemId),
    ) ||
    input.params.evidence.sourceWindow.startedAt.toISOString() !==
      expectedWindow.startedAt.toISOString() ||
    input.params.evidence.sourceWindow.endedAt.toISOString() !==
      expectedWindow.endedAt.toISOString()
  ) {
    throw new Error("Daily canonical recovery evidence window diverged from authority bytes");
  }
  const byFeedItemId = new Map(allowed.map((item) => [item.feedItemId, item]));
  for (const citation of snapshot.citationMap) {
    const sealed = byFeedItemId.get(citation.feedItemId);
    if (
      sealed === undefined ||
      citation.sourceItemId !== sealed.sourceItemId ||
      citation.providerKey !== sealed.providerKey ||
      citation.canonicalUrl !== sealed.canonicalUrl
    ) {
      throw new Error("Daily canonical recovery artifact citation diverged from authority bytes");
    }
  }
};

const requireV2Authority = (
  authority: VerifiedReaderSummaryDailySourceAuthority,
): VerifiedReaderSummaryDailySourceAuthorityV2 => {
  if (!isReaderSummaryDailySourceAuthorityV2(authority)) {
    throw new Error("Daily output_text recovery requires immutable authority v2");
  }
  return authority;
};

const frozenAuthorityEvidenceSelector = (
  authority: VerifiedReaderSummaryDailySourceAuthorityV2,
  clock: Clock,
  preservesNoSignal: boolean,
): ReaderSummaryEvidenceSelectorPort => ({
  select: async (query) => {
    assertAuthorityQuery(authority, query);
    const eligibleItems = authority.githubProjection.mode === "historical_omission"
      ? authority.items.filter((item) => item.providerKey !== "github-trending-page")
      : authority.items;
    const selectedAuthority = eligibleItems.slice(0, query.maxItems);
    const selected = (preservesNoSignal ? [] : selectedAuthority).map((item, index) => ({
      feedItemId: item.feedItemId,
      sourceItemId: item.sourceItemId,
      sourceBindingId: item.sourceBindingId,
      interestId: item.interestId,
      providerKey: item.providerKey,
      canonicalUrl: item.canonicalUrl,
      title: item.title,
      bodyPreview: item.bodyPreview,
      ...(item.authorHandle === null ? {} : { authorHandle: item.authorHandle }),
      publishedAt: new Date(item.publishedAt),
      observedAt: new Date(item.observedAt),
      score: 1 - index / Math.max(1, eligibleItems.length + 1),
      whyImportant: [`immutable-content-sha256:${item.contentHash}`],
      matchedRules: [`daily-canonical-authority:${authority.canonicalSha256}`],
    }));
    const clustered = new StoryClusteringService(clock).cluster({
      identity: {
        tenantId: query.tenantId,
        workspaceId: query.workspaceId,
        scope: query.scope,
      },
      items: selected,
      limit: selected.length,
    });
    return {
      ...clustered,
      ...(preservesNoSignal ? { clusters: [] } : {}),
      sourceWindow: {
        ...clustered.sourceWindow,
        ...sourceWindowBounds(selectedAuthority),
        selectedFeedItemIds: selected.map((item) => item.feedItemId),
        ...(preservesNoSignal ? { storyClusterIds: [] } : {}),
      },
      selectedEvidence: selected,
    };
  },
});

const assertAuthorityQuery = (
  authority: VerifiedReaderSummaryDailySourceAuthorityV2,
  query: Parameters<ReaderSummaryEvidenceSelectorPort["select"]>[0],
): void => {
  const expectedStart = `${authority.requestedUtcDate}T00:00:00.000Z`;
  const expectedEnd = nextDay(authority.requestedUtcDate);
  if (
    query.tenantId !== authority.tenantId ||
    query.workspaceId !== authority.workspaceId ||
    query.scope.type !== "workspace" ||
    query.userId !== undefined ||
    query.subscriptionId !== undefined ||
    query.period.startedAt.toISOString() !== expectedStart ||
    query.period.endedAt.toISOString() !== expectedEnd ||
    query.maxItems !== dailyCanonicalRecoveryEvidenceLimit ||
    query.observedThrough === undefined ||
    !Number.isFinite(query.observedThrough.getTime()) ||
    query.observedThrough.toISOString() !== authority.ingestionCutoff
  ) {
    throw new Error("Daily source authority does not match publication query");
  }
};

const nextDay = (requestedUtcDate: string): string =>
  new Date(Date.parse(`${requestedUtcDate}T00:00:00.000Z`) + 86_400_000)
    .toISOString();

const assertOutputTextUsesAuthority = (
  bytes: Buffer,
  authority: VerifiedReaderSummaryDailySourceAuthorityV2,
): void => {
  const output = JSON.parse(bytes.toString("utf8")) as unknown;
  assertDailyOutputMatchesJsonSchema(output, openAiReaderSummaryJsonSchema);
  assertDailyOutputCitationsMatchSourceAuthority(output, authority.canonicalBytes, 200);
};

const assertDailyOutputTextSignalState = (bytes: Buffer): boolean => {
  const output = JSON.parse(bytes.toString("utf8")) as unknown;
  if (output === null || typeof output !== "object" || Array.isArray(output)) {
    throw new Error("Daily output_text recovery payload must be an object");
  }
  const value = output as Readonly<Record<string, unknown>>;
  if (!Array.isArray(value.qualityFlags) || !Array.isArray(value.topStories)) {
    throw new Error("Daily output_text recovery signal state is invalid");
  }
  const hasNoSignal = value.qualityFlags.includes("no_signal");
  if (hasNoSignal !== (value.topStories.length === 0)) {
    throw new Error("Daily output_text recovery signal state is inconsistent");
  }
  return hasNoSignal;
};

const sourceWindowBounds = (
  items: readonly Pick<ReaderSummaryDailySourceItemV2, "publishedAt">[],
): Readonly<{ startedAt: Date; endedAt: Date }> => {
  const publishedAt = items.map((item) => Date.parse(item.publishedAt));
  const startedAt = Math.min(...publishedAt);
  const endedAt = Math.max(...publishedAt);
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) {
    throw new Error("Daily canonical recovery authority has no selected source window");
  }
  return Object.freeze({
    startedAt: new Date(startedAt),
    endedAt: new Date(endedAt > startedAt ? endedAt : endedAt + 1),
  });
};

const sameOrderedValues = (
  left: readonly string[],
  right: readonly string[],
): boolean => left.length === right.length &&
  left.every((value, index) => value === right[index]);

const dailyCanonicalRecoveryEvidenceLimit = 200;
