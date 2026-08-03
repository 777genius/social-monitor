import { canonicalizeReaderSummaryWeeklyJson } from "../../libs/summary/domain/value-objects/reader-summary-weekly-canonical-json";
import { readerSummaryWeeklyCanonicalProviderKeys } from "../../libs/summary/domain/value-objects/reader-summary-weekly-daily-certification";
import {
  createReaderSummaryWeeklyReviewManifest,
  deriveReaderSummaryWeeklyReviewStoryCandidates,
  type ReaderSummaryWeeklyReviewManifest,
  type ReaderSummaryWeeklyReviewSelection,
} from "../../libs/summary/domain/value-objects/reader-summary-weekly-review-manifest";

import {
  readerSummaryWeeklyReviewAuthorityFromProductionState,
  resolveReaderSummaryWeeklyProductionWindow,
  type ReaderSummaryWeeklyProductionCertification,
  type ReaderSummaryWeeklyProductionDbState,
} from "./reader-summary-weekly-production-postgres-contract";

export const tenantId = "11111111-1111-4111-8111-111111111111";
export const workspaceId = "22222222-2222-4222-8222-222222222222";
export const window = resolveReaderSummaryWeeklyProductionWindow("2026-07-20");

export const completeDbState = (): ReaderSummaryWeeklyProductionDbState => {
  const certifications = Object.freeze(window.dates.map(certificationFor));
  return Object.freeze({
    status: "complete" as const,
    scope: Object.freeze({
      tenantId,
      workspaceId,
      scope: Object.freeze({ type: "workspace" as const }),
    }),
    window,
    weeklyCertificationSeal: certificationSealFor(certifications),
    certifications,
    missingDates: Object.freeze([]),
    blockingReasons: Object.freeze([]),
  });
};

export const reviewManifestFor = (
  dbState: ReaderSummaryWeeklyProductionDbState = completeDbState(),
  options: Readonly<{
    selections?: readonly ReaderSummaryWeeklyReviewSelection[];
    responseSalt?: string;
  }> = {},
): ReaderSummaryWeeklyReviewManifest => {
  const authority = readerSummaryWeeklyReviewAuthorityFromProductionState(dbState);
  const candidates = deriveReaderSummaryWeeklyReviewStoryCandidates(authority);
  const selections = options.selections ?? candidates.map((candidate) =>
    Object.freeze({
      story: candidate.story,
      label: "observation" as const,
      citationSelectors: Object.freeze(
        candidate.citations.map((citation) => citation.selector),
      ),
    }),
  );
  const modelResponseSha256 = sha(`weekly-review:${options.responseSalt ?? "default"}`);
  return createReaderSummaryWeeklyReviewManifest({
    authority,
    selections,
    modelResponseSha256,
    executionAttestation: Object.freeze({
      schemaVersion: 1 as const,
      requestId: "reader-summary-weekly-review:fixture",
      purpose: "social_monitor.reader_summary.weekly.review" as const,
      canonicalRequestSha256: sha("weekly-review-request"),
      provider: "codex" as const,
      model: "gpt-5.6-sol" as const,
      reasoningEffort: "xhigh" as const,
      runtimeEngine: "subscription-runtime-cli" as const,
      runtimePackageVersion: "fixture-1.0.0",
      launcherSha256: sha("weekly-review-launcher"),
      selectedOutputKind: "structured_output" as const,
      selectedOutputSha256: modelResponseSha256,
    }),
  });
};

export const admittedRunnerInput = (
  dbState: ReaderSummaryWeeklyProductionDbState = completeDbState(),
): Readonly<{
  dbState: ReaderSummaryWeeklyProductionDbState;
  reviewManifest: ReaderSummaryWeeklyReviewManifest;
}> => Object.freeze({ dbState, reviewManifest: reviewManifestFor(dbState) });

export const historicalGithubUnavailableDbState = (): ReaderSummaryWeeklyProductionDbState => {
  const base = completeDbState();
  const certifications = Object.freeze(base.certifications.map((certification) =>
    certification.requestedUtcDate !== "2026-07-23"
      ? certification
      : Object.freeze({
          ...certification,
          providerCounts: Object.freeze(
            certification.providerCounts.map((count) => Object.freeze({
              ...count,
              count: count.providerKey === "github-trending-page" ? 0 : count.count,
            })),
          ),
          githubEvidence: Object.freeze({
            ...certification.githubEvidence,
            mode: "historical_unavailable",
            evidenceCount: 0,
            repositories: Object.freeze([]),
            sha256: sha("github:2026-07-23:historical-unavailable"),
          }),
          providerEvidence: Object.freeze(
            certification.providerEvidence.filter((evidence) =>
              evidence.providerKey !== "github-trending-page"),
          ),
        }),
  ));
  return Object.freeze({
    ...base,
    certifications,
    weeklyCertificationSeal: certificationSealFor(certifications),
  });
};

