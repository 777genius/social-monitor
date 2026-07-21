import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

import {
  assertOutputOutsideCurrentGitWorktree,
  buildReaderSummaryMultiDayQualityCorpus,
  compareUtf16CodeUnits,
  engagementMetricWeights,
  parseCaptureOptions,
  providerRankSelectionRule,
  selectionPolicyVersion,
  serializeReaderSummaryMultiDayQualityCorpus,
  sourceOnlyCorpusQuery,
  type SourceOnlyCorpusRow,
} from "./capture-reader-summary-multi-day-quality-corpus";

const dates = [
  "2026-07-10",
  "2026-07-11",
  "2026-07-12",
  "2026-07-13",
  "2026-07-14",
] as const;

describe("reader summary multi-day source quality corpus", () => {
  it("is byte-deterministic when source rows arrive in a different order", () => {
    const rows = dates.flatMap((date, dateIndex) => [
      row(date, `${dateIndex}-high`, 900, 50),
      row(date, `${dateIndex}-middle`, 100, 10),
      row(date, `${dateIndex}-low`, 1, 0),
    ]);
    const first = build(rows);
    const second = build([...rows].reverse());

    expect(first).toEqual(second);
    expect(serializeReaderSummaryMultiDayQualityCorpus(first)).toBe(
      serializeReaderSummaryMultiDayQualityCorpus(second),
    );
    expect(first.days).toHaveLength(5);
    expect(first.days[0]).toMatchObject({
      actualItemCount: 3,
      selectedItemCount: 2,
      providerCounts: [
        {
          providerKey: "hacker-news",
          actualItemCount: 3,
          selectedItemCount: 2,
          highEngagementCount: 1,
          lowEngagementCount: 1,
          unknownEngagementCount: 0,
        },
      ],
    });
    expect(first.days[0]?.items.map((item) => item.feedItemId)).toEqual([
      "feed-0-high",
      "feed-0-low",
    ]);
    expect(first.corpusSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("uses explicit UTF-16 code-unit ordering instead of locale collation", () => {
    expect(
      ["ä", "z", "a", "A", "😀", "\ud83d"].sort(compareUtf16CodeUnits),
    ).toEqual(["A", "a", "z", "ä", "\ud83d", "😀"]);
  });

  it("keeps query and artifact source-only and strips raw metadata and secrets", () => {
    const sql = sourceOnlyCorpusQuery.toLowerCase();
    expect(sql).toContain("feed_items");
    expect(sql).toContain("source_items");
    expect(sql).not.toContain("repeatable");
    for (const forbiddenTable of [
      "reader_summaries",
      "summary_jobs",
      "publication",
      "generated_artifacts",
      "relevance_scores",
    ]) {
      expect(sql).not.toContain(forbiddenTable);
    }

    const fakeSecrets = secretShapes();
    const rows = dates.map((date, index) => {
      const secretText =
        [
          `Authorization ${fakeSecrets.github} Legacy ${fakeSecrets.legacyOpenAi}`,
          `JWT ${fakeSecrets.jwt} Webhook ${fakeSecrets.webhook}`,
          `AWS ${fakeSecrets.aws}`,
          `Slack ${fakeSecrets.slack} Social Monitor ${fakeSecrets.socialMonitor}`,
          `password=${fakeSecrets.password}`,
        ][index] ?? "source-only fallback";
      return {
        ...row(date, String(index), 10, 2),
        title: secretText,
        bodyPreview: `postgresql://private-host/private-db ${secretText}`,
        authorHandle: secretText,
        canonicalUrl: `https://user:password@example.test/invite/${fakeSecrets.path}?access_token=secret#private`,
        providerMetadata: {
          kind: "hacker_news_story",
          points: 10,
          comments: 2,
          summaryText: "generated result must not leak",
          rankingPolicyVersion: "v99",
          authorization: "redacted-test-fixture",
        },
      };
    });
    const corpus = buildReaderSummaryMultiDayQualityCorpus({
      dates,
      tenantId: "tenant-secret-value",
      workspaceId: "workspace-secret-value",
      rows,
      highPerProvider: 1,
      lowPerProvider: 1,
    });
    const serialized = serializeReaderSummaryMultiDayQualityCorpus(corpus);
    const parsed = JSON.parse(serialized) as unknown;
    const keys = collectKeys(parsed);

    expect(keys).not.toContain("providerMetadata");
    expect(keys).not.toContain("summaryText");
    expect(keys).not.toContain("rankingPolicyVersion");
    expect(serialized).not.toContain("tenant-secret-value");
    expect(serialized).not.toContain("workspace-secret-value");
    expect(serialized).toContain("Authorization [redacted] Legacy [redacted]");
    expect(serialized.toLowerCase()).not.toContain("postgresql://");
    expect(serialized).not.toContain("access_token");
    expect(serialized).not.toContain("password");
    for (const secret of Object.values(fakeSecrets)) {
      expect(serialized).not.toContain(secret);
    }
    expect(serialized).toContain("https://example.test/invite/redacted");
    expect(serialized).toContain("[redacted]");
    expect(corpus.redaction).toEqual({
      rawProviderMetadataIncluded: false,
      generatedOutputsIncluded: false,
      urlCredentialsQueryAndFragmentIncluded: false,
      secretsIncluded: false,
      titleCharacterLimit: 240,
      bodyPreviewCharacterLimit: 1_200,
    });

    const unsafeCorpus = {
      ...corpus,
      days: corpus.days.map((day, dayIndex) => ({
        ...day,
        items: day.items.map((item, itemIndex) => ({
          ...item,
          title:
            dayIndex === 0 && itemIndex === 0
              ? fakeSecrets.legacyOpenAi
              : item.title,
        })),
      })),
    };
    expect(() =>
      serializeReaderSummaryMultiDayQualityCorpus(unsafeCorpus),
    ).toThrow("Corpus contains high-confidence secret");
  });

  it("rejects private corpus output inside a discovered Git worktree", () => {
    const root = mkdtempSync(join(tmpdir(), "reader-corpus-worktree-"));
    const nested = join(root, "scripts", "capture");
    mkdirSync(join(root, ".git"));
    mkdirSync(nested, { recursive: true });
    try {
      expect(() =>
        assertOutputOutsideCurrentGitWorktree(
          join(nested, "private-corpus.json"),
          nested,
        ),
      ).toThrow("must be outside Git worktree");
      expect(() =>
        assertOutputOutsideCurrentGitWorktree(
          join(dirname(root), `${basename(root)}-outside.json`),
          nested,
        ),
      ).not.toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("preserves benign auth prose, short sk text and URL paths", () => {
    const benignTitle = "Cookie and authorization guidance for browsers";
    const benignBody =
      "The sk-short-example prefix is documentation, not a credential";
    const benignUrl =
      "https://example.test/cookie-policy/authorization-guidance";
    const corpus = build(
      dates.map((date, index) => ({
        ...row(date, String(index), 10, 2),
        title: benignTitle,
        bodyPreview: benignBody,
        canonicalUrl: benignUrl,
      })),
    );

    const items = corpus.days.flatMap((day) => day.items);
    expect(items.map((item) => item.title)).toEqual(
      Array.from({ length: dates.length }, () => benignTitle),
    );
    expect(items.map((item) => item.bodyPreview)).toEqual(
      Array.from({ length: dates.length }, () => benignBody),
    );
    expect(items.map((item) => item.canonicalUrl)).toEqual(
      Array.from({ length: dates.length }, () => benignUrl),
    );
  });

  it("requires at least five unique explicit dates", () => {
    expect(() =>
      parseCaptureOptions([
        "--date",
        dates[0],
        "--date",
        dates[1],
        "--date",
        dates[2],
        "--date",
        dates[3],
        "--tenant-id",
        "tenant",
        "--workspace-id",
        "workspace",
        "--out",
        "/tmp/corpus.json",
      ]),
    ).toThrow("At least 5 explicit --date values are required");

    expect(() =>
      parseCaptureOptions(
        baseArgs([dates[0], dates[1], dates[2], dates[3], dates[0]]),
      ),
    ).toThrow(`Duplicate requested date: ${dates[0]}`);
  });

  it("rejects unknown, positional and duplicate singleton arguments", () => {
    expect(() =>
      parseCaptureOptions([...baseArgs(dates), "--unknown", "x"]),
    ).toThrow("Unsupported argument: --unknown");
    expect(() =>
      parseCaptureOptions([...baseArgs(dates), "positional", "x"]),
    ).toThrow("Unsupported argument: positional");
    expect(() =>
      parseCaptureOptions([...baseArgs(dates), "--out", "/tmp/other.json"]),
    ).toThrow("--out must be provided exactly once");
  });

  it("fails closed when one requested day has no source items", () => {
    const rows = dates
      .slice(0, 4)
      .map((date, index) => row(date, String(index), 10, 2));

    expect(() => build(rows)).toThrow(
      `Missing source items for requested date: ${dates[4]}`,
    );
  });

  it("fails closed when a feed item is duplicated", () => {
    const rows = dates.map((date, index) => row(date, String(index), 10, 2));
    rows[4] = { ...rows[4]!, feedItemId: rows[0]!.feedItemId };

    expect(() => build(rows)).toThrow(
      `Duplicate feed item: ${rows[0]?.feedItemId}`,
    );
  });

  it("fails closed on invalid and conflicting engagement metadata", () => {
    const invalidRows = dates.map((date, index) =>
      row(date, String(index), 10, 2),
    );
    invalidRows[0] = {
      ...invalidRows[0]!,
      providerMetadata: {
        kind: "hacker_news_story",
        points: "not-a-number",
        comments: 2,
      },
    };
    expect(() => build(invalidRows)).toThrow(
      "has an invalid engagement metric value",
    );

    const conflictingRows = dates.map((date, index) => ({
      ...row(date, String(index), 10, 2),
      providerKey: "x-twitter",
      providerMetadata: {
        kind: "x_post",
        likes: 10,
        publicMetrics: { like_count: 11 },
      },
    }));
    expect(() => build(conflictingRows)).toThrow(
      "has conflicting engagement metric aliases",
    );
  });

  it("samples metricless items in an explicit deterministic unknown band", () => {
    const rows = dates.flatMap((date, index) => [
      metriclessRow(date, `${index}-a`),
      metriclessRow(date, `${index}-b`),
    ]);
    const first = build(rows);
    const second = build([...rows].reverse());

    expect(first).toEqual(second);
    for (const day of first.days) {
      expect(day).toMatchObject({
        actualItemCount: 2,
        selectedItemCount: 1,
        providerCounts: [
          {
            providerKey: "rss",
            highEngagementCount: 0,
            lowEngagementCount: 0,
            unknownEngagementCount: 1,
          },
        ],
      });
      expect(day.items).toHaveLength(1);
      expect(day.items[0]?.selection).toEqual({
        band: "unknown_engagement",
        providerBandRank: 1,
      });
      expect(day.items[0]?.engagementMetrics).toBeUndefined();
    }
    expect(first.selectionRule).toMatchObject({
      unknownEngagementItemsPerProvider: 1,
      unknownBandOrder:
        "sha256_feed_item_id_asc_then_published_at_asc_then_feed_item_id_asc",
    });
  });

  it("rejects timestamp strings without an RFC3339 zone", () => {
    const rows = dates.map((date, index) => row(date, String(index), 10, 2));
    rows[0] = {
      ...rows[0]!,
      publishedAt: `${dates[0]}T12:00:00`,
    };

    expect(() => build(rows)).toThrow(
      "publishedAt must be RFC3339 with Z or an explicit UTC offset",
    );
  });

  it("binds the declared SHA-256 to canonical corpus payload bytes", () => {
    const corpus = build(
      dates.map((date, index) => row(date, String(index), index + 1, index)),
    );
    const payload = Object.fromEntries(
      Object.entries(corpus).filter(([key]) => key !== "corpusSha256"),
    );
    const expected = createHash("sha256")
      .update(JSON.stringify(canonicalize(payload)), "utf8")
      .digest("hex");

    expect(corpus.corpusSha256).toBe(expected);
    expect(corpus.schemaVersion).toBe(2);
    expect(corpus.dates).toEqual(dates);
    expect(corpus.selectionRule.generatedOutputFieldsUsed).toBe(false);
    expect(corpus.selectionRule).toMatchObject({
      selectionPolicyVersion,
      engagementStrengthFormula: "sum(weight * ln(1 + max(0, metric)))",
      engagementMetricWeights,
      providerRankRule: providerRankSelectionRule,
      highBandOrder:
        "engagement_strength_desc_then_published_at_asc_then_feed_item_id_asc",
      lowBandOrder:
        "engagement_strength_asc_then_published_at_asc_then_feed_item_id_asc",
      unknownBandOrder:
        "sha256_feed_item_id_asc_then_published_at_asc_then_feed_item_id_asc",
      lowBandExcludesHighBand: true,
      stringOrder: "utf16_code_unit_ascending",
    });
    expect(corpus.handling).toEqual({
      classification: "private_evaluation_input",
      repositoryCommitAllowed: false,
      sensitiveFields: [
        "titles",
        "body_previews",
        "author_handles",
        "url_paths",
      ],
    });
  });
});

function build(rows: readonly SourceOnlyCorpusRow[]) {
  return buildReaderSummaryMultiDayQualityCorpus({
    dates,
    tenantId: "00000000-0000-4000-8000-000000000001",
    workspaceId: "00000000-0000-4000-8000-000000000002",
    rows,
    highPerProvider: 1,
    lowPerProvider: 1,
  });
}

function row(
  collectionDate: string,
  suffix: string,
  points: number,
  comments: number,
): SourceOnlyCorpusRow {
  return {
    collectionDate,
    feedItemId: `feed-${suffix}`,
    providerKey: "hacker-news",
    canonicalUrl: `https://example.test/items/${suffix}?tracking=discarded`,
    title: `Source story ${suffix}`,
    bodyPreview: `Annotatable source-only preview ${suffix}`,
    authorHandle: `author-${suffix}`,
    publishedAt: `${collectionDate}T12:00:00.000Z`,
    observedAt: `${collectionDate}T12:05:00.000Z`,
    providerMetadata: {
      kind: "hacker_news_story",
      points,
      comments,
    },
  };
}

function metriclessRow(
  collectionDate: string,
  suffix: string,
): SourceOnlyCorpusRow {
  return {
    ...row(collectionDate, suffix, 0, 0),
    providerKey: "rss",
    providerMetadata: { kind: "rss_item" },
  };
}

function secretShapes() {
  return {
    github: `ghp_${"A".repeat(36)}`,
    legacyOpenAi: `sk-${"d".repeat(32)}`,
    jwt: `eyJ${"a".repeat(8)}.${"b".repeat(8)}.${"c".repeat(8)}`,
    aws: `AKIA${"0".repeat(16)}`,
    slack: `xoxb-${"1".repeat(12)}-${"a".repeat(12)}`,
    socialMonitor: `smk_${"m".repeat(48)}`,
    webhook: `whsec_${"w".repeat(48)}`,
    password: "obviously-fake-password-value",
    path: "obviously-fake-invite-token",
  } as const;
}

function baseArgs(requestedDates: readonly string[]): readonly string[] {
  return [
    ...requestedDates.flatMap((date) => ["--date", date]),
    "--tenant-id",
    "tenant",
    "--workspace-id",
    "workspace",
    "--out",
    "/tmp/corpus.json",
  ];
}

function collectKeys(value: unknown): readonly string[] {
  if (Array.isArray(value)) {
    return value.flatMap(collectKeys);
  }
  if (typeof value !== "object" || value === null) {
    return [];
  }
  return Object.entries(value).flatMap(([key, entry]) => [
    key,
    ...collectKeys(entry),
  ]);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => compareUtf16CodeUnits(left, right))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
}
