import type { JsonObject } from "@social-monitor/shared-kernel";

import {
  parseGitHubTrendingBackfillOptions,
  missingGitHubTrendingObservations,
  strongestGitHubTrendingObservations,
  utcDateWindow,
  type GitHubTrendingSourceObservation,
} from "./github-trending-feed-backfill-support";

describe("GitHub Trending feed backfill support", () => {
  it("defaults to dry-run and accepts explicit apply", () => {
    expect(
      parseGitHubTrendingBackfillOptions(["--date", "2026-07-10"]),
    ).toEqual({
      date: "2026-07-10",
      apply: false,
    });
    expect(
      parseGitHubTrendingBackfillOptions(["--apply", "--date", "2026-07-10"]),
    ).toEqual({ date: "2026-07-10", apply: true });
  });

  it("rejects invalid dates, duplicate mutation flags and unknown options", () => {
    expect(() =>
      parseGitHubTrendingBackfillOptions(["--date", "2026-02-30"]),
    ).toThrow();
    expect(() =>
      parseGitHubTrendingBackfillOptions([
        "--date",
        "2026-07-10",
        "--apply",
        "--apply",
      ]),
    ).toThrow();
    expect(() =>
      parseGitHubTrendingBackfillOptions(["--date", "2026-07-10", "--all"]),
    ).toThrow();
  });

  it("creates an exact UTC day window", () => {
    expect(utcDateWindow("2026-07-10")).toEqual({
      start: new Date("2026-07-10T00:00:00.000Z"),
      endExclusive: new Date("2026-07-11T00:00:00.000Z"),
    });
  });

  it("keeps the strongest then latest observation per repository and binding", () => {
    const observations = [
      observation(
        "older-strong",
        "binding-a",
        "Org/Repo",
        50,
        "2026-07-10T08:00:00.000Z",
      ),
      observation(
        "newer-weak",
        "binding-a",
        "org/repo",
        40,
        "2026-07-10T12:00:00.000Z",
      ),
      observation(
        "newer-strong",
        "binding-a",
        "ORG/REPO",
        50,
        "2026-07-10T13:00:00.000Z",
      ),
      observation(
        "other-binding",
        "binding-b",
        "org/repo",
        10,
        "2026-07-10T14:00:00.000Z",
      ),
    ];

    expect(
      strongestGitHubTrendingObservations(observations).selected.map(
        (row) => row.id,
      ),
    ).toEqual(["newer-strong", "other-binding"]);
  });

  it("falls back to canonical GitHub URLs and rejects non-repository URLs", () => {
    const valid = observation(
      "url",
      "binding-a",
      undefined,
      5,
      "2026-07-10T08:00:00.000Z",
    );
    const invalid = {
      ...valid,
      id: "invalid",
      canonicalUrl: "https://example.com/org/repo",
    };

    const result = strongestGitHubTrendingObservations([valid, invalid]);
    expect(result.selected.map((row) => row.id)).toEqual(["url"]);
    expect(result.invalidCanonicalRepositoryCount).toBe(1);
  });

  it("skips repositories already visible for the same binding", () => {
    const selected = [
      observation(
        "selected-a",
        "binding-a",
        "org/repo",
        5,
        "2026-07-10T08:00:00.000Z",
      ),
      observation(
        "selected-b",
        "binding-b",
        "org/repo",
        5,
        "2026-07-10T08:00:00.000Z",
      ),
    ];
    const existing = [
      observation(
        "existing",
        "binding-a",
        "ORG/REPO",
        1,
        "2026-07-10T07:00:00.000Z",
      ),
    ];

    const result = missingGitHubTrendingObservations(selected, existing);
    expect(result.missing.map((row) => row.id)).toEqual(["selected-b"]);
    expect(result.alreadyPresent).toBe(1);
  });
});

const observation = (
  id: string,
  sourceBindingId: string,
  fullName: string | undefined,
  starsGained: number,
  observedAt: string,
): GitHubTrendingSourceObservation => ({
  id,
  sourceBindingId,
  canonicalUrl: "https://github.com/org/repo",
  observedAt: new Date(observedAt),
  metadata: {
    ...(fullName === undefined ? {} : { repository: { fullName } }),
    trending: { starsGained, rank: 1 },
  } satisfies JsonObject,
});
