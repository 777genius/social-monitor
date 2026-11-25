import type { ReaderSummaryNarrativeSection } from "../../domain";
import {
  normalizeOpenAiReaderSummaryLeadCopy,
  resolveOpenAiReaderSummaryPublicationCopy,
} from "./openai-responses-reader-summary-draft-copy-policy";

describe("OpenAI reader summary publication copy policy", () => {
  it("keeps headline and legacy executive summary strict without accepting wrong types", () => {
    expect(() => normalizeOpenAiReaderSummaryLeadCopy({
      headline: "Valid headline",
      executiveSummary: null,
    })).toThrow("reader summary executive summary must be a non-empty string");
    expect(() => normalizeOpenAiReaderSummaryLeadCopy({
      headline: " ",
      executiveSummary: "Valid summary",
    })).toThrow("reader summary headline must be a non-empty string");
  });

  it("preserves the empty legacy summary sentinel and trims ordinary copy", () => {
    expect(normalizeOpenAiReaderSummaryLeadCopy({
      headline: "  Valid headline  ",
      executiveSummary: "  ",
    })).toEqual({ headline: "Valid headline", legacyExecutiveSummary: "" });
    expect(normalizeOpenAiReaderSummaryLeadCopy({
      headline: "Valid headline",
      executiveSummary: "  Cited summary  ",
    }).legacyExecutiveSummary).toBe("Cited summary");
  });

  it("prefers legacy text over cited story copy and omits no-signal when stories exist", () => {
    expect(resolveOpenAiReaderSummaryPublicationCopy({
      raw: { noSignalReason: "untrusted spurious reason" },
      legacyExecutiveSummary: " Legacy copy ",
      normalizedTopStories: [{ summary: "Cited story" }],
      narrativeSections: [],
    })).toEqual({ noSignalReason: undefined, executiveSummary: "Legacy copy" });
  });

  it("falls back to cited story copy when legacy text is absent", () => {
    expect(resolveOpenAiReaderSummaryPublicationCopy({
      raw: {},
      legacyExecutiveSummary: "",
      normalizedTopStories: [{ summary: "Cited story" }],
      narrativeSections: [],
    }).executiveSummary).toBe("Cited story");
  });

  it("keeps no-story no-signal reason priority and stable default", () => {
    expect(resolveOpenAiReaderSummaryPublicationCopy({
      raw: { noSignalReason: "  No publishable evidence  " },
      legacyExecutiveSummary: "",
      normalizedTopStories: [],
      narrativeSections: [],
    })).toEqual({
      noSignalReason: "No publishable evidence",
      executiveSummary: "No publishable evidence",
    });
    expect(resolveOpenAiReaderSummaryPublicationCopy({
      raw: { noSignalReason: 123 },
      legacyExecutiveSummary: "",
      normalizedTopStories: [],
      narrativeSections: [],
    })).toEqual({
      noSignalReason: "OpenAI reader summary returned no domain-safe cited stories.",
      executiveSummary: "OpenAI reader summary returned no domain-safe cited stories.",
    });
  });

  it("prefers cited narrative markdown over legacy copy without changing formatting", () => {
    const narrativeSections: readonly ReaderSummaryNarrativeSection[] = [{
      id: "narrative-1",
      kind: "lead",
      title: "Lead",
      text: "Grounded lead.",
      citationIds: ["c1"],
    }];
    expect(resolveOpenAiReaderSummaryPublicationCopy({
      raw: {},
      legacyExecutiveSummary: "Legacy text",
      normalizedTopStories: [{ summary: "Story copy" }],
      narrativeSections,
    }).executiveSummary).toBe("Grounded lead.");
  });
});
