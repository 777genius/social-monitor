import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ReaderSummaryMultiDayGoldDay } from "@social-monitor/summary/domain";

import {
  buildReaderSummaryMultiDayQualityCorpus,
  readerSummaryMultiDayQualityCorpusFormat,
  serializeReaderSummaryMultiDayQualityCorpus,
  type SourceOnlyCorpusRow,
} from "../capture-reader-summary-multi-day-quality-corpus";
import {
  readerSummaryMultiDayAnnotationManifestFormat,
  validateReaderSummaryMultiDayGoldProvenanceFiles,
  validateSourceCorpusV2,
  type GoldV2WithProvenance,
} from "./reader-summary-multi-day-quality-provenance";
import { canonicalJson } from "./reader-summary-quality-eval-support";

const dates = [
  "2026-07-10",
  "2026-07-11",
  "2026-07-12",
  "2026-07-13",
  "2026-07-14",
] as const;

describe("reader summary multi-day quality provenance", () => {
  it("accepts an exact private corpus and fully adjudicated blind annotations", () => {
    const fixture = provenanceFixture();

    expect(() =>
      validateReaderSummaryMultiDayGoldProvenanceFiles({
        gold: fixture.gold,
        label: "gold fixture",
      }),
    ).not.toThrow();
  });

  it("rejects a corpus whose internal hash or private handling drifted", () => {
    const fixture = provenanceFixture();
    const corpus = JSON.parse(readFileSync(fixture.corpusPath, "utf8")) as {
      days: Array<{ items: Array<{ title: string }> }>;
      handling: { repositoryCommitAllowed: boolean };
    };
    corpus.days[0]!.items[0]!.title = "tampered after capture";
    writeJson(fixture.corpusPath, corpus);
    fixture.gold.provenance.corpus.sha256 = sha256File(fixture.corpusPath);

    expect(() => validateFixture(fixture)).toThrow("internal corpus SHA-256");

    const second = provenanceFixture();
    const unsafe = JSON.parse(readFileSync(second.corpusPath, "utf8")) as {
      handling: { repositoryCommitAllowed: boolean };
      corpusSha256: string;
      [key: string]: unknown;
    };
    unsafe.handling.repositoryCommitAllowed = true;
    const payload = Object.fromEntries(
      Object.entries(unsafe).filter(([key]) => key !== "corpusSha256"),
    );
    unsafe.corpusSha256 = createHash("sha256")
      .update(canonicalJson(payload), "utf8")
      .digest("hex");
    expect(() => validateSourceCorpusV2(unsafe)).toThrow("private handling");
  });

  it("rejects a corpus whose real path is inside any Git worktree", () => {
    const fixture = provenanceFixture();
    mkdirSync(join(fixture.root, ".git"));
    writeFileSync(
      join(fixture.root, ".git", "HEAD"),
      "ref: refs/heads/test\n",
    );
    const aliasPath = `${fixture.root}-corpus-alias.json`;
    symlinkSync(fixture.corpusPath, aliasPath);
    fixture.gold.provenance.corpus.path = aliasPath;

    expect(() => validateFixture(fixture)).toThrow(
      "must be outside every Git worktree",
    );
  });

  it.each([0o640, 0o604])(
    "rejects a group/world-readable annotation manifest mode %s",
    (mode) => {
      const fixture = provenanceFixture();
      chmodSync(fixture.annotationPath, mode);

      expect(() => validateFixture(fixture)).toThrow(
        "owner-readable, owner-only private file permissions",
      );
    },
  );

  it("rejects symlinked and Git-worktree annotation manifests", () => {
    const symlinked = provenanceFixture();
    const annotationAlias = `${symlinked.annotationPath}.alias`;
    symlinkSync(symlinked.annotationPath, annotationAlias);
    symlinked.gold.provenance.annotationManifest.path = annotationAlias;
    expect(() => validateFixture(symlinked)).toThrow("must not be a symlink");

    const tracked = provenanceFixture();
    tracked.gold.provenance.annotationManifest.path = join(
      process.cwd(),
      "package.json",
    );
    expect(() => validateFixture(tracked)).toThrow(
      "must be outside every Git worktree",
    );
  });

  it("rescans a loaded corpus for high-confidence secrets", () => {
    const fixture = provenanceFixture();
    rewriteCorpus(fixture, (corpus) => {
      corpus.days[0]!.items[0]!.title = `sk-${"A".repeat(48)}`;
    });

    expect(() => validateFixture(fixture)).toThrow(
      "Corpus contains high-confidence secret",
    );

    for (const secret of [`smk_${"m".repeat(48)}`, `whsec_${"w".repeat(48)}`]) {
      const projectSecretFixture = provenanceFixture();
      rewriteCorpus(projectSecretFixture, (corpus) => {
        corpus.days[0]!.items[0]!.title = secret;
      });
      expect(() => validateFixture(projectSecretFixture)).toThrow(
        "Corpus contains high-confidence secret",
      );
    }
  });

  it("rejects capture-policy mutations in bands, ranks, order and counts", () => {
    const cases: readonly {
      mutate: (corpus: MutableCorpus) => void;
      expected: string;
    }[] = [
      {
        mutate: (corpus) => {
          const day = corpus.days[0]!;
          const item = day.items.find(
            (candidate) => candidate.providerKey === "rss",
          )!;
          const count = day.providerCounts.find(
            (candidate) => candidate.providerKey === "rss",
          )!;
          item.selection.band = "high_engagement";
          count.highEngagementCount = 1;
          count.unknownEngagementCount = 0;
        },
        expected: "engagement band does not match captured metrics",
      },
      {
        mutate: (corpus) => {
          const day = corpus.days[0]!;
          const item = day.items.find(
            (candidate) => candidate.providerKey === "hacker-news",
          )!;
          const count = day.providerCounts.find(
            (candidate) => candidate.providerKey === "hacker-news",
          )!;
          item.selection.band = "low_engagement";
          count.highEngagementCount = 0;
          count.lowEngagementCount = 1;
        },
        expected: "invalid provider counts",
      },
      {
        mutate: (corpus) => {
          corpus.days[0]!.items[0]!.selection.providerBandRank = 2;
        },
        expected: "provider band ranks are inconsistent",
      },
      {
        mutate: (corpus) => {
          corpus.days[0]!.items.reverse();
        },
        expected: "item order is inconsistent with capture policy",
      },
      {
        mutate: (corpus) => {
          corpus.days[0]!.actualItemCount = 1;
        },
        expected: "invalid corpus day",
      },
    ];

    for (const testCase of cases) {
      const fixture = provenanceFixture();
      rewriteCorpus(fixture, testCase.mutate);
      expect(() => validateFixture(fixture)).toThrow(testCase.expected);
    }
  });

  it("rejects annotations that omit a corpus item or corpus hash binding", () => {
    const fixture = provenanceFixture();
    const manifest = fixture.annotationManifest;
    manifest.corpus.corpusSha256 = "f".repeat(64);
    writeJson(fixture.annotationPath, manifest);
    fixture.gold.provenance.annotationManifest.sha256 = sha256File(
      fixture.annotationPath,
    );
    expect(() => validateFixture(fixture)).toThrow(
      "unsupported annotation-manifest-v2",
    );

    const omitted = provenanceFixture();
    (
      omitted.annotationManifest.annotations[0]!.days[0] as unknown as {
        storyExpectations: unknown[];
      }
    ).storyExpectations.pop();
    writeJson(omitted.annotationPath, omitted.annotationManifest);
    omitted.gold.provenance.annotationManifest.sha256 = sha256File(
      omitted.annotationPath,
    );
    expect(() => validateFixture(omitted)).toThrow(
      "classify every selected corpus item",
    );
  });

  it("rejects arbitrary annotation JSON and adjudication that differs from gold", () => {
    const fixture = provenanceFixture();
    writeJson(fixture.annotationPath, { annotations: true });
    fixture.gold.provenance.annotationManifest.sha256 = sha256File(
      fixture.annotationPath,
    );
    expect(() => validateFixture(fixture)).toThrow(
      "unsupported annotation-manifest-v2",
    );

    const drifted = provenanceFixture();
    const rankingExpectations = (
      drifted.annotationManifest.adjudication.days[0] as unknown as {
        rankingExpectations: Array<{
          feedItemId: string;
          expected: "top_read" | "exclude";
          expectedRank?: number;
        }>;
      }
    ).rankingExpectations;
    rankingExpectations[0] = {
      feedItemId: rankingExpectations[0]!.feedItemId,
      expected: "exclude",
    };
    writeJson(drifted.annotationPath, drifted.annotationManifest);
    drifted.gold.provenance.annotationManifest.sha256 = sha256File(
      drifted.annotationPath,
    );
    expect(() => validateFixture(drifted)).toThrow(
      "adjudicated output does not match gold v2",
    );
  });

  it("rejects malformed JSON and incomplete cross-source decisions", () => {
    const malformed = provenanceFixture();
    writeFileSync(malformed.annotationPath, "{not-json");
    malformed.gold.provenance.annotationManifest.sha256 = sha256File(
      malformed.annotationPath,
    );
    expect(() => validateFixture(malformed)).toThrow(SyntaxError);

    const incomplete = provenanceFixture();
    (
      incomplete.annotationManifest.annotations[0]!.days[0] as unknown as {
        crossSourceExpectations: unknown[];
      }
    ).crossSourceExpectations.pop();
    writeJson(incomplete.annotationPath, incomplete.annotationManifest);
    incomplete.gold.provenance.annotationManifest.sha256 = sha256File(
      incomplete.annotationPath,
    );
    expect(() => validateFixture(incomplete)).toThrow(
      "classify every story key for cross-source evidence",
    );
  });

  it("allows repeated story keys to express a reviewed duplicate cluster", () => {
    const fixture = provenanceFixture();
    const allReviewedDays = [
      fixture.gold.days,
      ...fixture.annotationManifest.annotations.map((item) => item.days),
      fixture.annotationManifest.adjudication.days,
    ];
    for (const reviewedDays of allReviewedDays) {
      const day = reviewedDays[0]! as unknown as {
        storyExpectations: Array<{ expectedStoryKey: string }>;
        crossSourceExpectations: Array<{
          expectedStoryKey: string;
          expected: boolean;
        }>;
      };
      day.storyExpectations[1]!.expectedStoryKey =
        day.storyExpectations[0]!.expectedStoryKey;
      day.crossSourceExpectations = [
        {
          expectedStoryKey: day.storyExpectations[0]!.expectedStoryKey,
          expected: true,
        },
      ];
    }
    writeJson(fixture.annotationPath, fixture.annotationManifest);
    fixture.gold.provenance.annotationManifest.sha256 = sha256File(
      fixture.annotationPath,
    );

    expect(() => validateFixture(fixture)).not.toThrow();
  });

  it("rejects cross-source labels that contradict reviewed providers", () => {
    const falsePositive = provenanceFixture();
    const falsePositiveExpectation = falsePositive.annotationManifest
      .annotations[0]!.days[0]!.crossSourceExpectations[0] as unknown as {
      expected: boolean;
    };
    falsePositiveExpectation.expected = true;
    writeJson(falsePositive.annotationPath, falsePositive.annotationManifest);
    falsePositive.gold.provenance.annotationManifest.sha256 = sha256File(
      falsePositive.annotationPath,
    );
    expect(() => validateFixture(falsePositive)).toThrow(
      "cross-source annotation contradicts reviewed providers",
    );

    const falseNegative = provenanceFixture();
    const day = falseNegative.annotationManifest.annotations[0]!
      .days[0]! as unknown as {
      storyExpectations: Array<{ expectedStoryKey: string }>;
      crossSourceExpectations: Array<{
        expectedStoryKey: string;
        expected: boolean;
      }>;
    };
    day.storyExpectations[1]!.expectedStoryKey =
      day.storyExpectations[0]!.expectedStoryKey;
    day.crossSourceExpectations = [
      {
        expectedStoryKey: day.storyExpectations[0]!.expectedStoryKey,
        expected: false,
      },
    ];
    writeJson(falseNegative.annotationPath, falseNegative.annotationManifest);
    falseNegative.gold.provenance.annotationManifest.sha256 = sha256File(
      falseNegative.annotationPath,
    );
    expect(() => validateFixture(falseNegative)).toThrow(
      "cross-source annotation contradicts reviewed providers",
    );
  });
});

