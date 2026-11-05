/** Fabricated fixture only. Domain builders own slate, display and V2 digests. */
import assert from "node:assert/strict";
import { eventId, correlationId, causationId } from "@social-monitor/shared-kernel";
import { ReaderSummaryArtifact, ReaderSummaryPublicationPolicy, type ReaderSummaryJob, type SummaryEvidenceSelection } from "@social-monitor/summary/domain";
import type { ReaderSummaryPublicationCommand, ReadReaderSummaryGitHubProjectionResult } from "@social-monitor/summary/ports";
import { composeReaderSummaryEditorialSlate } from "@social-monitor/summary/adapters/evidence/reader-summary-editorial-slate";
import { buildReaderPostPromotionProjection } from "@social-monitor/summary/domain/services/reader-post-promotion-projection";
import { acceptedFixtureReaderHeadline } from "@social-monitor/summary/test-fixtures/accepted-reader-headline";
import { artifact as baseArtifact, content } from "@social-monitor/summary/domain/policies/reader-summary-publication-policy-test-fixtures";
import { publicationContentQuality } from "@social-monitor/summary/domain/policies/reader-summary-publication-policy.spec-support";
import { fixtureId, fixtureDate, fixtureObservedThrough } from "./reader-summary-successor-fixture-seed";

import { successorGitHubSupplement } from "./reader-summary-successor-publication-github";
import { evaluateReaderSummaryGitHubProjection } from "@social-monitor/summary/domain/policies/reader-summary-github-projection-policy";

