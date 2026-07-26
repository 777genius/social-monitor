import type {
  ReaderSummaryArtifact,
  ReaderSummaryItem,
} from "../entities/reader-summary-artifact";
import type { ReaderSummaryCitation } from "../entities/citation";
import { normalizeGitHubRepositoryFullName } from "../value-objects/github-repository-identity";
import {
  githubTrendingNarrativeSectionId,
  githubTrendingProviderKey,
  maxGitHubTrendingDisplayRepositories,
} from "./reader-summary-github-trending-policy";
import {
  buildReaderSummaryGitHubProjectionCollectionTelemetry,
  exactUtcDay,
  githubProjectionTimesAreBounded,
  type ReaderSummaryGitHubProjectionCollectionTelemetry,
} from "./reader-summary-github-projection-collection-window";
import { verifiedGitHubWatchFollowsBindings } from "./reader-summary-github-projection-verification";

export {
  buildReaderSummaryGitHubProjectionCollectionTelemetry,
  exactUtcDay,
  githubProjectionTimesAreBounded,
  readerSummaryGitHubProjectionCollectionGraceMs,
  readerSummaryGitHubProjectionCollectionWarningThresholdMs,
} from "./reader-summary-github-projection-collection-window";
export type { ReaderSummaryGitHubProjectionCollectionTelemetry } from "./reader-summary-github-projection-collection-window";
export type ReaderSummaryGitHubProjectionViolationCode =
  | "github_projection_unavailable"
  | "github_projection_day_invalid"
  | "github_projection_missing"
  | "github_projection_duplicate"
  | "github_projection_gapped"
  | "github_projection_ambiguous"
  | "github_projection_mixed"
  | "github_projection_stale"
  | "github_projection_identity_invalid";

export type ReaderSummaryGitHubProjectionItem = {
  readonly feedItemId: string;
  readonly sourceItemId: string;
  readonly sourceBindingId: string;
  readonly providerKey: string;
  readonly metadataKind?: string;
  readonly scanJobId?: string;
  readonly canonicalUrl: string;
  readonly repositoryFullName?: string;
  readonly rank?: number;
  readonly starsGained?: number;
  readonly window?: string;
  readonly fetchStartedAt?: Date;
  readonly checkedAt?: Date;
  readonly publishedAt: Date;
  readonly observedAt: Date;
  readonly sourceContentHash: string;
  readonly sourceProviderContentHash: string;
};

export type ReaderSummaryGitHubProjectionBinding = {
  readonly selectedPostIndex: number;
  readonly rank: number;
  readonly citationId: string;
  readonly feedItemId: string;
  readonly sourceItemId: string;
  readonly sourceBindingId: string;
  readonly providerKey: string;
  readonly metadataKind: string;
  readonly scanJobId: string;
  readonly repositoryIdentity: string;
  readonly canonicalUrl: string;
  readonly starsGained: number;
  readonly fetchStartedAt: string;
  readonly publishedAt: string;
  readonly checkedAt: string;
  readonly observedAt: string;
  readonly sourceContentHash: string;
  readonly sourceProviderContentHash: string;
};

export type ReaderSummaryGitHubProjectionAudit = {
  readonly schemaVersion: "reader_summary.github_projection.v1";
  readonly status:
    | "not_applicable"
    | "not_required"
    | "verified"
    | "rejected";
  readonly requestedUtcDay: string;
  readonly pageCount: number;
  readonly scannedItemCount: number;
  readonly eligibleBindingIds: readonly string[];
  readonly observedThrough?: string;
  readonly projectionCheckedAt?: string;
  readonly telemetry?: ReaderSummaryGitHubProjectionCollectionTelemetry;
  readonly historicalOmission?: {
    readonly mode: "github_projection_unavailable_historical";
    readonly reason: string;
    readonly authorizedAt: string;
  };
  readonly bindings: readonly ReaderSummaryGitHubProjectionBinding[];
  readonly violationCodes: readonly ReaderSummaryGitHubProjectionViolationCode[];
  readonly reasons: readonly string[];
};

