import { assertReaderSummaryCitationsAgainstEvidence } from
  "../../domain/entities/reader-summary-citation-evidence-validation";
import type { SummaryEvidenceSelection } from "../../domain";
import { buildReaderSummaryDraftWithPromotionContent } from
  "../../features/execute-reader-summary-job/reader-summary-promotion-content";
import {
  metricReason, modelProse, normalizeReasonDraft, rawReasonStory, reasonEvidence,
} from "./reader-summary-reason-provenance.spec-support";

const expectReason = (
  evidence: SummaryEvidenceSelection,
  stories: readonly Record<string, unknown>[],
  reason: string,
) => {
  const before = structuredClone({ evidence, stories });
  const draft = normalizeReasonDraft(evidence, stories);
  assertReaderSummaryCitationsAgainstEvidence(draft, evidence);
  const assembled = buildReaderSummaryDraftWithPromotionContent(evidence, draft);
  for (const content of [draft.content!, assembled.content]) {
    expect(content.topReads[0]?.reason).toBe(reason);
    expect(content.topReads[0]?.whyImportant[0]).toBe(reason);
    expect(content.topReads[0]?.citationIds).toEqual(["c1"]);
  }
  expect({ evidence, stories }).toEqual(before);
  return draft;
};

describe("original reader explanation provenance through model normalization", () => {
  it.each([
    { citationIds: ["c1", "outside-evidence"] },
    { citationIds: ["c1", "c1", "c1", "c1", "c1", "outside-evidence"] },
    { storyClusterId: "unknown-original-cluster" },
    { storyClusterId: undefined },
    { storyClusterId: "story-publication-2" },
    { citationIds: ["c1", "c2"] },
    { citationIds: [] },
    { citationIds: ["c2"] },
  ])("rejects the whole explanation with original invalid bindings: %j", (override) => {
    expectReason(reasonEvidence(), [rawReasonStory(override)], metricReason);
  });

  it("retains unknown original citations even after the display binding is repaired", () => {
    const draft = expectReason(reasonEvidence(), [rawReasonStory({
      citationIds: ["c1", "outside-evidence"],
    })], metricReason);
    expect(draft.topStories[0]?.citationIds).toEqual(["c1"]);
    expect(draft.topStories[0]?.readerReasonProvenance).toEqual({
      kind: "model", originalStoryClusterId: "story-publication-1",
      originalCitationIds: ["c1", "outside-evidence"], originalSummary: modelProse,
    });
  });

  it("does not salvage prose by removing a known unadmitted unclustered citation", () => {
    const evidence = reasonEvidence();
    const unclustered = {
      ...evidence, clusters: [evidence.clusters[0]!],
      sourceWindow: { ...evidence.sourceWindow, storyClusterIds: ["story-publication-1"] },
    };
    const draft = expectReason(unclustered, [rawReasonStory({ citationIds: ["c1", "c2"] })], metricReason);
    expect(draft.topStories[0]?.citationIds).toEqual(["c1"]);
    expect(draft.topStories[0]?.summary).toBe(modelProse);
  });

  const withUnadmittedSupport = (): SummaryEvidenceSelection => {
    const evidence = reasonEvidence();
    return {
      ...evidence,
      clusters: [{
        ...evidence.clusters[0]!, duplicateFeedItemIds: [evidence.selectedEvidence[1]!.feedItemId],
        providerKeys: ["reddit", "hacker-news"],
      }],
      sourceWindow: { ...evidence.sourceWindow, storyClusterIds: ["story-publication-1"] },
    };
  };

  it.each([["c1", "c2"], ["c2"]].map((citationIds) => ({ citationIds })))(
    "rejects original unadmitted support or missing lead even after coverage completion: %j",
    ({ citationIds }) => {
      const draft = expectReason(withUnadmittedSupport(), [rawReasonStory({ citationIds })], metricReason);
      expect(draft.topStories[0]?.citationIds).toEqual(["c1", "c2"]);
    },
  );

  it("preserves eligible lead prose when only normalization adds unadmitted support", () => {
    const draft = expectReason(withUnadmittedSupport(), [rawReasonStory()], modelProse);
    expect(draft.topStories[0]?.citationIds).toEqual(["c1", "c2"]);
    expect(draft.topStories[0]?.readerReasonProvenance).toMatchObject({ originalCitationIds: ["c1"] });
  });

  it.each([true, false])("keeps the complete qualified model description (slate=%s)", (slate) => {
    const base = reasonEvidence();
    const evidence = { ...base, editorialSlate: slate ? base.editorialSlate : undefined };
    const summary = modelProse + " The session logs were inspected.".repeat(150) +
      " FINAL LIMIT: this observation applies only to a deliberately warm-cache run.";
    expectReason(evidence, [rawReasonStory({ summary })], summary);
    expectReason(evidence, [rawReasonStory({ summary: undefined, description: summary })], summary);
  });

  it.each([
    [],
    [rawReasonStory({ citationIds: ["unknown"] })],
    [rawReasonStory({ storyClusterId: "story-publication-2", citationIds: ["c2"] })],
  ].map((stories) => ({ stories })))(
    "uses metrics for a synthetic truncated source preview after absent/rejected model output",
    ({ stories }) => {
      const base = reasonEvidence();
      const bodyPreview = "This agent is twice as fast across all coding workflows. However, the only experiment was";
      const sourceText = bodyPreview + " a deliberately warm-cache run, so no general speedup can be concluded.";
      const evidence = {
        ...base, selectedEvidence: base.selectedEvidence.map((item, index) =>
          index === 0 ? { ...item, bodyPreview, sourceText } : item),
      };
      const draft = expectReason(evidence, stories, metricReason);
      expect(draft.topStories[0]?.summary).toBe(bodyPreview);
      expect(draft.topStories[0]?.readerReasonProvenance).toEqual({ kind: "normalizer_fallback" });
      expect(evidence.selectedEvidence[0]?.sourceText).toBe(sourceText);
    },
  );

  it("marks absent authored summaries as synthetic and uses citation rationale without metrics", () => {
    const base = reasonEvidence();
    const evidence = {
      ...base, selectedEvidence: base.selectedEvidence.map((item) => ({
        ...item, whyImportant: ["Authoritative promotion snapshot candidate"],
      })),
    };
    const reason = "Selected with 1 cited source in this summary window.";
    const draft = expectReason(evidence, [rawReasonStory({ summary: undefined })], reason);
    expect(draft.topStories[0]?.readerReasonProvenance).toEqual({ kind: "normalizer_fallback" });
    expectReason(evidence, [], reason);
  });

  it.each(["", "Short", modelProse + " Hacker News independently confirmed this result.",
    modelProse + " token=fixture-provenance-value", modelProse + " [REDACTED]"])(
    "uses metrics when actual model text is unusable: %s", (summary) => {
      expectReason(reasonEvidence(), [rawReasonStory({ summary })], metricReason);
    },
  );

  it("ignores model-supplied provenance and fails closed if provenance is absent or text replaced", () => {
    const evidence = reasonEvidence();
    const forged = {
      kind: "model", originalStoryClusterId: "story-publication-1",
      originalCitationIds: ["c1"], originalSummary: modelProse,
    };
    expectReason(evidence, [rawReasonStory({
      citationIds: ["c1", "unknown"], readerReasonProvenance: forged,
    })], metricReason);
    const draft = normalizeReasonDraft(evidence, [rawReasonStory()]);
    for (const override of [
      { readerReasonProvenance: undefined },
      { summary: modelProse + " Added unsupported generalization." },
    ]) {
      const result = buildReaderSummaryDraftWithPromotionContent(evidence, {
        ...draft, topStories: [{ ...draft.topStories[0]!, ...override }],
      });
      expect(result.content.topReads[0]?.reason).toBe(metricReason);
    }
  });
});