function provenanceFixture() {
  const root = mkdtempSync(join(tmpdir(), "multi-day-provenance-"));
  const corpusPath = join(root, "corpus.json");
  const annotationPath = join(root, "annotations.json");
  const corpus = buildReaderSummaryMultiDayQualityCorpus({
    dates,
    tenantId: "00000000-0000-7000-8000-000000000001",
    workspaceId: "00000000-0000-7000-8000-000000000002",
    rows: dates.flatMap(sourceRows),
    highPerProvider: 1,
    lowPerProvider: 1,
  });
  writeFileSync(
    corpusPath,
    serializeReaderSummaryMultiDayQualityCorpus(corpus),
  );
  const goldDays = corpus.days.map((day) =>
    reviewedDay(day.collectionDate, day.items),
  );
  const annotationManifest = {
    schemaVersion: 2,
    artifactFormat: readerSummaryMultiDayAnnotationManifestFormat,
    corpus: {
      artifactFormat: readerSummaryMultiDayQualityCorpusFormat,
      corpusSha256: corpus.corpusSha256,
    },
    dates: [...dates],
    annotations: ["a", "b"].map((suffix) => ({
      annotatorIdSha256: suffix.repeat(64),
      independent: true,
      blindToGeneratedOutputs: true,
      days: structuredClone(goldDays),
    })),
    adjudication: {
      strategy: "independent-review-then-consensus",
      version: "v2",
      adjudicatorIdSha256: "c".repeat(64),
      days: structuredClone(goldDays),
    },
  };
  writeJson(annotationPath, annotationManifest);
  const gold: MutableGold = {
    provenance: {
      corpus: {
        path: corpusPath,
        artifactFormat: readerSummaryMultiDayQualityCorpusFormat,
        sha256: sha256File(corpusPath),
      },
      annotationManifest: {
        path: annotationPath,
        sha256: sha256File(annotationPath),
      },
      annotatorCount: 2,
      blindToGeneratedOutputs: true,
      adjudication: {
        strategy: annotationManifest.adjudication.strategy,
        version: annotationManifest.adjudication.version,
      },
    },
    days: structuredClone(goldDays),
  };

  return { root, corpusPath, annotationPath, annotationManifest, gold };
}

