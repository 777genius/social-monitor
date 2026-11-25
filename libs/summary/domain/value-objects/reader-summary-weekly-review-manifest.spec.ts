import { createHash } from "node:crypto";

import {
  createReaderSummaryWeeklyReviewManifest,
  deriveReaderSummaryWeeklyReviewCitationSelector,
  deriveReaderSummaryWeeklyReviewStoryCandidates,
  readerSummaryWeeklyReviewStoryIdentityPrefix,
  type ReaderSummaryWeeklyReviewAuthority,
} from "./reader-summary-weekly-review-manifest";

describe("reader summary weekly review manifest", () => {
  it("derives immutable internal and model-facing story identities from sealed evidence", () => {
    const candidates = deriveReaderSummaryWeeklyReviewStoryCandidates(authority());
    const candidate = candidates[0];

    expect(candidates).toHaveLength(1);
    expect(candidate?.storyId).toMatch(
      new RegExp(`^${escapeRegex(readerSummaryWeeklyReviewStoryIdentityPrefix)}[0-9a-f]{64}$`, "u"),
    );
    expect(candidate?.story).toMatch(/^story:[0-9a-f]{64}$/u);
    expect(candidate?.citations).toHaveLength(8);
    expect(Object.isFrozen(candidate)).toBe(true);
  });

  it("derives globally exact candidate selectors when local citation ids recur", () => {
    const source = authority();
    const localCitationId = "citation:reused-local-id";
    const repeated = {
      ...source,
      days: source.days.map((day, dayIndex) => dayIndex > 1 ? day : {
        ...day,
        providerEvidence: day.providerEvidence.map((evidence, evidenceIndex) =>
          evidenceIndex === 0
            ? { ...evidence, citationId: localCitationId }
            : evidence),
      }),
    };
    const expected = repeated.days.slice(0, 2).map((day) => {
      const evidence = day.providerEvidence[0]!;
      return deriveReaderSummaryWeeklyReviewCitationSelector({
        requestedUtcDate: day.requestedUtcDate,
        publicationId: day.publicationId,
        publicationEvidenceSha256: day.publicationEvidenceSha256,
        providerKey: evidence.providerKey,
        citationId: evidence.citationId,
        sourceItemId: evidence.sourceItemId,
        sourceContentHash: evidence.sourceContentHash,
      });
    });
    const derived = deriveReaderSummaryWeeklyReviewStoryCandidates(repeated)
      .flatMap((candidate) => candidate.citations)
      .filter((citation) => citation.citationId === localCitationId)
      .map((citation) => citation.selector);

    expect(derived).toEqual(expected);
    expect(new Set(derived).size).toBe(2);
  });

  it("binds observations, authority, canonical bytes, and execution attestation", () => {
    const source = authority();
    const candidate = deriveReaderSummaryWeeklyReviewStoryCandidates(source)[0]!;
    const first = createReaderSummaryWeeklyReviewManifest({
      authority: source,
      selections: [{
        story: candidate.story,
        label: "evolution",
        citationSelectors: [
          candidate.citations[1]!.selector,
          candidate.citations[2]!.selector,
        ],
        beforeCitationSelector: candidate.citations[1]!.selector,
        afterCitationSelector: candidate.citations[2]!.selector,
      }],
      modelResponseSha256: sha("model-response"),
      executionAttestation: attestation(sha("model-response")),
    });
    const replay = createReaderSummaryWeeklyReviewManifest({
      authority: source,
      selections: [{
        story: candidate.story,
        label: "evolution",
        citationSelectors: [
          candidate.citations[2]!.selector,
          candidate.citations[1]!.selector,
        ],
        beforeCitationSelector: candidate.citations[1]!.selector,
        afterCitationSelector: candidate.citations[2]!.selector,
      }],
      modelResponseSha256: sha("model-response"),
      executionAttestation: attestation(sha("model-response")),
    });

    expect(replay.manifestId).toBe(first.manifestId);
    expect(replay.manifestSha256).toBe(first.manifestSha256);
    expect(replay.toBytes()).toEqual(first.toBytes());
    expect(first.reviewAuthority.days).toHaveLength(7);
    expect(first.citations).toHaveLength(2);
    expect(Object.isFrozen(first.canonicalRecord)).toBe(true);
  });

  it("rejects duplicate story dates and invalid transition labels", () => {
    const source = authority();
    const candidate = deriveReaderSummaryWeeklyReviewStoryCandidates(source)[0]!;

    expect(() => createReaderSummaryWeeklyReviewManifest({
      authority: source,
      selections: [{
        story: candidate.story,
        label: "observation",
        citationSelectors: [
          candidate.citations[0]!.selector,
          candidate.citations[1]!.selector,
        ],
      }],
      modelResponseSha256: sha("model-response"),
      executionAttestation: attestation(sha("model-response")),
    })).toThrow("cannot duplicate a story on one date");

    expect(() => createReaderSummaryWeeklyReviewManifest({
      authority: source,
      selections: [{
        story: candidate.story,
        label: "resolution",
        citationSelectors: [
          candidate.citations[1]!.selector,
          candidate.citations[2]!.selector,
        ],
        terminalCitationSelector: candidate.citations[1]!.selector,
      }],
      modelResponseSha256: sha("model-response"),
      executionAttestation: attestation(sha("model-response")),
    })).toThrow("latest terminal citation");

    expect(() => createReaderSummaryWeeklyReviewManifest({
      authority: source,
      selections: [{
        story: candidate.story,
        label: "resolution",
        citationSelectors: [candidate.citations[2]!.selector],
      } as never],
      modelResponseSha256: sha("model-response"),
      executionAttestation: attestation(sha("model-response")),
    })).toThrow("must contain exactly");
  });

  it("accepts a resolution whose terminal citation is the latest selected date", () => {
    const source = authority();
    const candidate = deriveReaderSummaryWeeklyReviewStoryCandidates(source)[0]!;
    const manifest = createReaderSummaryWeeklyReviewManifest({
      authority: source,
      selections: [{
        story: candidate.story,
        label: "resolution",
        citationSelectors: [
          candidate.citations[1]!.selector,
          candidate.citations[2]!.selector,
        ],
        terminalCitationSelector: candidate.citations[2]!.selector,
      }],
      modelResponseSha256: sha("model-response"),
      executionAttestation: attestation(sha("model-response")),
    });

    expect(manifest.observations[0]).toMatchObject({
      label: "resolution",
      terminalCitationSelector: candidate.citations[2]!.selector,
    });
  });

  it("keeps the Jul 23 historical GitHub exception honest", () => {
    const source = authority();
    const july23 = source.days[3]!;
    const dishonest = {
      ...source,
      days: source.days.map((day, index) => index === 3 ? {
        ...july23,
        githubMode: "historical_unavailable" as const,
        providerEvidence: [{
          ...july23.providerEvidence[0]!,
          providerKey: "github-trending-page" as const,
        }],
      } : day),
    };

    expect(() => deriveReaderSummaryWeeklyReviewStoryCandidates(dishonest)).toThrow(
      "not honest about provider evidence",
    );
  });

  it("accepts evidence collected after its sealed publication day", () => {
    const source = authority();
    const historical = {
      ...source,
      days: source.days.map((day, index) => index === 0 ? {
        ...day,
        providerEvidence: day.providerEvidence.map((evidence) => ({
          ...evidence,
          observedAt: "2026-08-14T09:00:00.000Z",
        })),
      } : day),
    };

    expect(deriveReaderSummaryWeeklyReviewStoryCandidates(historical)).not.toHaveLength(0);
  });

  it("accepts sealed provider evidence with a title and an empty optional source text", () => {
    const source = authority();
    const withoutBody = {
      ...source,
      days: source.days.map((day, index) => index === 0 ? {
        ...day,
        providerEvidence: day.providerEvidence.map((evidence) => ({
          ...evidence,
          sourceText: "",
        })),
      } : day),
    };

    expect(deriveReaderSummaryWeeklyReviewStoryCandidates(withoutBody)).not.toHaveLength(0);
  });

  it("rejects evidence published outside its sealed publication day", () => {
    const source = authority();
    const escaped = {
      ...source,
      days: source.days.map((day, index) => index === 0 ? {
        ...day,
        providerEvidence: day.providerEvidence.map((evidence) => ({
          ...evidence,
          publishedAt: "2026-07-21T08:00:00.000Z",
        })),
      } : day),
    };

    expect(() => deriveReaderSummaryWeeklyReviewStoryCandidates(escaped)).toThrow(
      "outside its sealed day",
    );
  });
});

