import { uniqueStrings as identityUniqueStrings } from "./summary-provider-uniqueness";
import {
  providerKeyLabel,
  summarizeProviderLabels,
  uniqueStrings,
} from "./summary-provider-labels";

describe("provider label vs identity responsibilities", () => {
  it("preserves the historical public export identity", () => {
    expect(uniqueStrings).toBe(identityUniqueStrings);
  });

  it("keeps first-occurrence order and exact case-sensitive identities", () => {
    const input = ["rss", "github", "rss", "RSS", "", "github", ""];
    const original = [...input];
    expect(identityUniqueStrings(input)).toEqual(["rss", "github", "RSS", ""]);
    expect(input).toEqual(original);
  });

  it("keeps empty inputs and repeated whitespace values distinct", () => {
    expect(identityUniqueStrings([])).toEqual([]);
    expect(identityUniqueStrings([" ", "", " ", "  ", ""])).toEqual([" ", "", "  "]);
  });

  it("keeps existing provider display names and fallback tokenization", () => {
    expect(providerKeyLabel("github-issues")).toBe("GitHub Issues");
    expect(providerKeyLabel("hacker-news")).toBe("Hacker News");
    expect(providerKeyLabel("custom_feed:source")).toBe("Custom Feed Source");
    expect(providerKeyLabel("")).toBe("");
  });

  it("keeps display truncation without changing the source array", () => {
    const labels = ["GitHub", "Hacker News", "Reddit", "RSS"];
    expect(summarizeProviderLabels(labels)).toBe("GitHub, Hacker News, Reddit + 1 more");
    expect(summarizeProviderLabels(labels.slice(0, 3))).toBe("GitHub, Hacker News, Reddit");
    expect(summarizeProviderLabels([])).toBe("");
    expect(labels).toHaveLength(4);
  });
});