export type ReaderSummaryGitHubProjectionEvaluation = {
  readonly audit: ReaderSummaryGitHubProjectionAudit;
  readonly findings: readonly {
    readonly code: ReaderSummaryGitHubProjectionViolationCode;
    readonly reason: string;
  }[];
};

export const readerSummaryRequiresGitHubProjection = (
  artifact: ReaderSummaryArtifact,
): boolean => {
  const snapshot = artifact.toSnapshot();
  return (
    snapshot.period.cadence === "daily" ||
    (snapshot.content?.selectedPosts ?? []).some(isGitHubReaderItem) ||
    snapshot.citationMap.some(isGitHubCitation)
  );
};

export const readerSummaryHasNoGitHubEvidence = (
  artifact: ReaderSummaryArtifact,
): boolean => {
  const snapshot = artifact.toSnapshot();
  return (
    readerSummaryHasNoPrimaryGitHubEvidence(artifact) &&
    !(snapshot.content?.selectedPosts ?? []).some(isGitHubReaderItem) &&
    !snapshot.citationMap.some(isGitHubCitation)
  );
};

export const readerSummaryIsOrdinaryNoSignalWithoutEvidence = (artifact: ReaderSummaryArtifact): boolean => {
  const snapshot = artifact.toSnapshot(); const content = snapshot.content;
  const contentHasNoEvidence = content === undefined ||
    (content.qualityState !== undefined && (content.qualityState.status === "no_signal" ||
      content.qualityState.flags.includes("no_signal")) && content.topReads.length === 0 &&
      (content.selectedPosts?.length ?? 0) === 0 && (content.narrativeSections ?? [])
        .every((section) => section.citationIds.length === 0));
  return snapshot.period.cadence === "daily" &&
    (snapshot.qualityFlags ?? []).includes("no_signal") &&
    nonEmpty(snapshot.noSignalReason ?? "") && snapshot.citationMap.length === 0 &&
    (snapshot.topStories ?? []).length === 0 && readerSummaryHasNoGitHubEvidence(artifact) &&
    contentHasNoEvidence;
};

export const readerSummaryHasNoPrimaryGitHubEvidence = (
  artifact: ReaderSummaryArtifact,
): boolean => {
  const snapshot = artifact.toSnapshot();
  const content = snapshot.content;
  const githubCitationIds = new Set(
    snapshot.citationMap.filter(isGitHubCitation).map((item) => item.citationId),
  );
  const githubFeedItemIds = new Set(
    snapshot.citationMap.filter(isGitHubCitation).map((item) => item.feedItemId),
  );
  const citesGitHub = (citationIds: readonly string[] | undefined): boolean =>
    citationIds?.some((citationId) => githubCitationIds.has(citationId)) ??
    false;
  const usesGitHubProvider = (providerKey: string): boolean =>
    providerKey.trim().toLocaleLowerCase("en-US") ===
    githubTrendingProviderKey;
  const readerItemUsesGitHub = (item: ReaderSummaryItem): boolean =>
    usesGitHubProvider(item.providerKey) ||
    item.confirmedProviderKeys.some(usesGitHubProvider) ||
    citesGitHub(item.citationIds);

  return !(
    (snapshot.storyClusters ?? []).some(
      (cluster) =>
        cluster.providerKeys.some(usesGitHubProvider) ||
        githubFeedItemIds.has(cluster.representativeFeedItemId) ||
        cluster.duplicateFeedItemIds.some((feedItemId) =>
          githubFeedItemIds.has(feedItemId),
        ),
    ) ||
    (snapshot.topStories ?? []).some(
      (story) =>
        story.providerKeys.some(usesGitHubProvider) ||
        citesGitHub(story.citationIds),
    ) ||
    (snapshot.interestHighlights ?? []).some((highlight) =>
      citesGitHub(highlight.citationIds),
    ) ||
    (snapshot.repeatedSignals ?? []).some((signal) =>
      citesGitHub(signal.citationIds),
    ) ||
    (snapshot.risksAndUnknowns ?? []).some((risk) =>
      citesGitHub(risk.citationIds),
    ) ||
    (content?.sourceMix?.some((entry) =>
      usesGitHubProvider(entry.providerKey),
    ) ??
      false) ||
    (content?.topReads?.some(readerItemUsesGitHub) ?? false) ||
    (content?.interestSections?.some(
      (section) =>
        citesGitHub(section.citationIds) ||
        section.items.some(readerItemUsesGitHub),
    ) ??
      false) ||
    (content?.claimBoard?.some(
      (claim) =>
        citesGitHub(claim.citationIds) ||
        claim.evidence.some(
          (evidence) =>
            usesGitHubProvider(evidence.providerKey) ||
            githubCitationIds.has(evidence.citationId),
        ),
    ) ??
      false) ||
    (content?.topicMap?.nodes.some(
      (node) =>
        node.providerKeys.some(usesGitHubProvider) ||
        citesGitHub(node.citationIds),
    ) ??
      false) ||
    (content?.nextActions?.some((action) => citesGitHub(action.citationIds)) ??
      false) ||
    (content?.narrativeSections?.some(
      (section) =>
        citesGitHub(section.citationIds) &&
        (section.id !== githubTrendingNarrativeSectionId ||
          section.kind !== "watch"),
    ) ??
      false)
  );
};