const authority = (): ReaderSummaryWeeklyReviewAuthority => {
  const weekStartedOn = "2026-07-20";
  return {
    sealId: `reader_summary.weekly_certification_seal.v1:${sha("seal")}`,
    sealSha256: sha("seal"),
    tenantId: "11111111-1111-4111-8111-111111111111",
    workspaceId: "22222222-2222-4222-8222-222222222222",
    scope: { type: "workspace" },
    weekStartedOn,
    weekEndedOn: "2026-07-26",
    days: Array.from({ length: 7 }, (_, index) => {
      const date = utcDateAfter(weekStartedOn, index);
      return {
        requestedUtcDate: date,
        publicationId: `publication:${date}`,
        publicationEvidenceIdentity: `reader_summary.weekly_publication_evidence.v1:${sha(date)}`,
        publicationEvidenceSha256: sha(date),
        providerEvidenceSha256: sha(`providers:${date}`),
        githubEvidenceSha256: sha(`github:${date}`),
        semanticStatus: "COMPLETED" as const,
        githubMode: "verified" as const,
        providerEvidence: Array.from({ length: index === 0 ? 2 : 1 }, (_, item) => ({
          providerKey: "rss" as const,
          citationId: `citation:${date}:${item}`,
          feedItemId: `feed:${date}:${item}`,
          sourceItemId: `source:${date}:${item}`,
          sourceBindingId: `binding:${date}:${item}`,
          providerItemId: `provider-item:${date}:${item}`,
          canonicalUrl: "https://example.com/stable-story",
          sourceContentHash: sha(`content:${date}:${item}`),
          publishedAt: `${date}T08:00:00.000Z`,
          observedAt: `${date}T09:00:00.000Z`,
          title: "A sealed weekly story",
          sourceText: "Sealed source text used only for model review.",
        })),
      };
    }),
  };
};

const attestation = (selectedOutputSha256: string) => ({
  schemaVersion: 1 as const,
  requestId: "reader-summary-weekly-review:test",
  purpose: "social_monitor.reader_summary.weekly.review" as const,
  canonicalRequestSha256: sha("request"),
  provider: "codex" as const,
  model: "gpt-5.6-sol" as const,
  reasoningEffort: "xhigh" as const,
  runtimeEngine: "subscription-runtime-cli" as const,
  runtimePackageVersion: "1.2.3",
  launcherSha256: sha("launcher"),
  selectedOutputKind: "structured_output" as const,
  selectedOutputSha256,
});

const sha = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const utcDateAfter = (date: string, offset: number): string =>
  new Date(Date.parse(`${date}T00:00:00.000Z`) + offset * 86_400_000)
    .toISOString()
    .slice(0, 10);

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
