import { ReaderSummary } from "./reader-summary";
import { ReaderSummaryPublicationPolicy } from "../policies/reader-summary-publication-policy";
import {
  artifact,
  evidenceSelection,
} from "../policies/reader-summary-publication-policy-test-fixtures";

const throughPublication = (headline: string) => {
  const evidence = evidenceSelection();
  const original = artifact().toSnapshot();
  const content = ReaderSummary.fromEvidence({
    ...original,
    headline,
    selectedEvidence: evidence.selectedEvidence,
    editorialSlate: evidence.editorialSlate,
    narrativeSections: original.content!.narrativeSections,
  }).toSnapshot();
  const candidate = artifact({ headline: content.headline, content });
  return {
    content,
    decision: new ReaderSummaryPublicationPolicy().evaluate({
      artifact: candidate,
      evidence,
    }),
  };
};

describe("reader summary headline through aggregate and publication", () => {
  it.each([
    "AI runtime quality discussion",
    "AI runtime quality discussion!",
    "AI runtime quality discussion.",
    "AI-runtime quality discussion",
    "AI  runtime quality discussion",
    "ＡＩ runtime quality discussion",
    "ai RUNTIME quality DISCUSSION",
  ])("preserves and rejects a copied model headline: %s", (headline) => {
    const { content, decision } = throughPublication(headline);
    expect(decision).toMatchObject({
      status: "rejected",
      qualityPassed: false,
      reasonCodes: ["editorial_quality"],
      reasons: [expect.stringContaining("Headline copies a top-post title")],
    });
    expect(content.headline).toBe(headline);
  });

  it("preserves and publishes a legitimate source-framed noncopy", () => {
    const headline = "A discussion weighs AI runtime quality";
    const { content, decision } = throughPublication(headline);
    expect(content.headline).toBe(headline);
    expect(decision).toMatchObject({ status: "published", qualityPassed: true });
  });

  it("keeps the neutral fallback available for a noncopy", () => {
    const { content, decision } = throughPublication(
      "Developers weigh AI runtime quality",
    );
    expect(content.headline).toBe("Discussion from monitored sources");
    expect(decision).toMatchObject({ status: "published", qualityPassed: true });
  });
});
