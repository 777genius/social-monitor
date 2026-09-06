import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";
import { buildTopReadTitle } from "./reader-summary-top-read-title";
import { buildReaderPostPromotionTitle, hasReaderFacingPromotionTitle } from
  "./reader-post-promotion-title";
import { isUnpolishedReaderTitle } from
  "../policies/reader-summary-reader-facing-text-policy";

describe("reader summary top read title", () => {
  const longContext = "Atlas documents agent safety findings across public websites and proposes reporting standards for misalignment incidents and model properties.";
  describe.each(["summary", "preview"])("%s available source context", (path) => {
    const itemFor = (body: string): SummaryEvidenceItem => evidence({
      title: path === "summary" ? body : `X post by @lab: ${body.slice(0, 100)}...`,
      bodyPreview: body,
    });

    it.each([
      "The following claim about automatic agent writes on public websites is false and must not be treated as an announcement of actual product behavior.",
      "The following account of automatic agent writes on public websites remains uncertain and needs independent confirmation before anyone treats it as product behavior.",
      "Researchers have not confirmed the following claim about automatic agent writes across public websites despite repeated requests for supporting evidence.",
      "Imagine a hypothetical product announcement about automatic agent writes across public websites after a future change to the current approval policy.",
      "Could the following statement about automatic agent writes across public websites become true after a future change to the current approval policy?",
    ])("retains the context governing a later claim: %s", (prefix) => {
      const item = itemFor(`${prefix} Atlas enables automatic agent writes.`);
      expect(buildReaderPostPromotionTitle({ lead: item }))
        .toBe(item.bodyPreview);
      expect(hasReaderFacingPromotionTitle(item)).toBe(true);
    });

    it.each(["Dr. Smith", "Prof. Jones", "J. R. Smith", "U.S. operators"])(
      "preserves the complete approval requirement containing %s",
      (approver) => {
        const claim = `Atlas requires approval from ${approver} before enabling automatic writes`;
        const item = itemFor(`${longContext} ${claim}.`);
        expect(buildReaderPostPromotionTitle({ lead: item })).toBe(item.bodyPreview);
        expect(hasReaderFacingPromotionTitle(item)).toBe(true);
      },
    );

    it("retains source context in a different script", () => {
      const item = itemFor(`${longContext} Атлас отключил автоматическую запись.`);
      expect(hasReaderFacingPromotionTitle(item)).toBe(true);
    });

    it("preserves both scripts in sentence order", () => {
      const claim = "Atlas documents agent failures in public incident reports";
      const item = itemFor(`${longContext} Атлас отключил автоматическую запись. ${claim}.`);
      expect(buildReaderPostPromotionTitle({ lead: item })).toBe(item.bodyPreview);
    });

    it("retains negation within the recovered sentence", () => {
      const claim = "Atlas does not enable automatic agent writes";
      expect(buildReaderPostPromotionTitle({ lead: itemFor(`${longContext} ${claim}.`) }))
        .toBe(`${longContext} ${claim}.`);
    });

    it("does not discard a subsequent qualification", () => {
      const item = itemFor(`${longContext} Atlas enables automatic agent writes. That claim is false.`);
      expect(hasReaderFacingPromotionTitle(item)).toBe(true);
    });

    it("preserves the reported approval bypass and its retraction", () => {
      const item = itemFor(`${longContext} Atlas bypasses human approval. That claim has been retracted.`);
      expect(buildReaderPostPromotionTitle({ lead: item }))
        .toBe(item.bodyPreview);
      expect(hasReaderFacingPromotionTitle(item)).toBe(true);
    });

    describe.each(["before", "after"])("walk-back context %s the candidate", (position) => {
      it.each([
        "We walked it back.",
        "We walked Dr. Smith's announcement back.",
        "We walked J. Smith's announcement back.",
        "We walked version 2.0 back.",
        "We walked outdoors. back at camp, teams shared dinner.",
        "We have walked that back.",
        "We walk it back.",
        "Our editorial team walks it back in the detailed publication about automatic agent writes across public websites and mandatory human approval requirements.",
        "We are walking this back.",
        "We walked those statements back.",
        "We walked our earlier published statements back.",
        "We walked our earlier widely circulated statements back.",
        "We walked our earlier public-facing statements back.",
        "We walked our earlier—public-facing, widely circulated—statements back.",
        ...[5, 10, 30].flatMap((length) =>
          ["walk", "walks", "walked", "walking"].map((verb) =>
            `We ${verb} ${"published ".repeat(length)}back.`,
          ),
        ),
        "We walked our visitors along winding woodland paths back to camp.",
        "We walked them back.",
        "We walked everything back.",
        "We walked back.",
        "We have walked-back earlier coverage.",
        "We are walking-back earlier coverage.",
        "Editorial coverage was walked-back in the detailed publication about automatic agent writes across public websites and mandatory human approval requirements.",
      ])("preserves all source context across %s", (context) => {
        const claim = "Atlas bypasses human approval.";
        const body = position === "before"
          ? `${longContext} ${context} ${claim}`
          : `${longContext} ${claim} ${context}`;
        const item = itemFor(body);
        expect(buildReaderPostPromotionTitle({ lead: item }))
          .toBe(item.bodyPreview);
        expect(hasReaderFacingPromotionTitle(item)).toBe(true);
      });
    });

    describe.each(["before", "after"])("omitted context %s the candidate", (position) => {
      it.each([
        "Editors retracted earlier coverage.",
        "Editors issued a retraction.",
        "Researchers withdrew earlier coverage.",
        "Earlier coverage has been withdrawn.",
        "Editors announced a withdrawal.",
        "Editors corrected earlier coverage.",
        "Editors issued a correction.",
        "Researchers denied earlier coverage.",
        "Researchers issued a denial.",
        "Editors recanted earlier coverage.",
        "Editors rescinded earlier coverage.",
        "Editors walked back earlier coverage.",
        "This claim needs context.",
        "That assertion needs context.",
        "The statement needs context.",
        "That finding needs context.",
        "These conclusions need context.",
        "Those allegations need context.",
        "Reviewers are revisiting the account.",
        "Reviewers are revisiting this report.",
        "Reviewers are revisiting that claim.",
      ])("preserves source context across %s", (context) => {
        const claim = "Atlas bypasses human approval.";
        // Long governing context must remain intact, in either direction.
        const omitted = `${context.slice(0, -1)} in the detailed publication about automatic agent writes across public websites and mandatory human approval requirements.`;
        const body = position === "before"
          ? `${longContext} ${omitted} ${claim}`
          : `${longContext} ${claim} ${omitted}`;
        const item = itemFor(body);
        expect(buildReaderPostPromotionTitle({ lead: item }))
          .toBe(item.bodyPreview);
        expect(hasReaderFacingPromotionTitle(item)).toBe(true);
      });
    });

    it.each([
      "Atlas retracted claims of automatic agent writes",
      "Atlas withdrew claims of automatic agent writes",
      "Atlas corrected claims of automatic agent writes",
      "Atlas denies bypassing human approval",
      "Atlas does not bypass human approval",
    ])("retains a self-contained correction: %s", (claim) => {
      const item = itemFor(`${longContext} ${claim}.`);
      expect(buildReaderPostPromotionTitle({ lead: item })).toBe(item.bodyPreview);
      expect(hasReaderFacingPromotionTitle(item)).toBe(true);
    });

    it("retains motion and its conflicting contextual statement", () => {
      const item = itemFor(`${longContext} Atlas is moving toward the operator. Atlas is not going anywhere.`);
      expect(buildReaderPostPromotionTitle({ lead: item }))
        .toBe(item.bodyPreview);
    });

    it.each([
      "Neither assertion about automatic agent writes across public websites and bypassing required human approval reflects actual product behavior. Atlas enables automatic agent writes. Atlas bypasses human approval.",
      `${longContext} Atlas enables automatic agent writes. Atlas bypasses human approval. Neither assertion is true.`,
      `${longContext} Atlas enables automatic agent writes. Nor is the assertion about bypassing approval true.`,
      `${longContext} Atlas enables automatic agent writes. None of these assertions is true.`,
      ...["denying", "denial", "refuted", "debunked", "disproved"].map((form) =>
        `Researchers documented ${form} claims about automatic agent writes across public websites and bypassing required human approval in a detailed safety report. Atlas enables automatic agent writes.`),
      ...["denied", "refuted", "debunked", "disproved"].map((form) =>
        `${longContext} Atlas enables automatic agent writes. Both assertions were ${form}.`),
    ])("retains contextual negation: %s", (body) => {
      const item = itemFor(body);
      expect(buildReaderPostPromotionTitle({ lead: item }))
        .toBe(item.bodyPreview);
      expect(hasReaderFacingPromotionTitle(item)).toBe(true);
    });

    it.each([
      "Atlas enables neither automatic writes nor approval bypasses",
      "Neither Atlas nor Beacon enables automatic writes",
      "Atlas denies enabling automatic agent writes",
      "Atlas refuted claims of automatic agent writes",
      "Atlas debunked claims of automatic agent writes",
      "Atlas disproved claims of automatic agent writes",
    ])("retains explicit negation in a self-contained candidate: %s", (claim) => {
      const item = itemFor(`${longContext} ${claim}.`);
      expect(buildReaderPostPromotionTitle({ lead: item })).toBe(item.bodyPreview);
      expect(hasReaderFacingPromotionTitle(item)).toBe(true);
    });

    it.each([
      "neither assertion is true.",
      "nor is the assertion true.",
      "that claim is false.",
      "beacon is not the core of the product.",
      "beacon is not going anywhere, but the assertion is false.",
      "it is not going anywhere.",
    ])("keeps qualifications in newly recovered lowercase prose: %s", (qualification) => {
      // Exercise both the long-preview and short-teaser source forms.
      const context = path === "preview" ? `${longContext} ` : "";
      const body = `check this out! you can get some amazing things done. ${context}beacon is the core of our new work product and what makes it so good. ${qualification}`;
      const item = itemFor(body);
      const title = buildReaderPostPromotionTitle({ lead: item });
      expect(title).not.toBe("Beacon is the core of our new work product and what makes it so good");
      if (hasReaderFacingPromotionTitle(item)) {
        expect(title.toLowerCase()).toContain(qualification.replace(/\.$/u, ""));
      }
    });
  });

  it.each(["codex", "beacon"])("preserves preview teaser context for %s", (product) => {
    const claim = `${product} is the core of our new work product and what makes it so good`;
    const body = `check this out! you can get some amazing things done. ${claim}. ${product} is not going anywhere.`;
    const item = evidence({ title: `${body.slice(0, 100)}...`, bodyPreview: body });
    expect(buildReaderPostPromotionTitle({ lead: item }))
      .toBe(body);
  });

  it("preserves the retraction after the first substantive sentence", () => {
    const body = "Check this out! Atlas bypasses human approval. That claim has been retracted.";
    const item = evidence({ title: `${body.slice(0, 40)}...`, bodyPreview: body });
    expect(buildReaderPostPromotionTitle({ lead: item }))
      .toBe(body);
  });

  it("rejects a model summary without available primary source", () => {
    const body = "check this out! you can get some amazing things done. codex is the core of our new work product and what makes it so good. codex is not going anywhere.";
    expect(buildTopReadTitle({
      storyTitle: "Check this out!", storySummary: body,
      primaryEvidence: undefined, evidence: [],
    })).toBe("");
  });

  it("does not extend legacy preview skipping beyond the first substantive index", () => {
    const claim = "codex is the core of our new work product and what makes it so good";
    const body = `check this out! you can get some amazing things done. ${longContext} ${claim}. codex is not going anywhere.`;
    const item = evidence({ title: `${body.slice(0, 100)}...`, bodyPreview: body });
    expect(buildReaderPostPromotionTitle({ lead: item }))
      .toBe(body);
  });

  it.each([118, 119, 120, 139, 140, 141])(
    "separates concise styling from source presentation at %i characters without clipping clauses",
    (length) => {
      const prefix = "Atlas publishes detailed agent safety findings for ";
      const sentence = prefix + "x".repeat(length - prefix.length);
      const next = "Atlas documents agent failures in public incident reports";
      const item = evidence({
        title: `X post by @lab: ${sentence}...`,
        bodyPreview: `${sentence}. ${next}.`,
      });

      expect(isUnpolishedReaderTitle(sentence)).toBe(length >= 120);
      expect(buildReaderPostPromotionTitle({ lead: item }))
        .toBe(`${sentence}. ${next}.`);
      expect(hasReaderFacingPromotionTitle(item)).toBe(true);
    },
  );

  it.each(["full", "truncated"])("preserves all available context from the reported incident discussion (%s)", (kind) => {
    const body = "How we think about the “wiki incident,” where our agents wrote to several internet sites: it’s past time for us to define standards for when and how we share misalignment incidents, not just misalignment properties of our models. Historically, we have treated misalignment largely as a research question, which gets communicated in research publications such as systems cards. This year, we’ve started to see misalignment cause new types of real-world impact.";
    const item = evidence({
      title: kind === "full" ? body : `${body.slice(0, 100)}...`,
      bodyPreview: body,
    });
    expect(buildReaderPostPromotionTitle({ lead: item })).toBe(
      body,
    );
    expect(hasReaderFacingPromotionTitle(item)).toBe(true);
  });

  it.each(["", "...", "…"])("preserves an unfinished preview without claiming it is complete (%s)", (ending) => {
    const first = "Atlas documents agent safety findings across public websites and proposes reporting standards for misalignment incidents and model properties";
    const body = `${first}. Atlas allows automatic writes only after${ending}`;
    const item = evidence({
      title: `X post by @lab: ${first}...`,
      bodyPreview: body,
    });
    expect(hasReaderFacingPromotionTitle(item)).toBe(true);
  });

  it.each([
    "Current AI product discussion",
    "Here we go again!",
    "I am thinking about agent safety",
    "Check this out!",
    "Atlas enables automatic agent writes, but only after operators review every proposed change and explicitly approve the destination site",
    "Atlas enables automatic agent writes; the feature remains disabled unless operators review every change and explicitly approve the destination site",
    "Atlas enables automatic agent writes: only after operators review every proposed change and explicitly approve the destination site",
  ])("rejects filler but preserves substantive conversational or qualified sources: %s", (body) => {
    const item = evidence({ title: body, bodyPreview: body });
    if (["Current AI product discussion", "Here we go again!", "Check this out!"].includes(body)) {
      expect(hasReaderFacingPromotionTitle(item)).toBe(false);
    } else {
      expect(buildReaderPostPromotionTitle({ lead: item })).toBe(body);
    }
  });

  it("does not drop an unverified breaking qualifier to fit a later sentence", () => {
    const body = "BREAKING: Atlas allegedly plans automatic agent writes across many public sites without operator review or explicit destination approval. Atlas enables automatic agent writes.";
    const item = evidence({ title: body, bodyPreview: body });
    expect(hasReaderFacingPromotionTitle(item)).toBe(true);
    expect(buildReaderPostPromotionTitle({ lead: {
      ...item, bodyPreview: body.replace(/^BREAKING: /u, ""),
    } })).toContain(body);
  });

});


const evidence = (
  overrides: Partial<SummaryEvidenceItem>,
): SummaryEvidenceItem => ({
  feedItemId: "feed-x",
  sourceItemId: "source-x",
  sourceBindingId: "binding-x",
  providerKey: "x-twitter",
  providerName: "X/Twitter",
  canonicalUrl: "https://x.com/example/status/1",
  title: "X post by @watcher: source title",
  bodyPreview: "",
  authorHandle: "watcher",
  publishedAt: new Date("2026-07-12T12:00:00.000Z"),
  observedAt: new Date("2026-07-12T12:05:00.000Z"),
  interestId: "ai-agents",
  score: 2.57,
  whyImportant: [],
  providerMetricLabels: [],
  readerActionKind: "read_source",
  ...overrides,
});
