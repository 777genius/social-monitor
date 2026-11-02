import { preserveQuotedPostAvailability } from "./quoted-post-capture-availability";
import { createHash } from "node:crypto";
import { captureNativeText, preserveSourceCapture, readContentCapture } from "./source-content-capture";

const item = (availableAt: string, text = "Original captured source") => ({ metadata: {
  quotedPost: { version: "x_quoted_post.v1", parentTweetId: "200", tweetId: "100",
    canonicalUrl: "https://x.com/original/status/100", authorHandle: "original",
    publishedAt: "2026-10-31T10:00:00.000Z", text,
    bodySha256: createHash("sha256").update(text).digest("hex"), availableAt },
} });

describe("retained quoted-source acquisition authority", () => {
  it("normal capture preservation keeps parent and quoted acquisition times independently", () => {
    const source = { title: "My own conclusion", body: "My own authored source text.",
      canonicalUrl: "https://x.com/quoting/status/200" };
    const prior = captureNativeText({ ...source, ...item("2026-11-02T12:00:00.000Z") },
      "x-twitter", new Date("2026-10-31T12:00:00.000Z"));
    const next = captureNativeText({ ...source, ...item("2026-11-03T12:00:00.000Z") },
      "x-twitter", new Date("2026-11-03T12:00:00.000Z"));
    const retained = preserveSourceCapture(next, prior);
    expect(readContentCapture(retained)?.native.availableAt).toBe("2026-10-31T12:00:00.000Z");
    expect(retained.metadata.quotedPost.availableAt).toBe("2026-11-02T12:00:00.000Z");
  });
  it("preserves the first real capture for identical context across normal source upserts", () => {
    expect(preserveQuotedPostAvailability(item("2026-11-03T12:00:00.000Z"),
      item("2026-11-02T12:00:00.000Z"))).toEqual(item("2026-11-02T12:00:00.000Z"));
  });
  it("does not reuse a parent timestamp or a previous different quote", () => {
    const next = item("2026-11-03T12:00:00.000Z", "New source text");
    expect(preserveQuotedPostAvailability(next, item("2026-11-02T12:00:00.000Z"))).toEqual(next);
    expect(preserveQuotedPostAvailability(next, { metadata: {} })).toEqual(next);
    expect(preserveQuotedPostAvailability(item("2026-11-02T12:00:00.000Z"),
      item("2026-11-03T12:00:00.000Z"))).toEqual(item("2026-11-02T12:00:00.000Z"));
  });
});
