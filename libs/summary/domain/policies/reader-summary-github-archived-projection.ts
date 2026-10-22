import {
  githubTrendingArchiveExternalId,
  parseGitHubTrendingArchiveMetadata,
  type GitHubTrendingArchiveMetadata,
} from "@social-monitor/ingestion/domain";
import type { ReaderSummaryArtifact } from "../entities/reader-summary-artifact";
import type { ReaderSummaryGitHubProjectionAudit, ReaderSummaryGitHubProjectionEvaluation,
  ReaderSummaryGitHubProjectionItem } from "./reader-summary-github-projection-audit";
import { githubTrendingWatchText, minimumGitHubTrendingStarsGained,
  maxGitHubTrendingHighlights, maxGitHubTrendingDisplayRepositories } from "./reader-summary-github-trending-policy";
import { normalizeGitHubRepositoryFullName } from "../value-objects/github-repository-identity";
import { normalizeJsonObject } from "@social-monitor/shared-kernel";

/** Archive custody is independent of a live fetch/scan envelope. */
export type ArchivedGitHubProjectionBinding = {
  readonly scanJobId: null;
  readonly fetchStartedAt: null;
  readonly checkedAt: null;
  readonly selectedPostIndex: number;
  readonly citationId: string;
  readonly feedItemId: string;
  readonly sourceItemId: string;
  readonly sourceBindingId: string;
  readonly sourceExternalId: string;
  readonly canonicalUrl: string;
  readonly sourceContentHash: string;
  readonly sourceProviderContentHash: string;
  readonly publishedAt: string;
  readonly observedAt: string;
  readonly observation: GitHubTrendingArchiveMetadata;
};
type Day = { readonly day: string; readonly startedAt: Date; readonly endedAt: Date };
const exactInstant = (value: string): boolean => Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;
const validHash = (value: string): boolean => /^[a-f0-9]{64}$/u.test(value);
const unique = (values: readonly string[]): boolean => new Set(values).size === values.length;

const validBinding = (binding: ArchivedGitHubProjectionBinding, day: Day,
  cutoff: string): boolean => {
  const m = parseGitHubTrendingArchiveMetadata(normalizeJsonObject(binding.observation));
  return m !== null && binding.scanJobId === null && binding.fetchStartedAt === null && binding.checkedAt === null &&
    binding.sourceExternalId === githubTrendingArchiveExternalId(m.archive, m.repository.fullName) &&
    binding.canonicalUrl === m.repository.url && binding.publishedAt === m.archive.serializedAt &&
    Date.parse(binding.observedAt) >= Date.parse(m.archive.acquiredAt) && exactInstant(binding.observedAt) &&
    Date.parse(binding.observedAt) <= Date.parse(cutoff) &&
    Date.parse(binding.publishedAt) >= day.startedAt.getTime() &&
    Date.parse(binding.publishedAt) < day.endedAt.getTime() &&
    validHash(binding.sourceContentHash) && validHash(binding.sourceProviderContentHash) &&
    [binding.feedItemId, binding.sourceItemId, binding.sourceBindingId].every(value => value.trim().length > 0);
};

const artifactFollowsArchive = (artifact: ReaderSummaryArtifact,
  bindings: readonly ArchivedGitHubProjectionBinding[], day: Day): boolean => {
  const snapshot = artifact.toSnapshot();
  const posts = (snapshot.content?.selectedPosts ?? []).filter(post => post.providerKey === "github-trending-page");
  const citations = new Map(snapshot.citationMap.map(citation => [citation.citationId, citation]));
  if (posts.length !== bindings.length || bindings.length < 1 ||
      bindings.length > maxGitHubTrendingDisplayRepositories || !bindings.every((binding, index) => {
    const post = posts[index], citation = citations.get(binding.citationId), m = binding.observation;
    const metric = post?.providerMetrics.find(value => value.label === `GitHub Trending archive ${day.day}`);
    return binding.selectedPostIndex === index && m.trending.rank === index + 1 &&
      post?.canonicalUrl === binding.canonicalUrl && post.citationIds.length === 1 &&
      post.citationIds[0] === binding.citationId && citation?.providerKey === "github-trending-page" &&
      citation.feedItemId === binding.feedItemId && citation.sourceItemId === binding.sourceItemId &&
      citation.canonicalUrl === binding.canonicalUrl &&
      metric?.value === `#${m.trending.rank}, +${m.trending.starsGained.toLocaleString("en-US")} stars on ${day.day}`;
  })) return false;
  const expected = bindings.filter(binding => binding.observation.trending.starsGained > minimumGitHubTrendingStarsGained)
    .slice(0, maxGitHubTrendingHighlights);
  const githubIds = new Set(snapshot.citationMap.filter(citation => citation.providerKey === "github-trending-page")
    .map(citation => citation.citationId));
  const sections = (snapshot.content?.narrativeSections ?? []).filter(section => section.id === "github-trending" ||
    section.citationIds.some(id => githubIds.has(id)));
  if (expected.length === 0) return sections.length === 0;
  const section = sections.length === 1 ? sections[0] : undefined;
  return section?.id === "github-trending" && section.kind === "watch" &&
    section.title === `GitHub Trending archive ${day.day}` &&
    section.text === githubTrendingWatchText(expected.map(binding => ({
      repositoryIdentity: normalizeGitHubRepositoryFullName(binding.observation.repository.fullName)!,
      rank: binding.observation.trending.rank, starsGained: binding.observation.trending.starsGained,
      archivedUtcDay: day.day,
    }))) && section.citationIds.length === expected.length &&
    section.citationIds.every((id, index) => id === expected[index]?.citationId);
};

