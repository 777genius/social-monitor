import type {
  ReaderValueAnswers,
  ReaderValueCriterion,
} from "@social-monitor/relevance/domain/reader-value/reader-value-assessment";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import {
  buildReaderSummaryCoveragePlan,
  selectReaderPostPromotionsV3,
  type ReaderPostPromotionV3Candidate,
  type SummaryEvidenceSelection,
} from "../../domain";
import { evidenceSelection } from
  "../../domain/policies/reader-summary-publication-evidence-test-fixtures";
import { buildReaderSummaryDraftWithPromotionContent } from
  "../../features/execute-reader-summary-job/reader-summary-promotion-content";
import type { ReaderSummaryModelInput } from "../../ports";
import { acceptedFixtureReaderHeadline } from
  "../../test-fixtures/accepted-reader-headline";
import { OpenAiResponsesReaderSummaryModelAdapter } from
  "./openai-responses-reader-summary-model.adapter";
import { jsonResponse } from "./reader-summary-model-promotion.spec-support";

const tenant = tenantId("tenant-reader-summary-publication");
const workspace = workspaceId("workspace-reader-summary-publication");
const candidateId = "00000000-0000-4000-8000-000000000101";
const storyId = "story-publication-v3";
const generatedHeadline = "AI runtime quality discussion";
const generatedNarrative =
  "Generated narrative survives publication normalization.";

describe("OpenAI reader summary publication normalization", () => {
  it("keeps an admitted V3 model headline and narrative through publication content rebuilding", async () => {
    const evidence = v3EvidenceSelection();
    const draft = await generateDraft(evidence);
    const publicationDraft = buildReaderSummaryDraftWithPromotionContent(
      evidence,
      draft,
    );

    expect(draft.content).toMatchObject({
      headline: generatedHeadline,
      narrativeSections: [
        expect.objectContaining({
          kind: "lead",
          text: generatedNarrative,
          citationIds: ["c1"],
        }),
      ],
      qualityState: expect.objectContaining({ status: "limited_sources" }),
    });
    expect(publicationDraft.content).toMatchObject({
      headline: generatedHeadline,
      narrativeSections: [
        expect.objectContaining({ text: generatedNarrative }),
      ],
      topReads: [
        expect.objectContaining({
          promotionCandidateId: candidateId,
          promotionPolicyVersion: "reader_post_promotion.v3",
          matchedRules: [
            "reader-value:usefulness:useful",
            "reader-value:relevance:central",
          ],
        }),
      ],
    });
  });

  it("keeps the default legacy_v2 model headline and narrative behavior", async () => {
    const evidence = evidenceSelection();
    const draft = await generateDraft(evidence);
    const publicationDraft = buildReaderSummaryDraftWithPromotionContent(
      evidence,
      draft,
    );

    expect(evidence.promotionV3).toBeUndefined();
    expect(draft.content).toMatchObject({
      headline: generatedHeadline,
      narrativeSections: [
        expect.objectContaining({ text: generatedNarrative }),
      ],
      qualityState: expect.objectContaining({ status: "limited_sources" }),
    });
    expect(publicationDraft.content.headline).toBe(generatedHeadline);
    expect(publicationDraft.content.narrativeSections).toEqual(
      draft.content?.narrativeSections,
    );
  });
});

const generateDraft = async (evidence: SummaryEvidenceSelection) => {
  const input = modelInput(evidence);
  const adapter = new OpenAiResponsesReaderSummaryModelAdapter({
    apiKey: "test-openai-key",
    fetchFn: async () => jsonResponse({
      output_text: JSON.stringify({
        headline: generatedHeadline,
        executiveSummary: generatedNarrative,
        narrativeSections: [{
          kind: "lead",
          title: generatedHeadline,
          text: generatedNarrative,
          storyClusterId: evidence.clusters[0]!.id,
          citationIds: ["c1"],
        }],
        topStories: [{
          storyClusterId: evidence.clusters[0]!.id,
          title: generatedHeadline,
          summary: generatedNarrative,
          interestIds: [evidence.selectedEvidence[0]!.interestId],
          providerKeys: [evidence.selectedEvidence[0]!.providerKey],
          citationIds: ["c1"],
        }],
        interestHighlights: [],
        repeatedSignals: [],
        risksAndUnknowns: [],
        citationMap: [{
          citationId: "c1",
          feedItemId: evidence.selectedEvidence[0]!.feedItemId,
          sourceItemId: evidence.selectedEvidence[0]!.sourceItemId,
          providerKey: evidence.selectedEvidence[0]!.providerKey,
          field: "title",
        }],
        qualityFlags: [],
        confidence: {
          level: "high",
          score: 0.9,
          rationale: "The selected evidence supports the generated copy.",
        },
        noSignalReason: null,
      }),
    }),
  });
  const route = adapter.route(input, {
    preferredProvider: "openai-responses",
    maxInputTokens: 24_000,
    maxOutputTokens: 4_000,
    maxEstimatedCostUsd: 1,
  }, {
    remainingTokens: 32_000,
    remainingCostUsd: 2,
  });

  return (await adapter.generate(input, route)).draft;
};

