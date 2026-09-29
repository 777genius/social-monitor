import type { ReaderValueAssessmentStore,
  ReaderValueAssessment } from
  "@social-monitor/relevance/application/contracts/reader-value-assessment-store";
import type { ReaderValueAnswers, ReaderValueCriterion } from
  "@social-monitor/relevance/domain/reader-value/reader-value-assessment";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import { ReaderSummaryJob, type ReaderSummaryPreparationManifest } from
  "../../domain";
import type { SummaryEvidenceItem } from "../../domain";
import type { ReaderSummarySupplementalEvidenceSelectorPort } from "../../ports";
import { sealReaderPostPresentationV3,
  type PromotionPresentationBuilder,
  type ReaderPostPresentationV3Input } from
  "../../domain/services/reader-post-presentation-v3";
import { promotionPayloadDigest } from
  "../../domain/services/reader-post-promotion-attestation";
import { RelevanceReaderSummaryV3Promotion } from
  "./relevance-reader-summary-v3-promotion";

type Candidate = ReturnType<typeof candidate>;

export const workspaceSetup = (candidates: readonly Candidate[],
  failure?: "revoked" | "late" | "revision" | "rubric" | "interest_hash",
  presentation: PromotionPresentationBuilder = new TestPresentation()) => {
  const base = setup(candidates, new TestPresentation());
  const job = ReaderSummaryJob.rehydrate({ ...base.job.toSnapshot(),
    scope: { type: "workspace" },
    preparationCutoffAt: base.manifest.cutoffAt,
    preparationDeadlineAt: "2026-09-21T00:15:00.000000Z" });
  const readInterests: string[] = [];
  const assessments = candidates.map((value, index) => ({
    ...assessment(value), assessedAt: failure === "late" && index === 1
      ? "2026-09-21T00:15:00.000001Z" : value.assessedAt,
    input: { ...assessment(value).input,
      interestId: id(903 + index % 2), sourceRevisionKey:
        failure === "revision" && index === 1 ? "changed-revision" : "revision",
      rubricVersion: failure === "rubric" ? "reader-value.v2" : "reader-value.v1",
      interestSha256: failure === "interest_hash" ? "0".repeat(64) :
        "1".repeat(64) },
  }));
  const assessmentById = new Map(assessments.map((value) => [value.id, value]));
  const bindingByCandidateId = new Map(candidates.map((value) =>
    [value.id, value.sourceBindingId] as const));
  const manifest = { schemaVersion: "reader_summary_preparation_manifest.v2" as const,
    cutoffAt: base.manifest.cutoffAt,
    periodKey: job.toSnapshot().period.periodKey,
    interests: candidates.slice(0, 2).map((_value, index) => ({
      schemaVersion: "reader_summary_preparation_config.v1" as const,
      interestId: id(903 + index), interestSha256: "1".repeat(64),
      rubricVersion: "reader-value.v1", rubricSha256: "2".repeat(64),
      inputBuilderVersion: "input.v1", modelConfigVersion: "model.v1",
    })),
    candidates: base.manifest.candidates.map((value, index) => ({ ...value,
      interestId: id(903 + index % 2), sourceRevisionKey: "revision" })),
  };
  const subject = new RelevanceReaderSummaryV3Promotion({
    read: async (_scope, interestId, references) => {
      readInterests.push(interestId);
      return references.map((reference) => {
        const found = assessmentById.get(reference.assessmentId);
        return found?.input.interestId === interestId &&
          reference.sourceBindingId === bindingByCandidateId.get(reference.feedItemId) &&
          !(failure === "revoked" && interestId === id(904))
          ? { status: "available" as const, assessment: found }
          : { status: "unavailable" as const, assessmentId: reference.assessmentId };
      });
    },
  }, presentation, new TestSupplementalEvidenceSelector([]));
  return { job, manifest, subject, readInterests };
};