export const readerSummaryHasVerifiedGitHubProjection = (params: {
  readonly artifact: ReaderSummaryArtifact;
  readonly audit: ReaderSummaryGitHubProjectionAudit | undefined;
}): boolean => {
  const snapshot = params.artifact.toSnapshot();
  const day = exactUtcDay(
    snapshot.period.startedAt,
    snapshot.period.endedAt,
    snapshot.period.timezone,
  );
  const projectionCheckedAt = new Date(
    params.audit?.projectionCheckedAt ?? "invalid",
  );
  const observedThrough = new Date(params.audit?.observedThrough ?? "invalid");
  if (
    params.audit === undefined ||
    params.audit.schemaVersion !== "reader_summary.github_projection.v1" ||
    !Number.isSafeInteger(params.audit.pageCount) ||
    params.audit.pageCount < 0 ||
    !Number.isSafeInteger(params.audit.scannedItemCount) ||
    params.audit.scannedItemCount < 0 ||
    params.audit.violationCodes.length > 0 ||
    params.audit.reasons.length > 0 ||
    !validEligibleBindingIds(params.audit.eligibleBindingIds) ||
    !readerSummaryHasNoPrimaryGitHubEvidence(params.artifact)
  ) {
    return false;
  }

  if (params.audit.status === "not_applicable") {
    return (
      day === undefined &&
      !readerSummaryRequiresGitHubProjection(params.artifact) &&
      params.audit.requestedUtcDay === snapshot.period.periodKey &&
      params.audit.pageCount === 0 &&
      params.audit.eligibleBindingIds.length === 0 &&
      params.audit.scannedItemCount === 0 &&
      params.audit.bindings.length === 0 &&
      params.audit.observedThrough === undefined &&
      params.audit.projectionCheckedAt === undefined &&
      params.audit.telemetry === undefined
    );
  }
  if (day === undefined || params.audit.requestedUtcDay !== day.day) {
    return false;
  }

  if (params.audit.status === "not_required") {
    const historicalOmission = params.audit.historicalOmission;
    if (historicalOmission !== undefined) {
      const authorizedAt = new Date(historicalOmission.authorizedAt);
      return (
        snapshot.period.cadence === "daily" &&
        historicalOmission.mode ===
          "github_projection_unavailable_historical" &&
        nonEmpty(historicalOmission.reason) &&
        Number.isFinite(authorizedAt.getTime()) &&
        authorizedAt.getTime() >= day.endedAt.getTime() &&
        readerSummaryHasNoGitHubEvidence(params.artifact) &&
        params.audit.pageCount === 0 &&
        params.audit.eligibleBindingIds.length === 0 &&
        params.audit.scannedItemCount === 0 &&
        params.audit.bindings.length === 0 &&
        params.audit.observedThrough === undefined &&
        params.audit.projectionCheckedAt === undefined &&
        params.audit.telemetry === undefined
      );
    }
    return (
      params.audit.pageCount >= 1 &&
      (readerSummaryIsOrdinaryNoSignalWithoutEvidence(params.artifact) ||
        (snapshot.period.cadence !== "daily" &&
          !readerSummaryRequiresGitHubProjection(params.artifact))) &&
      params.audit.eligibleBindingIds.length === 0 &&
      params.audit.scannedItemCount === 0 &&
      params.audit.bindings.length === 0 &&
      params.audit.observedThrough === undefined &&
      params.audit.projectionCheckedAt === undefined &&
      params.audit.telemetry === undefined
    );
  }
  if (
    params.audit.status !== "verified" ||
    params.audit.historicalOmission !== undefined ||
    params.audit.pageCount < 1 ||
    params.audit.eligibleBindingIds.length !== 1 ||
    params.audit.scannedItemCount < maxGitHubTrendingDisplayRepositories ||
    !exactIsoInstant(params.audit.projectionCheckedAt) ||
    !Number.isFinite(projectionCheckedAt.getTime()) ||
    projectionCheckedAt.getTime() < day.startedAt.getTime() ||
    projectionCheckedAt.getTime() >= day.endedAt.getTime() ||
    !exactIsoInstant(params.audit.observedThrough) ||
    !Number.isFinite(observedThrough.getTime()) ||
    projectionCheckedAt.getTime() > observedThrough.getTime() ||
    params.audit.bindings.length !== maxGitHubTrendingDisplayRepositories
  ) {
    return false;
  }
  const selectedPosts = (snapshot.content?.selectedPosts ?? []).filter(
    isGitHubReaderItem,
  );
  if (
    selectedPosts.length !== maxGitHubTrendingDisplayRepositories
  ) {
    return false;
  }
  const bindings = params.audit.bindings;
  const expectedTelemetry = buildReaderSummaryGitHubProjectionCollectionTelemetry({
    dayEndedAt: day.endedAt,
    observedAt: bindings.map((binding) => new Date(binding.observedAt)),
  });
  const projectionCheckedAtIso = params.audit.projectionCheckedAt;
  const eligibleBindingId = params.audit.eligibleBindingIds[0];
  const citationById = new Map(
    snapshot.citationMap.map(
      (citation) => [citation.citationId, citation] as const,
    ),
  );
  if (
    hasDuplicates(bindings.map((binding) => binding.citationId)) ||
    hasDuplicates(bindings.map((binding) => binding.feedItemId)) ||
    hasDuplicates(bindings.map((binding) => binding.sourceItemId)) ||
    hasDuplicates(bindings.map((binding) => binding.repositoryIdentity)) ||
    new Set(bindings.map((binding) => binding.scanJobId)).size !== 1 ||
    new Set(bindings.map((binding) => binding.fetchStartedAt)).size !== 1 ||
    new Set(bindings.map((binding) => binding.publishedAt)).size !== 1 ||
    new Set(bindings.map((binding) => binding.checkedAt)).size !== 1 ||
    new Set(bindings.map((binding) => binding.observedAt)).size !== 1 ||
    bindings.some((binding) => binding.sourceBindingId !== eligibleBindingId) ||
    bindings.some(
      (binding) =>
        binding.providerKey !== githubTrendingProviderKey ||
        binding.metadataKind !== "github_trending_page_repository" ||
        !nonEmpty(binding.scanJobId) ||
        !exactIsoInstant(binding.fetchStartedAt) ||
        !exactIsoInstant(binding.publishedAt) ||
        !exactIsoInstant(binding.checkedAt) ||
        !exactIsoInstant(binding.observedAt),
    ) ||
    !verifiedGitHubWatchFollowsBindings({
      artifact: params.artifact,
      bindings,
    }) ||
    !sameCollectionTelemetry(params.audit.telemetry, expectedTelemetry)
  ) {
    return false;
  }

  return selectedPosts.every((post, index) => {
    const binding = bindings[index];
    const identity = canonicalGitHubRepositoryIdentity(post.canonicalUrl);
    const citation =
      post.citationIds.length === 1
        ? citationById.get(post.citationIds[0]!)
        : undefined;
    return (
      binding !== undefined &&
      citation !== undefined &&
      isGitHubCitation(citation) &&
      binding.selectedPostIndex === index &&
      binding.rank === index + 1 &&
      binding.repositoryIdentity === identity &&
      binding.canonicalUrl === post.canonicalUrl &&
      post.citationIds.length === 1 &&
      binding.citationId === post.citationIds[0] &&
      binding.feedItemId === citation.feedItemId &&
      binding.sourceItemId === citation.sourceItemId &&
      binding.canonicalUrl === citation.canonicalUrl &&
      binding.checkedAt === projectionCheckedAtIso &&
      githubProjectionTimesAreBounded({
        dayStartedAt: day.startedAt,
        dayEndedAt: day.endedAt,
        observedThrough,
        fetchStartedAt: new Date(binding.fetchStartedAt),
        publishedAt: new Date(binding.publishedAt),
        checkedAt: new Date(binding.checkedAt),
        observedAt: new Date(binding.observedAt),
      }) &&
      selectedPostGitHubMetric(post, "rank") === binding.rank &&
      selectedPostGitHubMetric(post, "stars") === binding.starsGained &&
      nonEmpty(binding.feedItemId) &&
      nonEmpty(binding.sourceItemId) &&
      nonEmpty(binding.sourceBindingId) &&
      /^[a-f0-9]{64}$/iu.test(binding.sourceContentHash) &&
      /^[a-f0-9]{64}$/iu.test(binding.sourceProviderContentHash)
    );
  });
};

