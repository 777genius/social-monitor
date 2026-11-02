import { readReaderValueQuotedContext } from "./reader-value-quoted-context";
import { readerValueRequestMatches } from "./reader-value-request-guard";
import { sha256 } from "./reader-value-source-snapshot";
import { preparedInput } from "./reader-value-input-builder.spec-support";
import { readReaderValueCapture } from "./reader-value-capture";
import { captureNativeText } from "../../../ingestion/domain/value-objects/source-content-capture";

const body = "The original experiment measured a faster robot deployment.";
const capture = () => ({ version: "x_quoted_post.v1", parentTweetId: "200",
  tweetId: "100", canonicalUrl: "https://x.com/original/status/100", authorHandle: "original",
  publishedAt: "2026-11-01T11:00:00.000Z", availableAt: "2026-11-02T12:00:00.000Z",
  text: body, bodySha256: sha256(body) });
const read = (quotedPost: unknown) => readReaderValueQuotedContext({ quotedPost } as never,
  { kind: "x_post", contentKind: "quote" }, "https://x.com/quoting/status/200");

describe("quoted source input authority", () => {
  it("binds a separate captured original without merging author text or metrics", () => {
    const context = read(capture());
    expect(context.quotedContext).toBeUndefined();
    const input = preparedInput({ ...context, body: "My own measured conclusion.",
      availableAt: "2026-11-01T12:00:00.000Z" });
    const state = JSON.parse(input.requestBody).state;
    expect(state.source_text).toBe("My own measured conclusion.");
    expect(state.quoted_context).toEqual({
      attribution: "separate_author_context_only_assess_quoting_authored_text",
      source_post_id: "100", author_handle: "original",
      canonical_url: "https://x.com/original/status/100", source_text: body, truncated: false,
    });
    expect(input.snapshot.quotedPost?.body).toBe(body);
    expect(input.snapshot.availableAt).toBe("2026-11-02T12:00:00.000Z");
    expect(readerValueRequestMatches(input, "openrouter-systemone")).toBe(true);
    expect(readerValueRequestMatches({ ...input, snapshot: { ...input.snapshot, quotedPost: undefined } },
      "openrouter-systemone")).toBe(false);
    const old = preparedInput({ quotedContext: "not_captured", body: "My own measured conclusion." });
    expect(old.sourceSnapshotSha256).not.toBe(input.sourceSnapshotSha256);
    expect(old.inputSha256).not.toBe(input.inputSha256);
  });

  it.each([undefined, { ...capture(), parentTweetId: "201" }, { ...capture(), tweetId: "200" },
    { ...capture(), bodySha256: "f".repeat(64) }, { ...capture(), canonicalUrl: "https://evil.test/100" },
    { ...capture(), text: "A different body" }, { ...capture(), metrics: { likes: 99999 } },
    { ...capture(), availableAt: undefined }, { ...capture(), availableAt: "2026-10-01T00:00:00.000Z" }])(
    "cannot promote unbound or forged context: %j", raw => {
      expect(read(raw)).toEqual({ quotedContext: "not_captured" });
    });

  it.each(["openrouter-systemone", "openai-decisions"] as const)(
    "bounds long Unicode quoted context and retains full source identity: %s", provider => {
      const text = "😀".repeat(20_000);
      const context = read({ ...capture(), text, bodySha256: sha256(text) });
      const input = preparedInput({ ...context, body: "My own observation." }, provider);
      expect(input.terminalFailure).toBeUndefined();
      expect(Buffer.byteLength(input.requestBody)).toBeLessThanOrEqual(56_000);
      expect(input.snapshot.quotedPost?.body.length).toBe(text.length);
      expect(input.snapshot.modelInputTruncated).toBe(true);
      expect(readerValueRequestMatches(input, provider)).toBe(true);
    });

  it("preserves ordinary and missing-context historical inputs exactly", () => {
    expect(readReaderValueQuotedContext({}, { contentKind: "original_post" }, "https://x.com/a/status/200"))
      .toEqual({});
    expect(preparedInput()).toEqual(preparedInput());
    expect(preparedInput(read(undefined))).toEqual(preparedInput({ quotedContext: "not_captured" }));
  });

  it("never dates newly acquired quote context to the old parent's acquisition", () => {
    const ownSource = captureNativeText({ title: "My conclusion", body: "My own source text.",
      canonicalUrl: "https://x.com/quoting/status/200", metadata: { kind: "x_post", contentKind: "quote",
        quotedPost: capture() } }, "x-twitter", new Date("2026-10-31T12:00:00.000Z"));
    // This is the inventory availability checked BEFORE model preparation and
    // frozen-cutoff selection, not only the later prepared input snapshot.
    expect(readReaderValueCapture(ownSource.metadata, "x-twitter", ownSource.title, ownSource.body,
      { sourceItemId: "source", canonicalUrl: ownSource.canonicalUrl }).availableAt)
      .toBe("2026-11-02T12:00:00.000Z");
    const current = preparedInput({ ...read(capture()), availableAt: "2026-10-31T12:00:00.000Z" });
    expect(current.snapshot.availableAt).toBe("2026-11-02T12:00:00.000Z");
    const sameContent = preparedInput({ ...read({ ...capture(), availableAt: "2026-11-03T12:00:00.000Z" }),
      availableAt: "2026-10-31T12:00:00.000Z" });
    expect(sameContent.sourceSnapshotSha256).toBe(current.sourceSnapshotSha256);
    expect(sameContent.requestSha256).toBe(current.requestSha256);
    expect(sameContent.inputSha256).toBe(current.inputSha256);
    expect(sameContent.snapshot.availableAt).toBe("2026-11-03T12:00:00.000Z");
  });

  it("keeps unknown authored acquisition unknown even with a genuine quote clock", () => {
    const metadata = { kind: "x_post", contentKind: "quote", quotedPost: capture() };
    expect(readReaderValueCapture(metadata, "x-twitter", "Old parent", "Historical authored bytes",
      { sourceItemId: "source", canonicalUrl: "https://x.com/quoting/status/200" }).availableAt).toBeNull();
    const input = preparedInput({ ...read(capture()), availableAt: null });
    expect(input.snapshot.quotedPost?.availableAt).toBe("2026-11-02T12:00:00.000Z");
    expect(input.snapshot.availableAt).toBeNull();
  });
});