export const sha = (input: string): string =>
  canonicalizeReaderSummaryWeeklyJson({ input }).sha256;

const certificationSealFor = (
  certifications: readonly ReaderSummaryWeeklyProductionCertification[],
) => {
  const body = {
    schemaVersion: "reader_summary.weekly_certification_seal.v1",
    tenantId,
    workspaceId,
    scopeType: "workspace",
    scopeKey: "workspace",
    weekStartedOn: window.weekStartedOn,
    weekEndedOn: window.weekEndedOn,
    days: certifications.map((certification) => ({
      requestedUtcDate: certification.requestedUtcDate,
      publicationId: certification.publicationId,
      artifactId: certification.artifactId,
      jobId: certification.jobId,
      semanticStatus: certification.semanticStatus,
      publicationEvidenceIdentity: certification.identity,
      publicationEvidenceSha256: certification.canonicalSha256,
    })),
  };
  const canonical = canonicalizeReaderSummaryWeeklyJson(body);
  const sealId = `reader_summary.weekly_certification_seal.v1:${canonical.sha256}`;
  return Object.freeze({
    sealId,
    sealSha256: canonical.sha256,
    tenantId,
    workspaceId,
    scopeType: "workspace" as const,
    scopeKey: "workspace",
    weekStartedOn: window.weekStartedOn,
    weekEndedOn: window.weekEndedOn,
    days: Object.freeze(body.days),
    canonicalRecord: Object.freeze({
      ...body,
      sealId,
      sealSha: canonical.sha256,
    }),
    canonicalBytes: canonical.json,
    recordedAt: "2026-07-27T06:00:00.000Z",
  });
};

const certificationFor = (
  date: string,
  index: number,
): ReaderSummaryWeeklyProductionCertification => Object.freeze({
  requestedUtcDate: date,
  tenantId,
  workspaceId,
  scope: Object.freeze({ type: "workspace" as const }),
  scopeKey: "workspace",
  publicationId: `publication:${date}`,
  artifactId: `artifact:${date}`,
  jobId: `job:${date}`,
  reportId: `report:${date}`,
  proofId: `proof:${date}`,
  semanticStatus: "COMPLETED" as const,
  periodStartedAt: `${date}T00:00:00.000Z`,
  periodEndedAt: `${nextDate(date)}T00:00:00.000Z`,
  providerCounts: Object.freeze(
    readerSummaryWeeklyCanonicalProviderKeys.map((providerKey) =>
      Object.freeze({
        providerKey,
        count: providerKey === "github-trending-page" ? 10 : providerKey === "rss" ? 1 : 0,
      }),
    ),
  ),
  githubEvidence: Object.freeze({
    schemaVersion: "reader_summary.weekly_publication_github_evidence.v1",
    mode: "verified",
    evidenceCount: 10,
    repositories: Array.from({ length: 10 }, (_, repoIndex) => ({ rank: repoIndex + 1 })),
    sha256: sha(`github:${date}`),
  }),
  providerEvidence: Object.freeze([
    providerEvidence(date, "github-trending-page", index * 2),
    providerEvidence(date, "rss", index * 2 + 1),
  ]),
  report: Object.freeze({ status: "ok" }),
  exactProof: Object.freeze({ status: "ok" }),
  canonicalRecord: Object.freeze({ status: "ok" }),
  canonicalSha256: sha(`cert:${date}`),
  identity: `reader_summary.weekly_publication_evidence.v1:${sha(`cert:${date}`)}`,
  recordedAt: `${date}T12:00:00.000Z`,
});

const providerEvidence = (date: string, providerKey: string, index: number) => {
  const isDurableRssStory = providerKey === "rss";
  return Object.freeze({
    citationId: `citation:${date}:${providerKey}`,
    citationField: "title" as const,
    feedItemId: `feed:${date}:${index}`,
    sourceItemId: `source-item:${date}:${index}`,
    sourceBindingId: `binding:${date}:${index}`,
    providerKey: providerKey as "github-trending-page" | "rss",
    providerItemId: `provider-item:${date}:${index}`,
    canonicalUrl: isDurableRssStory
      ? "https://example.com/rss/durable-story"
      : `https://example.com/${providerKey}/${date}/${index}`,
    title: isDurableRssStory
      ? "One durable reader story"
      : `Durable evidence ${providerKey} ${date}`,
    sourceText: `Stable source text for ${providerKey} on ${date} with enough weekly context to cite.`,
    publishedAt: `${date}T08:00:00.000Z`,
    observedAt: `${date}T09:00:00.000Z`,
    sourceContentHash: sha(`${providerKey}:${date}:${index}`),
  });
};

const nextDate = (date: string): string =>
  new Date(Date.parse(`${date}T00:00:00.000Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10);
