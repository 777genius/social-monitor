import {
  canonicalizeReaderSummaryWeeklyJson,
} from "./reader-summary-weekly-canonical-json";
import * as storyAuthorityModule from "./reader-summary-weekly-story-authority";
import {
  assertReaderSummaryWeeklyStoryAuthorityBinding,
  readerSummaryWeeklyStoryAuthoritySchemaVersion,
  type ReaderSummaryWeeklyStoryAuthorityBinding,
} from "./reader-summary-weekly-story-authority";

describe("reader summary weekly story authority boundary", () => {
  it("does not export persistence handles, verifiers or a persistence sealer", () => {
    expect(
      Object.keys(storyAuthorityModule).filter((name) =>
        /fromPersistence|handle|prisma|readVerified|seal/iu.test(name),
      ),
    ).toEqual([]);
  });

  it("treats inherited binding readers as invalid domain data", () => {
    const binding = authorityBinding();
    const callerReader = jest.fn(
      (): ReaderSummaryWeeklyStoryAuthorityBinding => binding,
    );
    const inheritedReader = Object.freeze(
      Object.create({ readBinding: callerReader }) as object,
    );

    expect(() =>
      assertReaderSummaryWeeklyStoryAuthorityBinding(inheritedReader),
    ).toThrow("must be a plain object");
    expect(callerReader).not.toHaveBeenCalled();
  });

  it("validates the complete canonical binding rather than a trust flag", () => {
    const binding = authorityBinding();

    expect(() =>
      assertReaderSummaryWeeklyStoryAuthorityBinding(binding),
    ).not.toThrow();
    expect(() =>
      assertReaderSummaryWeeklyStoryAuthorityBinding({
        ...binding,
        trusted: true,
      }),
    ).toThrow("must contain exactly");
    expect(() =>
      assertReaderSummaryWeeklyStoryAuthorityBinding({
        ...binding,
        artifactPayloadSha256: "f".repeat(64),
      }),
    ).toThrow("binding seal is invalid");
  });

  it("uses publication day for backfill evidence and rejects wrong-day or ambiguous sources", () => {
    const binding = authorityBinding();
    expect(() =>
      resealBinding(binding, {
        evidence: binding.evidence.map((item) => ({
          ...item,
          observedAt: "2026-07-06T08:05:00.000Z",
        })),
      }),
    ).not.toThrow();
    expect(() =>
      resealBinding(binding, {
        evidence: binding.evidence.map((item) => ({
          ...item,
          observedAt: "2026-07-04T08:05:00.000Z",
        })),
      }),
    ).not.toThrow();
    expect(() =>
      resealBinding(binding, {
        evidence: binding.evidence.map((item) => ({
          ...item,
          publishedAt: "2026-07-04T08:00:00.000Z",
        })),
      }),
    ).toThrow("not factual for the requested UTC date");
    expect(() =>
      resealBinding(binding, {
        evidence: [
          binding.evidence[0]!,
          {
            ...binding.evidence[0]!,
            citationId: "citation-2",
            feedItemId: "feed-2",
          },
        ],
      }),
    ).toThrow("ambiguous source identities");
  });
});

const authorityBinding = (): ReaderSummaryWeeklyStoryAuthorityBinding => {
  const body = {
    schemaVersion: readerSummaryWeeklyStoryAuthoritySchemaVersion,
    tenantId: "00000000-0000-4000-8000-000000000001",
    workspaceId: "00000000-0000-4000-8000-000000000002",
    scope: { type: "workspace" as const },
    requestedUtcDate: "2026-07-05",
    publicationId: "20000000-0000-4000-8000-000000000001",
    artifactId: "20000000-0000-4000-8000-000000000001",
    jobId: "10000000-0000-4000-8000-000000000001",
    reportId:
      "reader-summary-report:20000000-0000-4000-8000-000000000001",
    proofId:
      "reader-summary-proof:20000000-0000-4000-8000-000000000001",
    publicationEvidenceIdentity:
      `reader_summary.weekly_publication_evidence.v1:${"c".repeat(64)}`,
    publicationEvidenceSha256: "c".repeat(64),
    reportSha256: "d".repeat(64),
    proofSha256: "e".repeat(64),
    artifactPayloadSha256: "a".repeat(64),
    providerEvidenceSha256: "b".repeat(64),
    githubEvidenceSha256: "1".repeat(64),
    semanticStatus: "COMPLETED" as const,
    publishedAt: "2026-07-05T12:00:00.000Z",
    evidence: [
      {
        providerKey: "rss" as const,
        citationId: "citation-1",
        citationField: "canonicalUrl" as const,
        feedItemId: "feed-1",
        sourceItemId: "source-1",
        sourceBindingId: "binding-1",
        providerItemId: "provider-1",
        canonicalUrl: "https://example.test/citation-1",
        sourceContentHash: "2".repeat(64),
        publishedAt: "2026-07-05T08:00:00.000Z",
        observedAt: "2026-07-05T08:05:00.000Z",
      },
    ],
  };
  const sha256 = canonicalizeReaderSummaryWeeklyJson(body).sha256;
  return {
    ...body,
    identity: `${readerSummaryWeeklyStoryAuthoritySchemaVersion}:${sha256}`,
    sha256,
  };
};

const resealBinding = (
  baseline: ReaderSummaryWeeklyStoryAuthorityBinding,
  change: Partial<ReaderSummaryWeeklyStoryAuthorityBinding>,
): ReaderSummaryWeeklyStoryAuthorityBinding => {
  const baselineBody = Object.fromEntries(
    Object.entries(baseline).filter(
      ([key]) => key !== "identity" && key !== "sha256",
    ),
  );
  const body = { ...baselineBody, ...change };
  const sha256 = canonicalizeReaderSummaryWeeklyJson(body).sha256;
  const binding = {
    ...body,
    identity: `${readerSummaryWeeklyStoryAuthoritySchemaVersion}:${sha256}`,
    sha256,
  } as ReaderSummaryWeeklyStoryAuthorityBinding;
  assertReaderSummaryWeeklyStoryAuthorityBinding(binding);
  return binding;
};
