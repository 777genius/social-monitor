import { hasValidReaderDisplayTitle } from "./reader-display-title-quality";
import type { TopRead } from "../entities/top-read";
import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";
import { buildReaderPostPromotionTitle } from "../services/reader-post-promotion-title";

describe("hasValidReaderDisplayTitle", () => {
  it("keeps a faithful source-title card when the display headline is unavailable", () => {
    const title = `${"Atlas documents agent safety findings. ".repeat(8)}Only in simulations.`;
    const lead = evidence(title);
    const read = card(buildReaderPostPromotionTitle({ lead }), lead, {
      status: "unavailable", reasonCode: "not_assessed",
    });

    expect(hasValidReaderDisplayTitle(read, [lead])).toBe(true);
    expect(hasValidReaderDisplayTitle(read, [])).toBe(true);
    expect(hasValidReaderDisplayTitle(card("Invented claim", lead, {
      status: "unavailable", reasonCode: "not_assessed",
    }), [])).toBe(false);
    expect(hasValidReaderDisplayTitle(card(buildReaderPostPromotionTitle({ lead }), lead, {
      status: "unavailable", reasonCode: "invalid_assessment",
    }), [lead])).toBe(false);
  });

  it("rejects a detached polished assertion against the captured lead", () => {
    const lead = evidence("Atlas bypasses human approval only in simulations.");
    const read = card("Atlas bypasses human approval", lead, {
      status: "unavailable", reasonCode: "not_assessed",
    });

    expect(hasValidReaderDisplayTitle(read, [lead])).toBe(false);
  });

  it("keeps a concise title when no captured source is bound", () => {
    expect(hasValidReaderDisplayTitle({
      title: "Orion benchmark discussion",
      providerKey: "hacker-news",
    })).toBe(true);
  });
});

const evidence = (title: string): SummaryEvidenceItem => ({
  feedItemId: "source",
  sourceItemId: "source-item",
  sourceBindingId: "binding",
  interestId: "ai-agents",
  providerKey: "x-twitter",
  canonicalUrl: "https://example.test/source",
  title,
  bodyPreview: title,
  sourceText: title,
  publishedAt: new Date("2026-09-12T12:00:00.000Z"),
  observedAt: new Date("2026-09-12T12:01:00.000Z"),
  score: 1,
  whyImportant: ["source matters"],
});

const card = (
  title: string,
  lead: SummaryEvidenceItem,
  displayHeadline?: TopRead["displayHeadline"],
): Pick<TopRead, "title" | "canonicalUrl" | "providerKey" | "capturedSource" | "displayHeadline"> => ({
  title,
  canonicalUrl: lead.canonicalUrl,
  providerKey: lead.providerKey,
  capturedSource: {
    title: lead.title,
    body: lead.sourceText,
    captureAvailability: "available",
    reviewAvailability: "body_present",
  },
  displayHeadline,
});