type MutableCorpus = {
  corpusSha256: string;
  days: Array<{
    actualItemCount: number;
    selectedItemCount: number;
    providerCounts: Array<{
      providerKey: string;
      actualItemCount: number;
      selectedItemCount: number;
      highEngagementCount: number;
      lowEngagementCount: number;
      unknownEngagementCount: number;
    }>;
    items: Array<{
      providerKey: string;
      title: string;
      engagementMetrics?: Record<string, number>;
      selection: {
        band: "high_engagement" | "low_engagement" | "unknown_engagement";
        providerBandRank: number;
      };
    }>;
  }>;
  [key: string]: unknown;
};

function rewriteCorpus(
  fixture: ReturnType<typeof provenanceFixture>,
  mutate: (corpus: MutableCorpus) => void,
): void {
  const corpus = JSON.parse(
    readFileSync(fixture.corpusPath, "utf8"),
  ) as MutableCorpus;
  mutate(corpus);
  const payload = Object.fromEntries(
    Object.entries(corpus).filter(([key]) => key !== "corpusSha256"),
  );
  corpus.corpusSha256 = createHash("sha256")
    .update(canonicalJson(payload), "utf8")
    .digest("hex");
  writeJson(fixture.corpusPath, corpus);
  fixture.gold.provenance.corpus.sha256 = sha256File(fixture.corpusPath);
}

