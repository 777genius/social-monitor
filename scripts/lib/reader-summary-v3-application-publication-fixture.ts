import { readerPromotionDiagnostics } from "../../libs/summary/domain/value-objects/reader-promotion-diagnostics";
import { SourceContentSafetyPolicy } from "../../libs/relevance/domain/source-content-safety";
import { ConservativeReaderValueInputBuilder } from "../../libs/relevance/infrastructure/reader-value/reader-value-input-builder";
import { randomUUID } from "node:crypto";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { ReaderSummaryArtifact, selectReaderPostPromotionsV3,
  type ReaderPostPromotionV3Candidate, type SummaryEvidenceSelection } from "../../libs/summary/domain";
import { READER_PROMOTION_POLICY_V1, type ReaderPromotionRankingContext } from "../../libs/summary/domain/policies/reader-promotion-policy-version";
import { sealReaderPostPresentationV3 } from "../../libs/summary/domain/services/reader-post-presentation-v3";
import { promotionPayloadDigest } from "../../libs/summary/domain/services/reader-post-promotion-attestation";
import { buildReaderSummaryDraftWithPromotionContent } from "../../libs/summary/features/execute-reader-summary-job/reader-summary-promotion-content";
import { buildReaderSummaryPromotionArtifactFields } from "../../libs/summary/features/execute-reader-summary-job/reader-summary-promotion-artifact-fields";
import { serializeReaderSummaryArtifact } from "../../libs/summary/adapters/persistence/prisma/prisma-reader-summary-json";
import { presentReaderSummaryArtifact } from "../../libs/summary/features/shared/reader-summary-artifact-presenter";
import { readerSummaryArtifactViewFromReaderSummaryView } from "../../libs/summary/interfaces/rest/reader-summary-rest.mapper";
import { validReaderDisplayRestBinding } from "../../libs/summary/interfaces/rest/reader-summary-display-rest-binding";
import { fixtureReaderValueAnswers } from "./reader-summary-v3-postgres-assessment-lifecycle";
import { assertPostgres as assert } from "./reader-summary-publication-postgres-assertions";
import { sha256, stableJson } from "./reader-summary-weekly-publication-evidence-postgres-contract";
import type { ReaderSummaryPublicationPostgresClient } from "./reader-summary-publication-postgres-fixture-scope";
import { persistV3FixtureAssessment } from "./reader-summary-v3-fixture-assessment";
import type { V3FixturePayload, V3ArtifactPayload } from "./reader-summary-v3-publication-fixture-types";