export const isGitHubReaderItem = (
  item: Pick<ReaderSummaryItem, "providerKey">,
): boolean =>
  item.providerKey.trim().toLocaleLowerCase("en-US") ===
  githubTrendingProviderKey;

export const isGitHubCitation = (
  citation: Pick<ReaderSummaryCitation, "providerKey">,
): boolean =>
  citation.providerKey.trim().toLocaleLowerCase("en-US") ===
  githubTrendingProviderKey;

export const selectedPostGitHubMetric = (
  item: ReaderSummaryItem,
  metric: "rank" | "stars",
): number | undefined => {
  const trending = item.providerMetrics.find(
    (candidate) =>
      candidate.label.trim().toLocaleLowerCase("en-US") ===
      "github trending today",
  );
  const match =
    metric === "rank"
      ? trending?.value.match(/#([\d,]+)\b/u)
      : trending?.value.match(/\+([\d,]+)\s+stars\b/iu);
  const value = Number(match?.[1]?.replaceAll(",", ""));
  return Number.isSafeInteger(value) &&
    (metric === "rank" ? value > 0 : value >= 0)
    ? value
    : undefined;
};

export const canonicalGitHubRepositoryIdentity = (
  value: string | undefined,
): string | undefined => {
  if (value === undefined) {
    return undefined;
  }
  const match = value.match(
    /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/u,
  );
  return match === null
    ? undefined
    : normalizeGitHubRepositoryFullName(`${match[1]}/${match[2]}`);
};

export const normalizeRepositoryFullName = (
  value: string | undefined,
): string | undefined => normalizeGitHubRepositoryFullName(value);

export const nonEmpty = (value: string): boolean => value.trim().length > 0;

const exactIsoInstant = (value: string | undefined): boolean => {
  const parsed = new Date(value ?? "invalid");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
};

const sameCollectionTelemetry = (
  actual: ReaderSummaryGitHubProjectionCollectionTelemetry | undefined,
  expected: ReaderSummaryGitHubProjectionCollectionTelemetry | undefined,
): boolean =>
  actual !== undefined &&
  expected !== undefined &&
  actual.github_projection_collection_delay_ms ===
    expected.github_projection_collection_delay_ms &&
  actual.collectionGraceMs === expected.collectionGraceMs &&
  actual.warningThresholdMs === expected.warningThresholdMs &&
  actual.qualitySignal === expected.qualitySignal;

export const hasDuplicates = <TValue>(values: readonly TValue[]): boolean =>
  new Set(values).size !== values.length;
export const validEligibleBindingIds = (
  bindingIds: readonly string[],
): boolean =>
  bindingIds.every(nonEmpty) &&
  !hasDuplicates(bindingIds) &&
  bindingIds.every(
    (bindingId, index) => [...bindingIds].sort()[index] === bindingId,
  );
