import type { XDailyCollectedPost } from "./x-daily-collector-client.port";
import { normalizeXPost } from "./x-twitter-experimental-daily-item";
import { StaticXPromotionAuthorityRegistry } from
  "./static-x-promotion-authority-registry";

describe("normalizeXPost promotion provenance", () => {
  it("preserves authoritative X content kind", () => {
    expect(normalizeXPost(post({ contentKind: "original_post" }), "Cursor", 10)
      .metadata).toMatchObject({ contentKind: "original_post" });
  });

  it("does not infer original content when collector provenance is absent", () => {
    expect(normalizeXPost(post(), "Cursor", 10).metadata).not.toHaveProperty(
      "contentKind",
    );
  });

  it("binds authenticated source-catalog authority to an exact normalized handle", () => {
    const metadata = normalizeXPost(
      post({ contentKind: "original_post" }),
      "Cursor",
      10,
      registry.resolveVerifiedIdentity("cursor_ai") ?? undefined,
    ).metadata;
    expect(metadata).toMatchObject({
      promotionAuthority: {
        status: "attested",
        official: true,
        trusted: true,
        attestedBy: "source_catalog",
      },
    });
    expect(normalizeXPost(
      post({ authorHandle: "cursor_support" }),
      "Cursor",
      10,
      registry.resolveVerifiedIdentity("cursor_support") ?? undefined,
    ).metadata).not.toHaveProperty("promotionAuthority");
  });

  it.each(["missing", "malformed", "conflict"] as const)(
    "preserves %s eligibility metrics instead of coercing zero",
    (eligibilityState) => {
      expect(normalizeXPost(post({
        metrics: { replies: 0, eligibilityState },
      }), "Cursor", 10).metadata).toMatchObject({
        promotionMetricsState: eligibilityState,
      });
    },
  );
});

const registry = new StaticXPromotionAuthorityRegistry(["cursor_ai"]);

const post = (
  overrides: Partial<XDailyCollectedPost> = {},
): XDailyCollectedPost => ({
  tweetId: "1956000000000000000",
  canonicalUrl: "https://x.com/cursor_ai/status/1956000000000000000",
  text: "Cursor ships a material agent update.",
  authorHandle: "cursor_ai",
  publishedAt: new Date("2026-08-14T12:00:00.000Z"),
  metrics: {
    likes: 100,
    retweets: 20,
    replies: 10,
    eligibilityState: "observed",
  },
  mediaUrls: [],
  sourceProduct: "latest",
  trendScore: 1,
  ...overrides,
});
