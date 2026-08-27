import type { ReaderSummaryArtifact } from "../entities/reader-summary-artifact";
import {
  buildReaderSummaryGitHubProjectionCollectionTelemetry,
  exactUtcDay,
  isGitHubReaderItem,
  nonEmpty,
  readerSummaryHasNoPrimaryGitHubEvidence,
  readerSummaryIsOrdinaryNoSignalWithoutEvidence,
  readerSummaryRequiresGitHubProjection,
  validEligibleBindingIds,
  type ReaderSummaryGitHubProjectionAudit,
  type ReaderSummaryGitHubProjectionBinding,
  type ReaderSummaryGitHubProjectionCollectionTelemetry,
  type ReaderSummaryGitHubProjectionEvaluation,
  type ReaderSummaryGitHubProjectionItem,
  type ReaderSummaryGitHubProjectionViolationCode,
} from "./reader-summary-github-projection-audit";
import {
  collectCanonicalProjectionCandidates,
  githubProjectionItemTouchesDay,
} from "./reader-summary-github-projection-candidates";
import {
  latestProjectionGroupKey,
  projectionBinding,
  projectionGroupEnvelopeIsCoherent,
  projectionGroupKey,
  projectionSetFindings,
  resolveSelectedCandidate,
  selectedPostsFollowProjection,
  supplementalNarrativeFindings,
} from "./reader-summary-github-projection-set";
import { maxGitHubTrendingDisplayRepositories } from "./reader-summary-github-trending-policy";
import { ordinaryNoSignalGitHubProjectionEvaluation } from "./reader-summary-github-projection-no-signal";

export { githubProjectionItemTouchesDay } from "./reader-summary-github-projection-candidates";

export {
  buildReaderSummaryGitHubProjectionCollectionTelemetry,
  exactUtcDay,
  readerSummaryHasNoPrimaryGitHubEvidence,
  readerSummaryIsOrdinaryNoSignalWithoutEvidence,
  readerSummaryHasNoGitHubEvidence,
  readerSummaryHasVerifiedGitHubProjection,
  readerSummaryGitHubProjectionCollectionGraceMs,
  readerSummaryGitHubProjectionCollectionWarningThresholdMs,
  readerSummaryRequiresGitHubProjection,
} from "./reader-summary-github-projection-audit";
export type {
  ReaderSummaryGitHubProjectionAudit,
  ReaderSummaryGitHubProjectionBinding,
  ReaderSummaryGitHubProjectionCollectionTelemetry,
  ReaderSummaryGitHubProjectionEvaluation,
  ReaderSummaryGitHubProjectionItem,
  ReaderSummaryGitHubProjectionViolationCode,
} from "./reader-summary-github-projection-audit";

export const unavailableReaderSummaryGitHubProjectionAudit = (params: {
  readonly artifact: ReaderSummaryArtifact;
  readonly reason: string;
}): ReaderSummaryGitHubProjectionEvaluation =>
  rejectedEvaluation({
    artifact: params.artifact,
    eligibleBindingIds: [],
    pageCount: 0,
    scannedItemCount: 0,
    findings: [
      {
        code: "github_projection_unavailable",
        reason: params.reason,
      },
    ],
  });

export const notApplicableReaderSummaryGitHubProjectionAudit = (params: {
  readonly artifact: ReaderSummaryArtifact;
}): ReaderSummaryGitHubProjectionEvaluation => {
  if (readerSummaryRequiresGitHubProjection(params.artifact)) {
    return rejectedEvaluation({
      artifact: params.artifact,
      eligibleBindingIds: [],
      pageCount: 0,
      scannedItemCount: 0,
      findings: [
        {
          code: "github_projection_day_invalid",
          reason:
            "GitHub Top 10 selectedPosts requires one exact UTC calendar day.",
        },
      ],
    });
  }
  const snapshot = params.artifact.toSnapshot();
  return {
    audit: baseAudit({
      status: "not_applicable",
      requestedUtcDay: snapshot.period.periodKey,
      pageCount: 0,
      scannedItemCount: 0,
      eligibleBindingIds: [],
    }),
    findings: [],
  };
};

