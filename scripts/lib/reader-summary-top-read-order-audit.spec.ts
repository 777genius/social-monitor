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
    const topReads = [
      read("Claude Code token overhead compared with OpenCode", "hacker-news"),
      read(
        "Reports say Apple sued OpenAI over alleged trade secret theft",
        "reddit",
        "The evidence does not include a primary court filing.",
      ),
    ];

    expect(
      weakTopReadOutrankingStrongSocialRows({ rows, topReads }),
    ).toHaveLength(0);
  });

  it("still rejects an unexplained weak read above a stronger social read", () => {
    const rows = [
      row(1, "hacker-news", 2.2, "low"),
      row(2, "reddit", 2.96, "medium"),
    ];
    const topReads = [
      read("Claude Code token overhead compared with OpenCode", "hacker-news"),
      read("Developers compare coding agent costs", "reddit"),
    ];

    expect(
      weakTopReadOutrankingStrongSocialRows({ rows, topReads }),
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
      ),
    ];

    expect(weakTopReadOutrankingStrongSocialRows({ rows, topReads })).toEqual([
      rows[1],
    ]);
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
): RankingAuditTopRead => ({
  title,
  providerKey,
  reason,
  signalScore: 2,
  confidence: { level: "medium" },
  confirmedProviderKeys: [providerKey],
  citationIds: ["c1"],
});