export const setup = (candidates: readonly Candidate[],
  presentation: PromotionPresentationBuilder,
  supplementalEvidence: ReaderSummarySupplementalEvidenceSelectorPort =
    new TestSupplementalEvidenceSelector([])) => {
  const assessments = candidates.map((value) => assessment(value));
  const store: Pick<ReaderValueAssessmentStore, "read"> = {
    read: async (_scope, _interest, references) => references.map((reference) => {
      const found = assessments.find((value) => value.id === reference.assessmentId)!;
      return { status: "available" as const, assessment: found };
    }),
  };
  const period = { cadence: "daily" as const,
    startedAt: new Date("2026-09-20T00:00:00.000Z"),
    endedAt: new Date("2026-09-21T00:00:00.000Z"), timezone: "UTC",
    periodKey: "daily:2026-09-20T00:00:00.000Z:2026-09-21T00:00:00.000Z:UTC" };
  const job = ReaderSummaryJob.request({ id: id(900),
    tenantId: tenantId(id(901)), workspaceId: workspaceId(id(902)),
    scope: { type: "interest", interestId: id(903) }, period,
    idempotencyKey: "v3-promotion-test", requestedAt: period.endedAt,
    selectionStrategy: "legacy_v2" }).start({ startedAt: period.endedAt });
  const manifest: ReaderSummaryPreparationManifest = {
    schemaVersion: "reader_summary_preparation_manifest.v1",
    cutoffAt: "2026-09-21T00:00:00.000000Z", interestSha256: "1".repeat(64),
    rubricSha256: "2".repeat(64), inputBuilderVersion: "input.v1",
    modelConfigVersion: "model.v1", candidates: candidates.map((value) => ({
      candidateId: value.id, sourceBindingId: value.sourceBindingId,
      providerKey: value.provider, sourceItemId: value.sourceItemId,
      sourceRevisionKey: `revision-${value.id}`,
      sourceSnapshotSha256: value.sourceSnapshotSha256,
      assessmentId: value.assessmentId, inputSha256: value.inputSha256,
      publishedAt: value.publishedAt, observedAt: value.observedAt,
      sourceKind: "article", canonicalIdentity: value.canonicalIdentity,
      storyId: value.storyId,
    })) };
  return { subject: new RelevanceReaderSummaryV3Promotion(
    store, presentation, supplementalEvidence),
    job, manifest };
};

export class TestSupplementalEvidenceSelector implements
ReaderSummarySupplementalEvidenceSelectorPort {
  readonly calls: Parameters<ReaderSummarySupplementalEvidenceSelectorPort[
    "selectSupplemental"
  ]>[0][] = [];

  constructor(private readonly evidence: readonly SummaryEvidenceItem[]) {}

  async selectSupplemental(
    params: Parameters<ReaderSummarySupplementalEvidenceSelectorPort[
      "selectSupplemental"
    ]>[0],
  ): Promise<readonly SummaryEvidenceItem[]> {
    this.calls.push(params);
    return this.evidence;
  }
}

export class TestPresentation implements PromotionPresentationBuilder {
  attempted = 0;
  readonly batches: string[][] = [];
  constructor(private readonly unavailable = new Set<string>()) {}
  async build(inputs: readonly ReaderPostPresentationV3Input[]) {
    this.attempted += inputs.length;
    this.batches.push(inputs.map((input) => input.candidateId));
    return inputs.map((input) => {
      if (this.unavailable.has(input.candidateId)) {
        return { status: "unavailable" as const,
          reason: "insufficient_support" as const };
      }
      return sealReaderPostPresentationV3({ input, headline: {
        status: "accepted", kind: "claim", text: `Useful method ${input.candidateId.slice(-2)}`,
        binding: { candidateId: input.candidateId, providerKey: input.providerKey,
          tenantId: input.tenantId, workspaceId: input.workspaceId,
          interestId: input.interestId, sourceBindingId: input.sourceBindingId,
          sourceItemId: input.sourceItemId, trustedIntent: input.trustedIntent,
          availability: "body_present", reviewedInputDigest: promotionPayloadDigest(
            JSON.stringify({ candidateId: input.candidateId,
              providerKey: input.providerKey, context: { tenantId: input.tenantId,
                workspaceId: input.workspaceId, interestId: input.interestId,
                sourceBindingId: input.sourceBindingId,
                sourceItemId: input.sourceItemId,
                trustedIntent: input.trustedIntent, availability: "body_present" },
              title: input.title, body: input.body })) },
        support: [{ field: "bodyPreview", start: 0, end: 12,
          quote: input.body.slice(0, 12) }], qualifications: [], confidence: 0.9,
        wholeInput: { titleLength: input.title.length, bodyLength: input.body.length,
          qualificationJudgment: "none" },
      } });
    });
  }
}