export const evaluateReaderSummaryGitHubProjection = (params: {
  readonly artifact: ReaderSummaryArtifact;
  readonly eligibleBindingIds: readonly string[];
  readonly items: readonly ReaderSummaryGitHubProjectionItem[];
  readonly pageCount: number;
  readonly observedThrough: Date;
}): ReaderSummaryGitHubProjectionEvaluation => {
  const snapshot = params.artifact.toSnapshot();
  const artifactRequiresGitHubBoard =
    readerSummaryRequiresGitHubProjection(params.artifact);
  const ordinaryNoSignal =
    readerSummaryIsOrdinaryNoSignalWithoutEvidence(params.artifact);
  const day = exactUtcDay(
    snapshot.period.startedAt,
    snapshot.period.endedAt,
    snapshot.period.timezone,
  );
  const eligibleBindingIds = unique(
    params.eligibleBindingIds.filter((bindingId) => nonEmpty(bindingId)),
  ).sort();
  if (day === undefined) {
    return rejectedEvaluation({
      artifact: params.artifact,
      eligibleBindingIds: params.eligibleBindingIds,
      pageCount: params.pageCount,
      scannedItemCount: params.items.length,
      findings: [
        {
          code: "github_projection_day_invalid",
          reason:
            "GitHub Top 10 publication requires one exact UTC calendar day.",
        },
      ],
    });
  }
  if (ordinaryNoSignal) {
    return ordinaryNoSignalGitHubProjectionEvaluation({
      requestedUtcDay: day.day,
      pageCount: params.pageCount,
    });
  }

  const findings: {
    code: ReaderSummaryGitHubProjectionViolationCode;
    reason: string;
  }[] = [];
  if (!Number.isSafeInteger(params.pageCount) || params.pageCount < 1) {
    findings.push({
      code: "github_projection_unavailable",
      reason:
        "Durable GitHub binding eligibility was not completely read before publication.",
    });
  }
  if (!validEligibleBindingIds(params.eligibleBindingIds)) {
    findings.push({
      code: "github_projection_identity_invalid",
      reason:
        "Durable GitHub binding eligibility contains an invalid, duplicate, or non-deterministic identity set.",
    });
  }
  if (eligibleBindingIds.length === 0) {
    if (artifactRequiresGitHubBoard && !ordinaryNoSignal) {
      findings.push({
        code: "github_projection_missing",
        reason:
          "GitHub selectedPosts or citations have no eligible active durable binding for the requested UTC day.",
      });
    }
    if (params.items.length > 0) {
      findings.push({
        code: "github_projection_mixed",
        reason:
          "Durable GitHub projection items were returned without an eligible active binding.",
      });
    }
    const uniqueFindings = uniqueFindingsByCodeAndReason(findings);
    if (uniqueFindings.length > 0) {
      return rejectedEvaluation({
        artifact: params.artifact,
        eligibleBindingIds: params.eligibleBindingIds,
        pageCount: params.pageCount,
        scannedItemCount: params.items.length,
        findings: uniqueFindings,
      });
    }
    return {
      audit: baseAudit({
        status: "not_required",
        requestedUtcDay: day.day,
        pageCount: params.pageCount,
        scannedItemCount: 0,
        eligibleBindingIds: [],
      }),
      findings: [],
    };
  }
  if (eligibleBindingIds.length > 1) {
    findings.push({
      code: "github_projection_ambiguous",
      reason:
        "More than one eligible active GitHub Trending binding exists; publication requires one unambiguous canonical binding.",
    });
  }
  const requestedDayItems = params.items.filter((item) =>
    githubProjectionItemTouchesDay(item, day.startedAt, day.endedAt),
  );
  const eligibleBindingIdSet = new Set(eligibleBindingIds);
  const canonicalGroupKeyByBindingId = new Map<string, string>();
  for (const bindingId of eligibleBindingIds) {
    const canonicalGroupKey = latestProjectionGroupKey(
      requestedDayItems,
      bindingId,
    );
    if (canonicalGroupKey === undefined) {
      findings.push({
        code: "github_projection_missing",
        reason: `Eligible GitHub Trending binding "${bindingId}" has no durable projection for the requested UTC day.`,
      });
      continue;
    }
    canonicalGroupKeyByBindingId.set(bindingId, canonicalGroupKey);
  }
  const candidateCollection = collectCanonicalProjectionCandidates({
    items: requestedDayItems,
    eligibleBindingIds: eligibleBindingIdSet,
    canonicalGroupKeyByBindingId,
    dayStartedAt: day.startedAt,
    dayEndedAt: day.endedAt,
    observedThrough: params.observedThrough,
  });
  const candidates = candidateCollection.candidates;
  findings.push(...candidateCollection.findings);
  for (const bindingId of eligibleBindingIds) {
    const canonicalGroupKey = canonicalGroupKeyByBindingId.get(bindingId);
    if (canonicalGroupKey === undefined) {
      continue;
    }
    const canonicalItems = requestedDayItems.filter(
      (item) =>
        item.sourceBindingId === bindingId &&
        projectionGroupKey(item) === canonicalGroupKey,
    );
    if (!projectionGroupEnvelopeIsCoherent(canonicalItems)) {
      findings.push({
        code: "github_projection_mixed",
        reason:
          "Latest durable GitHub projection must preserve one coherent scan identity and source/observation timestamp envelope.",
      });
    }
    findings.push(
      ...projectionSetFindings(
        candidates.filter(
          (candidate) => candidate.groupKey === canonicalGroupKey,
        ),
      ),
    );
  }

  const selectedPosts = (snapshot.content?.selectedPosts ?? []).filter(
    isGitHubReaderItem,
  );
  if (selectedPosts.length !== maxGitHubTrendingDisplayRepositories) {
    findings.push({
      code: "github_projection_missing",
      reason: `selectedPosts must contain exactly ${maxGitHubTrendingDisplayRepositories} GitHub Trending repositories and no supplemental GitHub entries.`,
    });
  }

  const citationById = new Map(
    snapshot.citationMap.map(
      (citation) => [citation.citationId, citation] as const,
    ),
  );
  if (!readerSummaryHasNoPrimaryGitHubEvidence(params.artifact)) {
    findings.push({
      code: "github_projection_mixed",
      reason:
        "GitHub Trending evidence is supplemental and cannot support primary headlines, bullets, topics, claims, source mix, or top reads.",
    });
  }
  const selectedReferencesOlderGroup = selectedPosts.some((post) =>
    post.citationIds.some((citationId) => {
      const citation = citationById.get(citationId);
      if (citation === undefined) {
        return false;
      }
      return requestedDayItems.some((item) => {
        const canonicalGroupKey = canonicalGroupKeyByBindingId.get(
          item.sourceBindingId,
        );
        return (
          eligibleBindingIdSet.has(item.sourceBindingId) &&
          item.feedItemId === citation.feedItemId &&
          item.sourceItemId === citation.sourceItemId &&
          canonicalGroupKey !== undefined &&
          projectionGroupKey(item) !== canonicalGroupKey
        );
      });
    }),
  );
  if (selectedReferencesOlderGroup) {
    findings.push({
      code: "github_projection_stale",
      reason:
        "GitHub selectedPosts is bound to an older durable projection snapshot.",
    });
  }
  const selectedCandidates = selectedPosts.flatMap((post, index) => {
    const resolved = resolveSelectedCandidate({
      post,
      selectedPostIndex: index,
      citationById,
      candidates,
    });
    if (resolved === undefined) {
      findings.push({
        code: "github_projection_identity_invalid",
        reason: `GitHub selectedPosts entry ${index + 1} does not bind one durable feed/source identity.`,
      });
      return [];
    }
    return [resolved];
  });

  const selectedGroupKeys = new Set(
    selectedCandidates.map((candidate) => candidate.groupKey),
  );
  if (selectedGroupKeys.size > 1) {
    findings.push({
      code: "github_projection_mixed",
      reason:
        "GitHub selectedPosts mixes source bindings or projection snapshots.",
    });
  }
  const selectedGroupKey =
    selectedGroupKeys.size === 1 ? [...selectedGroupKeys][0] : undefined;
  const selectedBindingId =
    eligibleBindingIds.length === 1 ? eligibleBindingIds[0] : undefined;
  const latestGroupKey =
    selectedBindingId === undefined
      ? undefined
      : canonicalGroupKeyByBindingId.get(selectedBindingId);
  if (
    selectedGroupKey !== undefined &&
    latestGroupKey !== undefined &&
    selectedGroupKey !== latestGroupKey
  ) {
    findings.push({
      code: "github_projection_stale",
      reason:
        "GitHub selectedPosts is bound to an older durable projection snapshot.",
    });
  }

  const groupCandidates =
    selectedGroupKey === undefined
      ? []
      : candidates.filter(
          (candidate) => candidate.groupKey === selectedGroupKey,
        );
  const topTenCandidates = groupCandidates.filter(
    (candidate) =>
      candidate.item.rank !== undefined &&
      candidate.item.rank <= maxGitHubTrendingDisplayRepositories,
  );
  findings.push(...projectionSetFindings(topTenCandidates));
  if (!selectedPostsFollowProjection(selectedCandidates, topTenCandidates)) {
    findings.push({
      code: "github_projection_mixed",
      reason:
        "GitHub selectedPosts must preserve the durable canonical order #1 through #10.",
    });
  }
  findings.push(
    ...supplementalNarrativeFindings({
      artifact: params.artifact,
      citationById,
      candidates,
      selectedGroupKey,
    }),
  );

  const uniqueFindings = uniqueFindingsByCodeAndReason(findings);
  if (uniqueFindings.length > 0) {
    return rejectedEvaluation({
      artifact: params.artifact,
      eligibleBindingIds: params.eligibleBindingIds,
      pageCount: params.pageCount,
      scannedItemCount: params.items.length,
      findings: uniqueFindings,
    });
  }

  const bindings = selectedCandidates.map(projectionBinding);
  return {
    audit: baseAudit({
      status: "verified",
      requestedUtcDay: day.day,
      pageCount: params.pageCount,
      scannedItemCount: params.items.length,
      eligibleBindingIds,
      observedThrough: params.observedThrough.toISOString(),
      projectionCheckedAt:
        topTenCandidates[0]?.item.checkedAt?.toISOString(),
      telemetry: buildReaderSummaryGitHubProjectionCollectionTelemetry({
        dayEndedAt: day.endedAt,
        observedAt: topTenCandidates.map(
          (candidate) => candidate.item.observedAt,
        ),
      }),
      bindings,
    }),
    findings: [],
  };
};