type MutableGold = {
  provenance: {
    corpus: { path: string; artifactFormat: string; sha256: string };
    annotationManifest: { path: string; sha256: string };
    annotatorCount: number;
    blindToGeneratedOutputs: true;
    adjudication: { strategy: string; version: string };
  };
  days: ReaderSummaryMultiDayGoldDay[];
};

function validateFixture(fixture: ReturnType<typeof provenanceFixture>): void {
  validateReaderSummaryMultiDayGoldProvenanceFiles({
    gold: fixture.gold as GoldV2WithProvenance,
    label: "gold fixture",
  });
}

function sourceRows(
  date: string,
  index: number,
): readonly SourceOnlyCorpusRow[] {
  return [
    {
      collectionDate: date,
      feedItemId: `hn-${index}`,
      providerKey: "hacker-news",
      canonicalUrl: `https://example.test/hn/${index}`,
      title: `HN ${index}`,
      bodyPreview: "Source body",
      authorHandle: "author",
      publishedAt: `${date}T12:00:00.000Z`,
      observedAt: `${date}T12:05:00.000Z`,
      providerMetadata: {
        kind: "hacker_news_story",
        points: 100,
        comments: 10,
      },
    },
    {
      collectionDate: date,
      feedItemId: `rss-${index}`,
      providerKey: "rss",
      canonicalUrl: `https://example.test/rss/${index}`,
      title: `RSS ${index}`,
      bodyPreview: "Source body without engagement",
      authorHandle: null,
      publishedAt: `${date}T13:00:00.000Z`,
      observedAt: `${date}T13:05:00.000Z`,
      providerMetadata: { kind: "rss_item" },
    },
  ];
}

function reviewedDay(
  collectionDate: string,
  items: readonly {
    readonly feedItemId: string;
    readonly providerKey: string;
  }[],
): ReaderSummaryMultiDayGoldDay {
  const storyExpectations = items.map((item, index) => ({
    feedItemId: item.feedItemId,
    expectedStoryKey: `story-${index}`,
    providerKey: item.providerKey,
  }));
  return {
    collectionDate,
    storyExpectations,
    crossSourceExpectations: storyExpectations.map((item) => ({
      expectedStoryKey: item.expectedStoryKey,
      expected: false,
    })),
    rankingExpectations: items.map((item, index) =>
      index === 0
        ? { feedItemId: item.feedItemId, expected: "top_read", expectedRank: 1 }
        : { feedItemId: item.feedItemId, expected: "exclude" },
    ),
    narrativeExpectations: [
      {
        expectedStoryKey: storyExpectations[0]!.expectedStoryKey,
        expectedKind: "lead",
      },
    ],
  };
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
