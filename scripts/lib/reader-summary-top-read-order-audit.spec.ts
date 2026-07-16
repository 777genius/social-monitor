import {
  readerSummaryEditorialCurationRule,
  readerSummaryUnverifiedLegalSafetyDemotionRule,
} from "@social-monitor/summary/domain/policies/reader-summary-editorial-curation-policy";

import {
  type TopReadOrderAuditRow,
  weakTopReadOutrankingStrongSocialRows,
} from "./reader-summary-top-read-order-audit";
import type { RankingAuditTopRead } from "./reader-summary-ranking-audit";

describe("reader summary top-read order audit", () => {
  it("does not penalize a safe lead placed above unverified legal reporting", () => {
    const rows = [
      row(1, "hacker-news", 2.2, "low"),
      row(2, "reddit", 2.96, "medium"),
    ];
    const persistedTopReads = [
      read("Claude Code token overhead compared with OpenCode", "hacker-news"),
      read(
        "Reports say Apple sued OpenAI over alleged trade secret theft",
        "reddit",
        "The evidence does not include a primary court filing.",
        [readerSummaryUnverifiedLegalSafetyDemotionRule],
      ),
    ];
    const topReads = persistedTopReads.map((read) => ({
      ...read,
      matchedRules: [],
    }));

    expect(
      weakTopReadOutrankingStrongSocialRows({
        rows,
        topReads,
        persistedTopReads,
      }),
    ).toHaveLength(0);
  });

  it("fails closed on a marker forged through the public-only channel", () => {
    const rows = [
      row(1, "hacker-news", 2.2, "low"),
      row(2, "reddit", 2.96, "medium"),
    ];
    const publicTopReads = [
      read("Claude Code token overhead compared with OpenCode", "hacker-news"),
      read(
        "Reports say Apple sued OpenAI over alleged trade secret theft",
        "reddit",
        "The evidence does not include a primary court filing.",
        [readerSummaryUnverifiedLegalSafetyDemotionRule],
      ),
    ];

    expect(
      weakTopReadOutrankingStrongSocialRows({
        rows,
        topReads: publicTopReads,
      }),
    ).toEqual([rows[0]]);
  });

  it("rejects forged legal wording without the builder safety marker", () => {
    const rows = [
      row(1, "hacker-news", 2.2, "low"),
      row(2, "reddit", 2.96, "medium"),
    ];
    const topReads = [
      read("Claude Code token overhead compared with OpenCode", "hacker-news"),
      read(
        "Reports say Apple sued OpenAI over alleged trade secret theft",
        "reddit",
        "The evidence does not include a primary court filing.",
      ),
    ];

    expect(
      weakTopReadOutrankingStrongSocialRows({
        rows,
        topReads,
        persistedTopReads: topReads,
      }),
    ).toHaveLength(1);
  });

  it("does not accept generic editorial provenance as safety demotion", () => {
    const rows = [
      row(1, "hacker-news", 2.2, "low"),
      row(2, "reddit", 2.96, "medium"),
    ];
    const topReads = [
      read("Claude Code token overhead compared with OpenCode", "hacker-news"),
      read(
        "Developers compare coding agent costs",
        "reddit",
        "Detailed source-backed reason.",
        [readerSummaryEditorialCurationRule],
      ),
    ];

    expect(
      weakTopReadOutrankingStrongSocialRows({
        rows,
        topReads,
        persistedTopReads: topReads,
      }),
    ).toHaveLength(1);
  });

  it("rejects the safety marker when it points in the wrong direction", () => {
    const rows = [
      row(1, "hacker-news", 2.2, "low"),
      row(2, "reddit", 2.96, "medium"),
    ];
    const topReads = [
      read(
        "Marked weak lead",
        "hacker-news",
        "Detailed source-backed reason.",
        [readerSummaryUnverifiedLegalSafetyDemotionRule],
      ),
      read("Stronger later discussion", "reddit"),
    ];

    expect(
      weakTopReadOutrankingStrongSocialRows({
        rows,
        topReads,
        persistedTopReads: topReads,
      }),
    ).toHaveLength(1);
  });

  it("keeps the legal exception restricted to the article lead", () => {
    const rows = [
      row(1, "hacker-news", 3.1, "high"),
      row(2, "hacker-news", 2.2, "low"),
      row(3, "reddit", 2.96, "medium"),
    ];
    const topReads = [
      read("Strong first read", "hacker-news"),
      read("Weak second read", "hacker-news"),
      read(
        "Reports say Apple sued OpenAI over alleged trade secret theft",
        "reddit",
        "The evidence does not include a primary court filing.",
        [readerSummaryUnverifiedLegalSafetyDemotionRule],
      ),
    ];

    expect(
      weakTopReadOutrankingStrongSocialRows({
        rows,
        topReads,
        persistedTopReads: topReads,
      }),
    ).toEqual([rows[1]]);
  });

  it("uses explicit row indexes when audit rows arrive reordered", () => {
    const rows = [
      row(2, "reddit", 2.96, "medium"),
      row(1, "hacker-news", 2.2, "low"),
    ];
    const topReads = [
      read("Weak first read", "hacker-news"),
      read("Stronger later discussion", "reddit"),
    ];

    expect(
      weakTopReadOutrankingStrongSocialRows({
        rows,
        topReads,
        persistedTopReads: topReads,
      }),
    ).toEqual([rows[1]]);
  });

  it("fails closed when a sparse candidate index has no persisted read", () => {
    const rows = [
      row(1, "hacker-news", 2.2, "low"),
      row(3, "reddit", 2.96, "medium"),
    ];
    const topReads = [
      read("Weak first read", "hacker-news"),
      read(
        "Unrelated second read carrying a marker",
        "rss",
        "Detailed source-backed reason.",
        [readerSummaryUnverifiedLegalSafetyDemotionRule],
      ),
    ];

    expect(
      weakTopReadOutrankingStrongSocialRows({
        rows,
        topReads,
        persistedTopReads: topReads,
      }),
    ).toEqual([rows[0]]);
  });
});

const row = (
  index: number,
  providerKey: string,
  signalScore: number,
  confidenceLevel: TopReadOrderAuditRow["confidenceLevel"],
): TopReadOrderAuditRow => ({
  index,
  providerKey,
  signalScore,
  confidenceLevel,
  citationCount: 1,
  confirmedProviderCount: 1,
  selectionSignals: ["high_signal_score"],
  riskSignals: confidenceLevel === "low" ? ["low_confidence"] : [],
});

const read = (
  title: string,
  providerKey: string,
  reason = "Detailed source-backed reason.",
  matchedRules: readonly string[] = [],
): RankingAuditTopRead => ({
  title,
  providerKey,
  reason,
  signalScore: 2,
  confidence: { level: "medium" },
  confirmedProviderKeys: [providerKey],
  citationIds: ["c1"],
  matchedRules,
});