const rejectedEvaluation = (params: {
  readonly artifact: ReaderSummaryArtifact;
  readonly eligibleBindingIds: readonly string[];
  readonly pageCount: number;
  readonly scannedItemCount: number;
  readonly findings: readonly {
    readonly code: ReaderSummaryGitHubProjectionViolationCode;
    readonly reason: string;
  }[];
}): ReaderSummaryGitHubProjectionEvaluation => {
  const snapshot = params.artifact.toSnapshot();
  const day = exactUtcDay(
    snapshot.period.startedAt,
    snapshot.period.endedAt,
    snapshot.period.timezone,
  );
  const findings = uniqueFindingsByCodeAndReason(params.findings);
  return {
    audit: baseAudit({
      status: "rejected",
      requestedUtcDay: day?.day ?? snapshot.period.periodKey,
      pageCount: params.pageCount,
      scannedItemCount: params.scannedItemCount,
      eligibleBindingIds: params.eligibleBindingIds,
      violationCodes: unique(findings.map((finding) => finding.code)),
      reasons: findings.map((finding) => finding.reason),
    }),
    findings,
  };
};

const baseAudit = (params: {
  readonly status: ReaderSummaryGitHubProjectionAudit["status"];
  readonly requestedUtcDay: string;
  readonly pageCount: number;
  readonly scannedItemCount: number;
  readonly eligibleBindingIds: readonly string[];
  readonly observedThrough?: string;
  readonly projectionCheckedAt?: string;
  readonly telemetry?: ReaderSummaryGitHubProjectionCollectionTelemetry;
  readonly bindings?: readonly ReaderSummaryGitHubProjectionBinding[];
  readonly violationCodes?: readonly ReaderSummaryGitHubProjectionViolationCode[];
  readonly reasons?: readonly string[];
}): ReaderSummaryGitHubProjectionAudit => ({
  schemaVersion: "reader_summary.github_projection.v1",
  status: params.status,
  requestedUtcDay: params.requestedUtcDay,
  pageCount: params.pageCount,
  scannedItemCount: params.scannedItemCount,
  eligibleBindingIds: params.eligibleBindingIds,
  ...(params.observedThrough === undefined
    ? {}
    : { observedThrough: params.observedThrough }),
  ...(params.projectionCheckedAt === undefined
    ? {}
    : { projectionCheckedAt: params.projectionCheckedAt }),
  ...(params.telemetry === undefined ? {} : { telemetry: params.telemetry }),
  bindings: params.bindings ?? [],
  violationCodes: params.violationCodes ?? [],
  reasons: params.reasons ?? [],
});

const unique = <TValue>(values: readonly TValue[]): TValue[] => [
  ...new Set(values),
];

const uniqueFindingsByCodeAndReason = <
  TFinding extends { readonly code: string; readonly reason: string },
>(findings: readonly TFinding[]): readonly TFinding[] => {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = `${finding.code}\u0000${finding.reason}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};
