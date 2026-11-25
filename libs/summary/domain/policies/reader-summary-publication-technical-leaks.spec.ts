import { collectReaderSummaryUserFacingTechnicalLeaks } from "./reader-summary-publication-technical-leaks";
import { content } from "./reader-summary-publication-policy-test-fixtures";

const sourceTitle =
  "Bug in source item 00000000-0000-7000-8000-000000000001";

const sourceTitleCard = {
  title: sourceTitle,
  displayHeadline: {
    status: "unavailable" as const,
    reasonCode: "not_assessed" as const,
  },
  capturedSource: {
    title: sourceTitle,
    body: sourceTitle,
    captureAvailability: "available" as const,
    reviewAvailability: "body_present" as const,
  },
};

describe("collectReaderSummaryUserFacingTechnicalLeaks", () => {
  it("does not treat a captured source-title as generated leakage", () => {
    const baseline = content().topReads[0]!;
    expect(collectReaderSummaryUserFacingTechnicalLeaks(content({
      topReads: [{ ...baseline, ...sourceTitleCard }],
    }))).toEqual([]);
  });

  it("still flags generated reasons on a source-title card", () => {
    const baseline = content().topReads[0]!;
    const leaks = collectReaderSummaryUserFacingTechnicalLeaks(content({
      topReads: [{
        ...baseline,
        ...sourceTitleCard,
        reason: "Internal provider:reddit evidence",
      }],
    }));
    expect(leaks.some((leak) => leak.includes("provider:reddit"))).toBe(true);
  });

  it("does not treat an X captured source-title as generated leakage", () => {
    const sourceTitle =
      "X post by @atlas: Bug in source item 00000000-0000-7000-8000-000000000001";
    const body =
      "Bug in source item 00000000-0000-7000-8000-000000000001";
    const baseline = content().topReads[0]!;
    expect(collectReaderSummaryUserFacingTechnicalLeaks(content({
      topReads: [{
        ...baseline,
        title: body,
        providerKey: "x-twitter",
        displayHeadline: {
          status: "unavailable",
          reasonCode: "not_assessed",
        },
        capturedSource: {
          title: sourceTitle,
          body,
          captureAvailability: "available",
          reviewAvailability: "body_present",
        },
      }],
    }))).toEqual([]);
  });

  it("does not treat generated copy that repeats a captured source-title as leakage", () => {
    const baseline = content().topReads[0]!;
    expect(collectReaderSummaryUserFacingTechnicalLeaks(content({
      bullets: [
        `Best first cited read from X (1 citation): ${sourceTitle} - needs confirmation.`,
      ],
      narrativeSections: [{
        id: "lead",
        kind: "lead",
        title: "Overview",
        text: `Reports discuss ${sourceTitle.replace(/\.$/u, "")}`,
        citationIds: ["c1"],
      }],
      topReads: [{ ...baseline, ...sourceTitleCard }],
    }))).toEqual([]);
  });

  it("still flags an editorial title that copies internal identifiers", () => {
    const baseline = content().topReads[0]!;
    expect(collectReaderSummaryUserFacingTechnicalLeaks(content({
      topReads: [{ ...baseline, title: sourceTitle }],
    }))).toContain(sourceTitle);
  });
});