export const hasVerifiedArchivedGitHubProjection = (params: {
  readonly artifact: ReaderSummaryArtifact;
  readonly audit: ReaderSummaryGitHubProjectionAudit;
  readonly day: Day;
}): boolean => {
  const { audit, day } = params;
  const bindings = audit.archivedProjection?.bindings ?? [];
  const cutoff = audit.observedThrough ?? "";
  if (audit.archivedProjection?.observationKind !== "archived" || audit.status !== "verified" ||
      audit.requestedUtcDay !== day.day || !Number.isSafeInteger(audit.pageCount) || audit.pageCount < 1 ||
      !Number.isSafeInteger(audit.scannedItemCount) || audit.scannedItemCount < 1 ||
      audit.eligibleBindingIds.length !== 1 || audit.bindings.length !== 0 ||
      audit.projectionCheckedAt !== undefined || audit.telemetry !== undefined ||
      audit.historicalOmission !== undefined || !exactInstant(cutoff) ||
      bindings.length < 1 || bindings.length > maxGitHubTrendingDisplayRepositories ||
      audit.scannedItemCount !== bindings.length ||
      audit.violationCodes.length !== 0 || audit.reasons.length !== 0) return false;
  const first = bindings[0]!.observation;
  return unique(bindings.map(binding => binding.feedItemId)) &&
    unique(bindings.map(binding => binding.sourceItemId)) &&
    unique(bindings.map(binding => binding.citationId)) &&
    unique(bindings.map(binding => binding.observation.repository.fullName.toLowerCase())) &&
    bindings.every(binding => binding.sourceBindingId === audit.eligibleBindingIds[0] &&
      JSON.stringify(binding.observation.archive) === JSON.stringify(first.archive) &&
      binding.observation.trending.snapshotContentHash === first.trending.snapshotContentHash &&
      validBinding(binding, day, cutoff)) && artifactFollowsArchive(params.artifact, bindings, day);
};

export const evaluateArchivedGitHubProjection = (params: {
  readonly artifact: ReaderSummaryArtifact;
  readonly eligibleBindingIds: readonly string[];
  readonly items: readonly ReaderSummaryGitHubProjectionItem[];
  readonly pageCount: number;
  readonly observedThrough: Date;
  readonly day: Day;
  readonly hasNoPrimaryGitHubEvidence: boolean;
}): ReaderSummaryGitHubProjectionEvaluation => {
  const posts = (params.artifact.toSnapshot().content?.selectedPosts ?? [])
    .filter(post => post.providerKey === "github-trending-page");
  const bindings = [...params.items].sort((left, right) => (left.rank ?? 0) - (right.rank ?? 0))
    .flatMap((item, index): ArchivedGitHubProjectionBinding[] => {
      if (!Number.isFinite(item.publishedAt.getTime()) || !Number.isFinite(item.observedAt.getTime()) ||
          item.archivedObservation === undefined || item.providerKey !== "github-trending-page" ||
          item.metadataKind !== "github_trending_page_repository" || item.scanJobId !== undefined ||
          item.fetchStartedAt !== undefined || item.checkedAt !== undefined ||
          item.sourceExternalId === undefined || item.window !== "daily" ||
          item.rank !== item.archivedObservation.trending.rank ||
          item.starsGained !== item.archivedObservation.trending.starsGained ||
          normalizeGitHubRepositoryFullName(item.repositoryFullName) !==
            normalizeGitHubRepositoryFullName(item.archivedObservation.repository.fullName)) return [];
      return [{ scanJobId: null, fetchStartedAt: null, checkedAt: null, selectedPostIndex: index, citationId: posts[index]?.citationIds[0] ?? "",
        feedItemId: item.feedItemId, sourceItemId: item.sourceItemId, sourceBindingId: item.sourceBindingId,
        sourceExternalId: item.sourceExternalId, canonicalUrl: item.canonicalUrl,
        sourceContentHash: item.sourceContentHash, sourceProviderContentHash: item.sourceProviderContentHash,
        publishedAt: item.publishedAt.toISOString(), observedAt: item.observedAt.toISOString(),
        observation: item.archivedObservation }];
    });
  const audit: ReaderSummaryGitHubProjectionAudit = {
    schemaVersion: "reader_summary.github_projection.v1", status: "verified", requestedUtcDay: params.day.day,
    pageCount: params.pageCount, scannedItemCount: params.items.length,
    eligibleBindingIds: params.eligibleBindingIds, observedThrough: params.observedThrough.toISOString(),
    bindings: [], archivedProjection: { observationKind: "archived", bindings }, violationCodes: [], reasons: [],
  };
  if (params.items.length === bindings.length && Number.isSafeInteger(params.pageCount) &&
      params.hasNoPrimaryGitHubEvidence && hasVerifiedArchivedGitHubProjection({ artifact: params.artifact, audit, day: params.day })) {
    return { audit, findings: [] };
  }
  const finding = { code: "github_projection_identity_invalid" as const,
    reason: "Archived GitHub projection must bind one complete immutable archive board as published (up to Top 10), original publication day, truthful acquisition cutoff, exact citations and dated archive metrics; it cannot claim live scan custody." };
  return { audit: { ...audit, status: "rejected", violationCodes: [finding.code], reasons: [finding.reason] }, findings: [finding] };
};
