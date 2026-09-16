import { HttpHistoricalPromotionApiVisibilityVerifier } from
  "./reader-summary-promotion-v2-historical-postgres";
import { publicPromotionAttestationMatches } from
  "./reader-summary-promotion-v2-public-attestation";

const artifactId = "00000000-0000-4000-8000-000000000101";
const noSignal = {
  readerSummaryId: artifactId,
  readerBrief: { topReads: [], selectedPosts: [] },
  qualityFlags: ["no_signal"],
  lineage: {
    promptVersion: "reader_summary.promotion_no_signal.v1",
    modelVersion: "not_invoked",
    providerVersion: "deterministic",
    rulesVersion: "reader_promotion_policy.v2",
    evalDatasetVersion: "reader_promotion_policy.v2",
  },
};
const expected = {
  kind: "valid-no-signal" as const,
  noSignal: true,
  rankingPolicyVersion: "story_ranking_v10",
  orderedLanes: { top: [], additional: [] },
  citationCount: 0,
};

describe("historical Promotion V2 site visibility", () => {
  afterEach(() => jest.restoreAllMocks());

  it("does not complete when a site contract endpoint is absent", async () => {
    mockFetch(apiBody(), "site route");
    const verifier = new HttpHistoricalPromotionApiVisibilityVerifier({
      baseUrl: "https://api.example.test",
      siteUrl: "https://site.example.test/reader",
    });

    await expect(verifier.verify(verificationInput())).rejects.toThrow(
      "site contract is not configured",
    );
  });

  it("requires the site contract identity and ordered lanes", async () => {
    mockFetch(apiBody(), "site route", {
      ...noSignal,
      readerSummaryId: "00000000-0000-4000-8000-000000000999",
    });
    const verifier = configuredVerifier();
    await expect(verifier.verify(verificationInput())).rejects.toThrow(
      "site contract is invalid",
    );

    jest.restoreAllMocks();
    mockFetch(apiBody(), "site route", {
      ...noSignal,
      readerBrief: {
        topReads: [{ promotionAttestation: { forged: true } }],
        selectedPosts: [],
      },
    });
    await expect(configuredVerifier().verify(verificationInput()))
      .rejects.toThrow("ordered V2 tuple is inconsistent");
  });

  it("accepts exact API and site-facing identity/lane parity", async () => {
    mockFetch(apiBody(), "site route", noSignal);

    await expect(configuredVerifier().verify(verificationInput()))
      .resolves.toEqual({
        siteReaderRouteHttp200Verified: true,
        siteFacingContractVerified: true,
      });
  });

  it("compares the public DTO projection with the durable V2 attestation", async () => {
    const durable = durableV2Attestation();
    const projected = publicV2Attestation();
    expect(publicPromotionAttestationMatches(projected, durable)).toBe(true);
    const completed = {
      readerSummaryId: artifactId,
      readerBrief: {
        topReads: [{ promotionAttestation: projected }],
        selectedPosts: [],
      },
      qualityFlags: [],
      lineage: {},
    };
    mockFetch({ items: [completed] }, "site route", completed);

    await expect(configuredVerifier().verify({
      ...verificationInput(),
      expected: {
        ...expected,
        kind: "valid-v2",
        noSignal: false,
        orderedLanes: { top: [durable], additional: [] },
        citationCount: 1,
      },
    })).resolves.toEqual({
      siteReaderRouteHttp200Verified: true,
      siteFacingContractVerified: true,
    });

    jest.restoreAllMocks();
    const forged = { ...projected, digest: "f".repeat(64) };
    mockFetch({
      items: [{
        ...completed,
        readerBrief: {
          topReads: [{ promotionAttestation: forged }],
          selectedPosts: [],
        },
      }],
    });
    await expect(configuredVerifier().verify({
      ...verificationInput(),
      expected: {
        ...expected,
        kind: "valid-v2",
        noSignal: false,
        orderedLanes: { top: [durable], additional: [] },
        citationCount: 1,
      },
    })).rejects.toThrow("ordered V2 tuple is inconsistent");
  });
});

const durableV2Attestation = () => ({
  ...publicV2Attestation(),
  canonicalDedupeOutcome: "retained",
  capOutcome: "selected",
  citationId: "c1",
  citationValid: true,
  confidence: 0.9,
  contentKind: "original_post",
  metricsState: "observed",
});

const publicV2Attestation = () => ({
  schemaVersion: "reader_post_promotion_attestation.v2",
  policyVersion: "reader_post_promotion.v2",
  digestVersion: "reader_post_promotion_digest.sha256.v2",
  digest: "a".repeat(64),
  canonicalPayload: "{\"candidateId\":\"candidate-1\"}",
  artifactId,
  sourceWindowId: "window-1",
  slot: 1,
  candidateId: "candidate-1",
  canonicalIdentity: "url:https://example.test/post",
  placement: "top",
  decision: "promote_top",
  citationIds: ["c1"],
  storyClusterId: "story-1",
  scoreComponents: { total: 0.9 },
  reasonCodes: ["reader_promotion_v2_admitted"],
  candidateDigestInput: "candidate-digest-input",
  slateEntryDigestInput: "slate-entry-digest-input",
  slateDigestInput: "slate-digest-input",
  slateDigest: "b".repeat(64),
  evidenceLineage: {
    leadCandidateId: "candidate-1",
    leadCitationId: "c1",
    supportCandidateIds: [],
    supportCitationIds: [],
    citationIds: ["c1"],
  },
});

const configuredVerifier = () =>
  new HttpHistoricalPromotionApiVisibilityVerifier({
    baseUrl: "https://api.example.test",
    siteUrl: "https://site.example.test/reader",
    siteContractUrl: "https://site.example.test/reader-contract",
  });

const verificationInput = () => ({
  date: "2026-08-01",
  artifactId,
  tenantId: "10000000-0000-4000-8000-000000000001",
  workspaceId: "20000000-0000-4000-8000-000000000002",
  expected,
});

const apiBody = () => ({ items: [noSignal] });

const mockFetch = (...bodies: readonly unknown[]): void => {
  const fetchMock = jest.spyOn(globalThis, "fetch");
  for (const body of bodies) {
    fetchMock.mockResolvedValueOnce(typeof body === "string"
      ? new Response(body, { status: 200 })
      : new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" },
        }));
  }
};
