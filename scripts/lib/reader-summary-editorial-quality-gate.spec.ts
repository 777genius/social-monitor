import {
  buildReaderSummaryEditorialQualityReport,
  parseReaderSummaryEditorialQualityFixture,
} from "./reader-summary-editorial-quality-gate";

describe("reader summary editorial quality fixture gate", () => {
  it("parses sanitized fixtures and recomputes every day", () => {
    const fixture = parseReaderSummaryEditorialQualityFixture(validFixture());
    const report = buildReaderSummaryEditorialQualityReport({
      fixture,
      fixturePath: "ops/evals/editorial-fixture.json",
    });

    expect(report).toMatchObject({
      blockingPassed: true,
      inputs: {
        collectionDates: ["2026-07-12", "2026-07-13"],
      },
      qualityGates: {
        fixtureHasAtLeastTwoDays: true,
        collectionDatesAreUnique: true,
        everyDayPassesEditorialPolicy: true,
        noRawSecretFragments: true,
      },
    });
    expect(report.days).toHaveLength(2);
  });

  it("rejects unsupported raw provider payload fields", () => {
    const fixture = validFixture();
    const firstInput = fixture.days[0]!.input;

    expect(() =>
      parseReaderSummaryEditorialQualityFixture({
        ...fixture,
        days: [
          {
            ...fixture.days[0],
            input: { ...firstInput, rawProviderPayload: { opaque: true } },
          },
          fixture.days[1],
        ],
      }),
    ).toThrow("contains unsupported keys: rawProviderPayload");
  });

  it("rejects secret fragments before mapping the fixture", () => {
    const fixture = validFixture();

    expect(() =>
      parseReaderSummaryEditorialQualityFixture({
        ...fixture,
        api_key: "not-a-real-secret",
      }),
    ).toThrow("contains a secret fragment");
  });

  it("does not trust a fixture when recomputed policy quality fails", () => {
    const fixture = validFixture();
    const parsed = parseReaderSummaryEditorialQualityFixture({
      ...fixture,
      days: fixture.days.map((day, index) =>
        index === 0
          ? {
              ...day,
              input: {
                ...day.input,
                headline: day.input.topPostTitles[0],
              },
            }
          : day,
      ),
    });
    const report = buildReaderSummaryEditorialQualityReport({
      fixture: parsed,
      fixturePath: "fixture.json",
    });

    expect(report.days[0]?.qualityGates.headlineIsNotCopiedFromTopPost).toBe(
      false,
    );
    expect(report.blockingPassed).toBe(false);
  });
});

const validFixture = () => ({
  schemaVersion: 1,
  artifactFormat: "reader-summary-editorial-quality-fixture-v1",
  fixtureKind: "sanitized_placeholder",
  days: [day("2026-07-12"), day("2026-07-13")],
});

const day = (collectionDate: string) => ({
  collectionDate,
  input: {
    headline: "AI coding workflows balance isolation, cost and access",
    coverageMode: "daily_synthesis",
    topPostTitles: ["A disposable VM for coding agents"],
    citations: [
      {
        citationId: "c1",
        providerKey: "hacker-news",
        storyClusterId: "cluster-isolation",
      },
      {
        citationId: "c2",
        providerKey: "x-twitter",
        storyClusterId: "cluster-routing",
      },
      {
        citationId: "c3",
        providerKey: "reddit",
        storyClusterId: "cluster-cost",
      },
    ],
    narrativeSections: [
      {
        kind: "lead",
        title: "Daily synthesis",
        text: "Developers are balancing agent isolation and model routing.",
        citationIds: ["c1", "c2"],
      },
      {
        kind: "secondary_signal",
        title: "Cost pressure",
        text: "Subscription constraints remain a practical concern.",
        citationIds: ["c3"],
        storyClusterId: "cluster-cost",
      },
    ],
    renderedMarkdown:
      "Developers are balancing agent isolation and model routing.\n\n" +
      "**Other signals today**\n\n" +
      "- **Cost pressure:** Subscription constraints remain practical.",
  },
});
