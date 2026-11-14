import type { ReaderSummaryWeeklyModelInput } from "../../ports/reader-summary-weekly-model.port";
import {
  expandedLegacyOutputKeys,
  sealedCompactOutputKeys,
} from "./openai-responses-reader-summary-weekly-response-shapes";
import {
  normalizeExpandedLegacyWeeklyModelOutput,
  normalizeSealedCompactWeeklyModelOutput,
} from "./openai-responses-reader-summary-weekly-expanded-normalization";

const input = {
  citations: [{ citationId: "c1", observedOn: "2026-07-20" }],
} as unknown as ReaderSummaryWeeklyModelInput;

const envelope = <K extends string>(keys: readonly K[]): Record<K, unknown> => ({
  ...Object.fromEntries(keys.map((key) => [key, undefined])),
  citationIds: ["c1"],
  observedFrom: "2026-07-20",
  observedThrough: "2026-07-20",
} as Record<K, unknown>);

describe("weekly legacy envelope decoding boundaries", () => {
  it("keeps sealed compact array admission fail-closed", () => {
    expect(() => normalizeSealedCompactWeeklyModelOutput(input, {
      ...envelope(sealedCompactOutputKeys), stories: null, sections: [],
    })).toThrow("Sealed compact weekly stories and sections must be arrays");
  });

  it("keeps expanded legacy array admission fail-closed", () => {
    expect(() => normalizeExpandedLegacyWeeklyModelOutput(input, {
      ...envelope(expandedLegacyOutputKeys), stories: [], sections: null,
    })).toThrow("Expanded legacy weekly stories and sections must be arrays");
  });

  it("rejects extra compact story fields after checking rooted citation range", () => {
    expect(() => normalizeSealedCompactWeeklyModelOutput(input, {
      ...envelope(sealedCompactOutputKeys),
      stories: [{ storyId: "story:1", providerClaim: "untrusted" }],
      sections: [],
    })).toThrow("Sealed compact weekly story 1 must contain exactly the supported fields");
  });

  it("rejects extra expanded story fields after checking rooted citation range", () => {
    expect(() => normalizeExpandedLegacyWeeklyModelOutput(input, {
      ...envelope(expandedLegacyOutputKeys),
      stories: [{ storyId: "story:1", providerClaim: "untrusted" }],
      sections: [],
    })).toThrow("Expanded legacy weekly story 1 must contain exactly the supported fields");
  });
});