const modelInput = (
  evidence: SummaryEvidenceSelection,
): ReaderSummaryModelInput => ({
  tenantId: tenant,
  workspaceId: workspace,
  scope: { type: "workspace" },
  period: {
    cadence: "daily",
    startedAt: evidence.sourceWindow.periodStartedAt!,
    endedAt: evidence.sourceWindow.periodEndedAt!,
    timezone: "UTC",
    periodKey: "daily:2026-07-05:UTC",
  },
  evidence,
  coveragePlan: buildReaderSummaryCoveragePlan(evidence),
  contextArtifacts: [],
  policy: {
    language: "en",
    format: "executive_brief",
    tone: "analytical",
    maxStories: 8,
    includeRisks: true,
    includeInterestHighlights: true,
    includeRepeatedSignals: true,
    dedupeStrategy: "canonical_url_then_title",
    rulesVersion: "reader_summary.rules.test.v1",
  },
  requestedAt: evidence.sourceWindow.endedAt,
});

const v3EvidenceSelection = (): SummaryEvidenceSelection => {
  const legacy = evidenceSelection();
  const original = legacy.selectedEvidence[0]!;
  const evidence = acceptedFixtureReaderHeadline({
    ...original,
    feedItemId: candidateId,
    promotionFacts: undefined,
  }, { tenantId: tenant, workspaceId: workspace });
  const candidate: ReaderPostPromotionV3Candidate = {
    candidateId,
    providerKey: evidence.providerKey,
    providerFamily: "reddit",
    sourceItemId: evidence.sourceItemId,
    canonicalIdentity: evidence.canonicalUrl,
    storyId,
    publishedAt: "2026-07-05T08:00:00.000001Z",
    assessmentId: "00000000-0000-4000-8000-000000000102",
    assessedAt: "2026-07-05T08:30:00.000001Z",
    rubricVersion: "reader-value.v1",
    sourceSnapshotSha256: "a".repeat(64),
    inputSha256: "b".repeat(64),
    rubricSha256: "c".repeat(64),
    modelConfigVersion: "jev.v1",
    answers: admittedAnswers(),
    presentation: {
      status: "available",
      presentationInputDigest: "d".repeat(64),
    },
    scopeValid: true,
    sourceIdentityValid: true,
    freshnessValid: true,
    safetyValid: true,
    citationValid: true,
    blocked: false,
  };

  return {
    rankingPolicyVersion: "reader_promotion_policy.v3",
    sourceWindow: {
      ...legacy.sourceWindow,
      selectedFeedItemIds: [candidateId],
      storyClusterIds: [storyId],
    },
    clusters: [{
      ...legacy.clusters[0]!,
      id: storyId,
      storyKey: storyId,
      representativeFeedItemId: candidateId,
      rankingPolicyVersion: "reader_promotion_policy.v3",
    }],
    selectedEvidence: [evidence],
    promotionV3: selectReaderPostPromotionsV3([candidate]),
  };
};

const admittedAnswers = (): ReaderValueAnswers => ({
  usefulness: answer("usefulness", "useful"),
  relevance: answer("relevance", "central"),
  context_sufficiency: answer("context_sufficiency", "sufficient"),
  evidence_basis: answer("evidence_basis", "observation"),
});

const answer = <K extends ReaderValueCriterion>(
  criterion: K,
  choice: ReaderValueAnswers[K]["choice"],
): ReaderValueAnswers[K] => ({
  choice,
  probabilities: { [choice]: 1 },
  confidence: 0.9,
  choiceDiffersFromArgmax: false,
  probabilityTie: false,
}) as ReaderValueAnswers[K];