export function successorPublicationCommand(running: ReaderSummaryJob, artifactId: string, readyId: string, github: ReadReaderSummaryGitHubProjectionResult): ReaderSummaryPublicationCommand {
  const j = running.toSnapshot();
  assert.equal(j.status, "running");
  assert.equal(j.period.startedAt.toISOString().slice(0, 10), fixtureDate);
  assert(j.requestedAt > j.period.endedAt, "request must retain its later operation date");
  const at = j.startedAt!;
  const supplement = successorGitHubSupplement(github);
  const title = "Fabricated widget compiler adds a violet queue";
  const body = "Synthetic source text: the imaginary violet queue batches seven imaginary widgets. No real product or provider was queried.";
  const item = acceptedFixtureReaderHeadline({
    feedItemId: fixtureId(14), sourceItemId: fixtureId(13), sourceBindingId: fixtureId(12), interestId: fixtureId(11),
    providerKey: "hacker-news", providerName: "Hacker News", canonicalUrl: "https://fixture.example.test/story/violet-queue",
    title, bodyPreview: body, sourceText: body, publishedAt: new Date(`${fixtureDate}T12:00:00.000Z`),
    observedAt: new Date(fixtureObservedThrough), score: 1, whyImportant: ["A fabricated compiler batches widgets."],
    contentQuality: publicationContentQuality,
    promotionFacts: { contentKind: "story", canonicalIdentity: "url:https://fixture.example.test/story/violet-queue",
      safetyValid: true, freshnessValid: true, metricsState: "observed", metrics: { provider: "hacker_news", points: 123 },
      engagementAuthority: { observedAt: new Date(fixtureObservedThrough), regressionState: "stable" },
      freshnessProvenance: { status: "observed", publishedAt: new Date(`${fixtureDate}T12:00:00.000Z`),
        observedAt: new Date(fixtureObservedThrough), ingestionCutoff: new Date(fixtureObservedThrough) } },
  }, { tenantId: j.tenantId, workspaceId: j.workspaceId });
  const cluster = { id: "synthetic-violet-queue", storyKey: "synthetic-violet-queue", representativeFeedItemId: item.feedItemId,
    duplicateFeedItemIds: [], interestIds: [item.interestId], providerKeys: [item.providerKey], score: 1,
    observedAtRange: { startedAt: item.publishedAt, endedAt: item.observedAt }, whyImportant: item.whyImportant };
  const sourceWindow = { windowId: `synthetic:${j.id}`, startedAt: j.period.startedAt, endedAt: j.period.endedAt,
    periodStartedAt: j.period.startedAt, periodEndedAt: j.period.endedAt, ingestionCutoff: new Date(fixtureObservedThrough),
    selectedFeedItemIds: [item.feedItemId, ...supplement.evidence.map(e => e.feedItemId)], storyClusterIds: [cluster.id] };
  const selection: SummaryEvidenceSelection = { rankingPolicyVersion: "reader_promotion_policy.v2", selectedEvidence: [item, ...supplement.evidence], clusters: [cluster], sourceWindow };
  const editorialSlate = composeReaderSummaryEditorialSlate({ selection });
  assert.equal(editorialSlate.top.length, 1, JSON.stringify(editorialSlate));
  const citation = { citationId: fixtureId(90), feedItemId: item.feedItemId, sourceItemId: item.sourceItemId,
    providerKey: item.providerKey, field: "title" as const, canonicalUrl: item.canonicalUrl };
  const promotion = buildReaderPostPromotionProjection({ evidence: [item], clusters: [cluster], citations: [citation],
    sourceWindow, editorialSlate, attestationBinding: { artifactId, sourceWindow } });
  const headline = "Queue batching changes compiler work scheduling";
  const summary = "The imaginary compiler groups seven widgets in a violet queue.";
  const artifact = ReaderSummaryArtifact.create({ ...baseArtifact().toSnapshot(), readerSummaryId: artifactId,
    tenantId: j.tenantId, workspaceId: j.workspaceId, scope: j.scope, period: j.period, generatedAt: at,
    sourceWindow, storyClusters: [cluster], headline, executiveSummary: summary,
    lineage: { promptVersion: "synthetic.successor.v1", schemaVersion: "reader_summary.artifact.v1", modelVersion: "synthetic:not-invoked",
      providerVersion: "deterministic", rulesVersion: "reader_promotion_policy.v2", evalDatasetVersion: "reader_promotion_policy.v2",
      rankingPolicyVersion: "story_ranking_v10" },
    usage: { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 },
    citationMap: [citation, ...supplement.citations], topStories: [{ storyClusterId: cluster.id, title, summary, interestIds: cluster.interestIds,
      providerKeys: cluster.providerKeys, citationIds: [citation.citationId] }],
    content: content({ headline, oneLineTakeaway: summary, bullets: [summary],
      narrativeSections: [{ id: "synthetic-lead", kind: "lead", title: "Compiler scheduling", text: summary,
        citationIds: [citation.citationId], storyClusterId: cluster.id }, ...(supplement.appendix ? [supplement.appendix] : [])],
      topReads: promotion.topReads, selectedPosts: [...promotion.additionalPosts, ...supplement.posts],
      sourceMix: [{ providerKey: item.providerKey, itemCount: 1, citationCount: 1, storyClusterCount: 1,
        crossSourceClusterCount: 0, singleSourceOnly: true, interestIds: cluster.interestIds }] }),
    promotionAttestations: promotion.attestations, promotionEvidenceFacts: promotion.attestedEvidenceFacts });
  assert(artifact.toSnapshot().promotionAttestations?.every(a => a.policyVersion === "reader_post_promotion.v2"));
  const publicationDecision = new ReaderSummaryPublicationPolicy().evaluate({ artifact, evidence: { ...selection, editorialSlate } });
  assert.equal(publicationDecision.status, "published", JSON.stringify(publicationDecision));
  const { audit: githubProjectionAudit } = evaluateReaderSummaryGitHubProjection({ artifact, ...github, observedThrough: new Date(fixtureObservedThrough) });
  assert.equal(githubProjectionAudit.status, "verified", JSON.stringify(githubProjectionAudit));
  return { artifact, publicationDecision, finalJob: running.complete({ completedAt: at, readerSummaryId: artifactId }),
    githubProjectionAudit,
    readyEvent: { eventId: eventId(readyId), eventType: "reader_summary.ready", schemaVersion: 1, occurredAt: at,
      tenantId: j.tenantId, workspaceId: j.workspaceId, correlationId: correlationId(j.id), causationId: causationId(j.id),
      payload: { readerSummaryJobId: j.id, readerSummaryId: artifactId, tenantId: j.tenantId, workspaceId: j.workspaceId,
        scope: j.scope, period: j.period, status: "completed" } } };
}