export const buildApplicationV3FixturePayload = async (client: ReaderSummaryPublicationPostgresClient,
  source: Readonly<Record<string, unknown>>, options: {
    readonly context?: ReaderPromotionRankingContext;
    readonly quote?: boolean;
    readonly diagnostics?: boolean;
    readonly engagement?: ReaderPostPromotionV3Candidate["engagement"];
    readonly peers?: readonly ReaderPostPromotionV3Candidate[];
  } = {}) => {
  const payload = JSON.parse(JSON.stringify(source)) as V3FixturePayload;
  const baseArtifact = payload.report.artifactPayload;
  const citation = baseArtifact.citationMap[0] as Record<string, string>;
  const candidateId = citation.feedItemId;
  const sourceItemId = citation.sourceItemId;
  const citationId = citation.citationId;
  if (candidateId === undefined || sourceItemId === undefined ||
      citationId === undefined) throw new Error("V3 fixture citation is incomplete");

  const authority = (await client.query<{ readonly source_binding_id: string;
    readonly interest_id: string; readonly provider_key: string;
    readonly title: string; readonly body: string;
    readonly published_at: string; readonly observed_at: string;
    readonly canonical_url: string; readonly trusted_intent: string }>(
    `SELECT f.source_binding_id::text, f.interest_id::text, f.provider_key,
      f.title, COALESCE(s.body, f.body_preview, '') AS body,
      to_char(f.published_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') published_at,
      to_char(f.observed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') observed_at,
      f.canonical_url, i.query AS trusted_intent
    FROM feed_items f JOIN source_items s
      ON s.tenant_id=f.tenant_id AND s.workspace_id=f.workspace_id
      AND s.id=f.source_item_id
    JOIN interests i ON i.tenant_id=f.tenant_id AND i.workspace_id=f.workspace_id
      AND i.id=f.interest_id WHERE f.id=$1::uuid`, [candidateId])).rows[0];
  if (authority === undefined || (payload.scopeType !== "workspace" && authority.interest_id !== payload.interestId) ||
      (authority.provider_key !== "rss" && authority.provider_key !== "reddit" && authority.provider_key !== "x-twitter")) {
    throw new Error("V3 fixture source authority is incomplete");
  }
  const providerKey = authority.provider_key;
  const title = authority.title;
  const sourceText = authority.body;
  const input = { tenantId: payload.tenantId, workspaceId: payload.workspaceId,
    interestId: authority.interest_id, candidateId,
    sourceItemId, sourceBindingId: authority.source_binding_id,
    providerKey: authority.provider_key, trustedIntent: authority.trusted_intent,
    sourceSnapshotSha256: "1".repeat(64), title, body: sourceText,
    captureComplete: true };
  const quotePrepared = options.quote ? new ConservativeReaderValueInputBuilder(new SourceContentSafetyPolicy()).prepare({
    tenantId: payload.tenantId, workspaceId: payload.workspaceId, interestId: authority.interest_id,
    sourceItemId, providerKey, canonicalUrl: authority.canonical_url, title, body: sourceText,
    interest: authority.trusted_intent, quotedContext: "not_captured", availableAt: authority.published_at,
    capture: { representationVersion: "native-quote-publication.v1", availability: "complete", segments: [] },
  }, "publication-fixture") : undefined;
  if (quotePrepared !== undefined && !quotePrepared.ok) throw new Error("Quote fixture input unavailable");
  const prepared = quotePrepared?.ok ? quotePrepared.value : undefined;
  if (prepared !== undefined) input.sourceSnapshotSha256 = prepared.sourceSnapshotSha256;
  const quote = title;
  const headline = { status: "accepted" as const, kind: "claim" as const,
    text: title, binding: { candidateId: input.candidateId,
      providerKey: input.providerKey, tenantId: input.tenantId,
      workspaceId: input.workspaceId, interestId: input.interestId,
      sourceBindingId: input.sourceBindingId, sourceItemId: input.sourceItemId,
      trustedIntent: input.trustedIntent, availability: "body_present" as const,
      reviewedInputDigest: promotionPayloadDigest(JSON.stringify({
        candidateId: input.candidateId, providerKey: input.providerKey,
        context: { tenantId: input.tenantId, workspaceId: input.workspaceId,
          interestId: input.interestId, sourceBindingId: input.sourceBindingId,
          sourceItemId: input.sourceItemId, trustedIntent: input.trustedIntent,
          availability: "body_present" }, title, body: sourceText })) },
    support: [{ field: "title" as const, start: 0, end: quote.length,
      quote }], qualifications: [], confidence: 0.9,
    wholeInput: { titleLength: title.length, bodyLength: sourceText.length,
      qualificationJudgment: "none" as const } };
  const presentation = sealReaderPostPresentationV3({ input, headline });
  if (presentation.status !== "available") throw new Error("Invalid V3 fixture");
  const candidate: ReaderPostPromotionV3Candidate = { candidateId,
    providerKey: authority.provider_key, providerFamily: providerKey === "rss" ? "rss" : providerKey === "x-twitter" ? "x" : "reddit",
    sourceItemId, canonicalIdentity: authority.canonical_url,
    storyId: "story-v3", publishedAt: authority.published_at,
    assessmentId: randomUUID(), assessedAt: authority.observed_at,
    rubricVersion: prepared?.rubricVersion ?? "reader-value.v1",
    sourceSnapshotSha256: prepared?.sourceSnapshotSha256 ?? input.sourceSnapshotSha256, inputSha256: prepared?.inputSha256 ?? "2".repeat(64),
    rubricSha256: prepared?.rubricSha256 ?? "b".repeat(64), modelConfigVersion: prepared?.modelConfigVersion ?? "jev.v1",
    answers: fixtureReaderValueAnswers(), usefulness: "useful", relevance: "central",
    engagement: options.engagement ?? null, title,
    presentation: {
      status: "available" as const,
      presentationInputDigest: presentation.presentationInputDigest },
    scopeValid: true, sourceIdentityValid: true, freshnessValid: true,
    safetyValid: true, citationValid: true, blocked: false };
  await persistV3FixtureAssessment(client, candidate, {
    tenantId: payload.tenantId, workspaceId: payload.workspaceId,
    interestId: authority.interest_id, trustedIntent: authority.trusted_intent,
    title, body: sourceText }, prepared);
  let promotionV3 = selectReaderPostPromotionsV3([candidate, ...(options.peers ?? [])],
    options.context ?? { policyVersion: READER_PROMOTION_POLICY_V1 });
  if (options.diagnostics) promotionV3 = { ...promotionV3,
    diagnostics: readerPromotionDiagnostics([candidate, ...(options.peers ?? [])], promotionV3,
      new Set([candidate.candidateId, ...(options.peers ?? []).map(peer => peer.candidateId)])) };
  assert(promotionV3.outcome === "ready", "V3 fixture candidate was not admitted");
  const exactIngestionCutoff = `${candidate.publishedAt.slice(0, 10)}T10:00:00.123456Z`;
  const sourceWindow = { windowId: "v3-window",
    startedAt: new Date(payload.periodStartedAt),
    endedAt: new Date(payload.periodEndedAt),
    selectedFeedItemIds: [candidate.candidateId], storyClusterIds: [candidate.storyId],
    periodStartedAt: new Date(payload.periodStartedAt),
    periodEndedAt: new Date(payload.periodEndedAt),
    ingestionCutoff: new Date(exactIngestionCutoff), exactIngestionCutoff };
  const evidenceItem = { readerHeadline: presentation.seal.headline,
    feedItemId: candidateId, sourceItemId,
    sourceBindingId: authority.source_binding_id,
    interestId: authority.interest_id, providerKey,
    canonicalUrl: authority.canonical_url, title, bodyPreview: sourceText,
    sourceText, publishedAt: new Date(candidate.publishedAt),
    observedAt: new Date(candidate.assessedAt), score: 0, whyImportant: [],
    readerActionKind: "read_source" as const, storyKeyHint: candidate.storyId };
  const cluster = { id: candidate.storyId, storyKey: candidate.storyId,
    rankingPolicyVersion: promotionV3.policyVersion,
    representativeFeedItemId: candidateId, duplicateFeedItemIds: [],
    interestIds: [authority.interest_id], providerKeys: [providerKey], score: 0,
    observedAtRange: { startedAt: new Date(candidate.assessedAt),
      endedAt: new Date(candidate.assessedAt) }, whyImportant: [] };
  const artifactCitation = { citationId, feedItemId: candidateId, sourceItemId,
    providerKey, field: "title" as const,
    canonicalUrl: authority.canonical_url };
  const evidence: SummaryEvidenceSelection = {
    rankingPolicyVersion: promotionV3.policyVersion, sourceWindow,
    clusters: [cluster], selectedEvidence: [evidenceItem], promotionV3 };
  const draft = { headline: title, executiveSummary: sourceText,
    topStories: [{ storyClusterId: candidate.storyId, title,
      summary: sourceText, interestIds: [authority.interest_id],
      providerKeys: [providerKey], citationIds: [citationId] }],
    interestHighlights: [], repeatedSignals: [], risksAndUnknowns: sourceText.startsWith("\u001f") ? Array.from({ length: 12 }, (_, index) => ({ description: `Capture uncertainty ${index}: ${sourceText.slice(0, 63_970)}`, citationIds: [citationId], reason: "source_limit" as const })) : [],
    citationMap: [artifactCitation], qualityFlags: [],
    confidence: { level: "high" as const, score: 0.9,
      rationale: "Validated V3 fixture evidence." },
    lineage: { schemaVersion: "reader_summary.artifact.v1" as const,
      modelVersion: payload.modelVersion,
      providerVersion: "reader-summary.provider.pg-gate.v1",
      promptVersion: payload.report.promptVersion,
      rulesVersion: "reader-summary.rules.pg-gate.v1",
      evalDatasetVersion: "reader-summary.eval.pg-gate.v1",
      rankingPolicyVersion: promotionV3.policyVersion },
    usage: { inputTokens: 1, outputTokens: 1, estimatedCostUsd: 0 } };
  const draftWithContent = buildReaderSummaryDraftWithPromotionContent(evidence, draft);
  const applicationArtifact = ReaderSummaryArtifact.create({
    schemaVersion: "reader_summary.artifact.v1",
    readerSummaryId: payload.readerSummaryArtifactId,
    tenantId: tenantId(payload.tenantId), workspaceId: workspaceId(payload.workspaceId),
    scope: payload.scopeType === "workspace" ? { type: "workspace" } : { type: "interest", interestId: authority.interest_id },
    period: { cadence: "daily", startedAt: new Date(payload.periodStartedAt),
      endedAt: new Date(payload.periodEndedAt), timezone: payload.periodTimezone,
      periodKey: payload.periodKey }, generatedAt: new Date(payload.requestedAt),
    sourceWindow, storyClusters: [cluster], contextArtifacts: [],
    ...draftWithContent,
    ...buildReaderSummaryPromotionArtifactFields({
      artifactId: payload.readerSummaryArtifactId,
      modelEvidence: evidence, draft: draftWithContent }),
  });
  const artifact = serializeReaderSummaryArtifact(applicationArtifact);
  const snapshot = applicationArtifact.toSnapshot();
  payload.report.headline = snapshot.headline;
  payload.report.summaryText = snapshot.executiveSummary;
  payload.report.artifactPayload = artifact as V3ArtifactPayload;
  payload.report.citations = snapshot.citationMap;
  const view = presentReaderSummaryArtifact(applicationArtifact,
    { status: "fresh", checkedAt: new Date(payload.requestedAt) });
  const rest = readerSummaryArtifactViewFromReaderSummaryView(view);
  const card = providerKey === "rss" ? view.content.newsWithoutRatingPosts[0]
    : view.content.topReads[0];
  const attestation = view.promotionAttestations[0];
  assert(card !== undefined && attestation !== undefined &&
    validReaderDisplayRestBinding(card, attestation, view),
  "application-built V3 artifact failed the REST display binding");
  assert(attestation.ingestionCutoff === new Date(exactIngestionCutoff).toISOString() &&
    attestation.exactIngestionCutoff === exactIngestionCutoff,
  "application-shaped V3 attestation lost the exact cutoff");
  const restCard = providerKey === "rss" ? rest.readerBrief.newsWithoutRatingPosts[0]
    : rest.readerBrief.topReads[0];
  assert(restCard?.publishedAt === candidate.publishedAt &&
    restCard.title === headline.text,
  "application-built V3 artifact lost REST/client timestamp or headline parity");
  assert(!JSON.stringify({ rest, attestation }).includes(authority.trusted_intent) &&
    JSON.stringify(attestation).includes("interestDigest"),
  "SQL-read V3 public REST payload exposed private interest text");
  const reportCanonical = stableJson(payload.report);
  const reportSha256 = sha256(reportCanonical);
  payload.reportCanonical = reportCanonical;
  payload.reportSha256 = reportSha256;
  payload.exactProof.reportSha256 = reportSha256;
  const proofCanonical = stableJson(payload.exactProof);
  payload.proofCanonical = proofCanonical;
  payload.proofSha256 = sha256(proofCanonical);
  return { payload, applicationArtifact, candidate, prepared };
};
