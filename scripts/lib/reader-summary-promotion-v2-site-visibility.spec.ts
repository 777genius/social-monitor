import { HttpHistoricalPromotionApiVisibilityVerifier } from
  "./reader-summary-promotion-v2-historical-postgres";

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
