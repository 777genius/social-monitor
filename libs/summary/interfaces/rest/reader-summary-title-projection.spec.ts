import { projectPublicTitles } from "./reader-summary-title-projection.spec-support";
import { readerSummaryArtifactViewFromReaderSummaryView } from "./reader-summary-rest.mapper";
import {
  buildReaderPostPromotionTitle,
  hasReaderFacingPromotionSource,
  isFaithfulReaderSourcePresentation,
  readerPostAvailableSourceText,
} from "../../domain/services/reader-post-promotion-title";
import { readerPostPromotionEvidenceInput } from "../../domain/services/reader-post-promotion-evidence-input";
import { buildTopReadTitle, evidenceReaderTitle } from "../../domain/services/reader-summary-top-read-title";

describe("Reader Promotion V2 title projection to public Top and posts", () => {
  it.each([[119, 5268], [73, 4642], [91, 3254]])(
    "keeps a %i-character headline separate from %i characters of body evidence",
    (titleLength, bodyLength) => {
      // Same dimensions as the protected Sept 8 examples, with synthetic text.
      const title = "Source headline ".padEnd(titleLength, "t");
      const body = "Context and qualifications. ".repeat(250).slice(0, bodyLength);
      const { response, projection, evidence } = projectPublicTitles(title, body);
      expect(response.readerBrief.topReads).toHaveLength(1);
      expect(response.readerBrief.selectedPosts).toHaveLength(1);
      const cards = [...response.readerBrief.topReads, ...response.readerBrief.selectedPosts];
      cards.forEach((card, index) => {
        const item = evidence[index]!;
        expect(card.title).toBe(title);
        expect(card.title).not.toContain(body);
        expect(card.canonicalUrl).toBe(item.canonicalUrl);
        expect(card.providerKey).toBe(item.providerKey);
        expect(card.promotionAttestation?.candidateId).toBe(item.feedItemId);
        expect(card.promotionAttestation?.canonicalIdentity)
          .toBe(item.promotionFacts!.canonicalIdentity);
        expect(projection.admittedEvidence[index]).toBe(item);
        expect(item.sourceText).toBe(body);
        expect(item.bodyPreview).toBe(body.slice(0, 280));
        expect(isFaithfulReaderSourcePresentation(card, [item])).toBe(true);
        expect(isFaithfulReaderSourcePresentation({ ...card, title: `${title}\n\n${body}` }, [item]))
          .toBe(false);
        expect(response.citations.find((citation) => citation.feedItemId === item.feedItemId)?.sourceItemId)
          .toBe(item.sourceItemId);
      });
    },
  );

  it.each([
    ["Ordinary source headline", "Separate body with a qualification."],
    ["Ordinary source headline", ""],
    ["Headline with\n\nintentional paragraph break", "Separate body."],
    ["A legitimate long headline ".repeat(300), "Separate body."],
    ["A title mentioning body words", "body words"],
  ])("preserves legitimate source title structure", (title, body) => {
    const { response, evidence } = projectPublicTitles(title, body);
    const expected = title.trim();
    expect(response.readerBrief.topReads[0]?.title).toBe(expected);
    expect(response.readerBrief.selectedPosts[0]?.title).toBe(expected);
    expect(evidenceReaderTitle(evidence[0]!)).toBe(expected);
    expect(buildTopReadTitle({ primaryEvidence: evidence[0], evidence,
      storyTitle: "Generated claim", storySummary: "Generated prose" })).toBe(expected);
  });

  it("uses available body for a missing title without borrowing generated prose", () => {
    const body = "The source has no headline. Its qualification must remain intact.";
    const { response } = projectPublicTitles("  ", body);
    expect(response.readerBrief.topReads[0]?.title).toBe(body);
    expect(response.readerBrief.selectedPosts[0]?.title).toBe(body);
  });

  it("keeps content availability and promotion input facts independent of title projection", () => {
    const { evidence } = projectPublicTitles("Source headline", "Separate body evidence.");
    const item = { ...evidence[0]!, whyImportant: [] };
    const { sourceWindow } = projectPublicTitles(item.title, item.sourceText!).view;
    const window = {
      windowId: sourceWindow.windowId,
      startedAt: new Date(sourceWindow.startedAt), endedAt: new Date(sourceWindow.endedAt),
      selectedFeedItemIds: [item.feedItemId], storyClusterIds: [],
    };
    expect(readerPostPromotionEvidenceInput(item, window, "citation", true).whyImportant)
      .toBe(readerPostAvailableSourceText(item));
    expect(hasReaderFacingPromotionSource(item)).toBe(true);
    const missing = { ...item, title: "", bodyPreview: "", sourceText: "" };
    expect(buildReaderPostPromotionTitle({ lead: missing })).toBe("");
    expect(hasReaderFacingPromotionSource(missing)).toBe(false);
    expect(isFaithfulReaderSourcePresentation(missing, [missing])).toBe(false);
    expect(hasReaderFacingPromotionSource({ ...item, sourceText: "Check this out!" })).toBe(false);
  });

  it.each(["x", "x-twitter", "twitter"])("retains %s full post semantics without repeating its preview", (providerKey) => {
    const body = "A source post begins here. ".repeat(30) + "The preceding claim is retracted.";
    const { evidence } = projectPublicTitles("Source headline", body);
    const item = { ...evidence[0]!, providerKey,
      title: `X post by @fixture: ${body.slice(0, 100)}...` };
    expect(buildReaderPostPromotionTitle({ lead: item })).toBe(body);
    expect(buildReaderPostPromotionTitle({ lead: { ...item, title: "Simulation only." } }))
      .toBe(`Simulation only.\n\n${body}`);
  });

  it("still rejects forged source identity at the public mapper", () => {
    const { view } = projectPublicTitles("Source headline", "Separate body evidence.");
    expect(() => readerSummaryArtifactViewFromReaderSummaryView({
      ...view,
      content: { ...view.content, topReads: [{ ...view.content.topReads[0]!,
        canonicalUrl: "https://example.test/unrelated" }] },
    })).toThrow("promotion board is invalid");
  });
});