export const candidate = (ordinal: number,
  usefulness: ReaderValueAnswers["usefulness"]["choice"],
  relevance: ReaderValueAnswers["relevance"]["choice"],
  storyId: string | undefined = `story-${ordinal}`) => ({ id: id(ordinal), assessmentId: id(ordinal + 100),
  sourceItemId: id(ordinal + 200), sourceBindingId: id(ordinal + 300),
  provider: ordinal % 2 === 0 ? "reddit" : "rss",
  canonicalIdentity: `https://example.test/${ordinal}`,
  ...(storyId === undefined ? {} : { storyId }),
  publishedAt: `2026-09-20T00:00:${String(ordinal).padStart(2, "0")}.000001Z`,
  observedAt: `2026-09-20T00:01:${String(ordinal).padStart(2, "0")}.000001Z`,
  sourceSnapshotSha256: ordinal.toString(16).padStart(64, "0"),
  inputSha256: (ordinal + 1).toString(16).padStart(64, "0"),
  assessedAt: "2026-09-20T00:10:00.000001Z",
  title: `Title ${id(ordinal)}`,
  body: "Useful body text with exact evidence.",
  usefulness, relevance });

const assessment = (value: Candidate): ReaderValueAssessment => ({
  id: value.assessmentId, state: "assessed", attempts: 1, leaseToken: null,
  leaseUntil: null, assessedAt: value.assessedAt,
  answers: answers(value.usefulness, value.relevance), usageUnknown: false,
  costUsd: 0.001, errorCode: null,
  input: { tenantId: id(901), workspaceId: id(902), interestId: id(903),
    sourceItemId: value.sourceItemId, sourceRevisionKey: "revision",
    sourceSnapshotSha256: value.sourceSnapshotSha256,
    interestSha256: "1".repeat(64), rubricVersion: "reader-value.v1",
    rubricSha256: "2".repeat(64), inputBuilderVersion: "input.v1",
    modelConfigVersion: "model.v1", inputSha256: value.inputSha256,
    requestSha256: "3".repeat(64), requestedModel: "jev", requestBody: "{}",
    snapshot: { sourceSnapshotSha256: value.sourceSnapshotSha256,
      interestSha256: "1".repeat(64), sanitizedTextSha256: "4".repeat(64),
      title: value.title, body: value.body,
      interest: "testing", capture: { representationVersion: "capture.v1",
        availability: "complete", segments: [] },
      availableAt: "2026-09-20T00:00:00.000001Z",
      originalTitleLength: 42, originalBodyLength: value.body.length,
      retainedSnapshotTruncated: false, safety: "allowed" } },
});

const answers = (usefulness: ReaderValueAnswers["usefulness"]["choice"],
  relevance: ReaderValueAnswers["relevance"]["choice"]): ReaderValueAnswers => ({
  usefulness: answer("usefulness", usefulness), relevance: answer("relevance", relevance),
  context_sufficiency: answer("context_sufficiency", "sufficient"),
  evidence_basis: answer("evidence_basis", "observation"),
});

const labels = { usefulness: ["noise", "context", "useful", "important", "insufficient_context"],
  relevance: ["unrelated", "adjacent", "relevant", "central", "insufficient_context"],
  context_sufficiency: ["insufficient", "partial", "sufficient"],
  evidence_basis: ["observation", "described_data", "linked_claim", "unsupported_claim", "no_claim", "insufficient_context"] } as const;
const answer = <K extends ReaderValueCriterion>(criterion: K,
  choice: ReaderValueAnswers[K]["choice"]): ReaderValueAnswers[K] => {
  const values = labels[criterion] as readonly string[];
  return { choice, probabilities: Object.fromEntries(values.map((value) =>
    [value, value === choice ? 1 : 0])), confidence: 0.9,
  choiceDiffersFromArgmax: false, probabilityTie: false } as ReaderValueAnswers[K];
};

export const id = (ordinal: number): string =>
  `00000000-0000-4000-8000-${String(ordinal).padStart(12, "0")}`;

export const githubEvidence = (rank: number): SummaryEvidenceItem => ({
  feedItemId: id(500 + rank), sourceItemId: `github-source-${rank}`,
  sourceBindingId: "github-binding", interestId: id(903),
  providerKey: "github-trending-page", providerName: "GitHub Trending",
  canonicalUrl: `https://github.com/example/repository-${rank}`,
  title: `Repository ${rank}`, bodyPreview: `Trending repository ${rank}`,
  publishedAt: new Date("2026-09-20T18:00:00.000Z"),
  observedAt: new Date("2026-09-20T18:05:00.000Z"),
  score: 1, whyImportant: ["Eligible frozen GitHub projection"],
  providerMetricLabels: [{ label: "GitHub Trending Today",
    value: `#${rank} · +${2_000 - rank} stars today` }],
  readerActionKind: "watch_repository",
});
