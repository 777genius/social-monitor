import {
  readerSummaryEditorialCurationRule,
  readerSummaryUnverifiedLegalSafetyDemotionRule,
} from "@social-monitor/summary/domain/policies/reader-summary-editorial-curation-policy";
import { publicReaderSummaryMatchedRules } from "@social-monitor/summary/features/shared/reader-summary-artifact-presenter";

import {
  type AtomicTopReadRankingReportOperations,
  failTopReadRankingReport,
  writeTopReadRankingReportAtomically,
} from "../check-reader-summary-top-read-ranking";

import {
  type RankingAuditTopRead,
  isEditorialSafetyExplainedLeadInversion,
  materialSameProviderMissedCandidates,
  severeSameProviderMissedCandidates,
} from "./reader-summary-ranking-audit";

describe("reader summary ranking audit", () => {
  it("flags a severe same-provider miss when a stronger item is unexplained", () => {
    const topReads = [
      item({
        title: "Weak general infrastructure post",
        providerKey: "hacker-news",
        signalScore: 1,
      }),
    ];
    const selectedPosts = [
      ...topReads,
      item({
        title: "Much stronger infrastructure post",
        providerKey: "hacker-news",
        signalScore: 1.7,
      }),
    ];

    const misses = materialSameProviderMissedCandidates({
      topReads,
      selectedPosts,
    });

    expect(misses).toHaveLength(1);
    expect(misses[0]).toMatchObject({
      providerKey: "hacker-news",
      selectedPostRank: 2,
      signalDelta: 0.7,
      explanation: "unexplained",
    });
    expect(severeSameProviderMissedCandidates(misses)).toHaveLength(1);
  });

  it("keeps stronger candidates non-severe when a core-topic tradeoff explains it", () => {
    const topReads = [
      item({
        title: "Claude Code MCP agent workflow",
        reason: "Claude Code and model context protocol developer tools",
        providerKey: "reddit",
        signalScore: 1,
      }),
    ];
    const selectedPosts = [
      ...topReads,
      item({
        title: "Higher engagement generic governance post",
        providerKey: "reddit",
        signalScore: 1.7,
      }),
    ];

    const misses = materialSameProviderMissedCandidates({
      topReads,
      selectedPosts,
    });

    expect(misses).toHaveLength(1);
    expect(misses[0]?.explanation).toBe("topic_tradeoff");
    expect(severeSameProviderMissedCandidates(misses)).toHaveLength(0);
  });

  it("does not compare candidates from providers missing in top reads", () => {
    const misses = materialSameProviderMissedCandidates({
      topReads: [
        item({
          title: "Hacker News item",
          providerKey: "hacker-news",
          signalScore: 1,
        }),
      ],
      selectedPosts: [
        item({
          title: "Reddit item with stronger signal",
          providerKey: "reddit",
          signalScore: 2,
        }),
      ],
    });

    expect(misses).toHaveLength(0);
  });

  it("treats canonical URLs as the same top read regardless of casing", () => {
    const topReads = [
      item({
        title: "Original X post",
        providerKey: "x-twitter",
        canonicalUrl: "HTTPS://X.COM/A/STATUS/1",
        signalScore: 1,
      }),
    ];
    const selectedPosts = [
      item({
        title: "Original X post",
        providerKey: "x-twitter",
        canonicalUrl: "https://x.com/a/status/1",
        signalScore: 2,
      }),
    ];

    expect(
      materialSameProviderMissedCandidates({ topReads, selectedPosts }),
    ).toHaveLength(0);
  });

  it("rejects forged legal wording without the builder safety marker", () => {
    const safeLead = item({
      title: "Claude Code token overhead compared with OpenCode",
      providerKey: "hacker-news",
      signalScore: 2.2,
    });
    const legalReport = item({
      title: "Reports say Apple sued OpenAI over alleged trade secret theft",
      providerKey: "reddit",
      signalScore: 2.9,
      reason: "The evidence does not include a primary court filing.",
    });

    expect(
      isEditorialSafetyExplainedLeadInversion({
        earlierRank: 1,
        laterRank: 2,
        earlier: safeLead,
        later: legalReport,
      }),
    ).toBe(false);
  });

  it("accepts only the marker on the stronger later safety-demoted candidate", () => {
    const safeLead = item({
      title: "Claude Code token overhead compared with OpenCode",
      providerKey: "hacker-news",
      signalScore: 2.2,
    });
    const safetyDemotedLegalReport = item({
      title: "Reports say Apple sued OpenAI over alleged trade secret theft",
      providerKey: "reddit",
      signalScore: 2.9,
      matchedRules: [readerSummaryUnverifiedLegalSafetyDemotionRule],
    });

    expect(
      isEditorialSafetyExplainedLeadInversion({
        earlierRank: 1,
        laterRank: 2,
        earlier: safeLead,
        later: safetyDemotedLegalReport,
      }),
    ).toBe(true);
  });

  it("does not treat generic editorial provenance as a safety demotion", () => {
    const safeLead = item({
      title: "Claude Code token overhead compared with OpenCode",
      providerKey: "hacker-news",
      signalScore: 2.2,
    });
    const curatedRead = item({
      title: "Developers compare coding-agent costs",
      providerKey: "reddit",
      signalScore: 2.9,
      matchedRules: [readerSummaryEditorialCurationRule],
    });

    expect(
      isEditorialSafetyExplainedLeadInversion({
        earlierRank: 1,
        laterRank: 2,
        earlier: safeLead,
        later: curatedRead,
      }),
    ).toBe(false);
  });

  it("rejects the safety marker in the wrong direction, rank, or strength", () => {
    const markedLead = item({
      title: "Marked first read",
      providerKey: "reddit",
      signalScore: 2.9,
      matchedRules: [readerSummaryUnverifiedLegalSafetyDemotionRule],
    });
    const ordinaryLaterRead = item({
      title: "Ordinary later read",
      providerKey: "hacker-news",
      signalScore: 3.2,
    });
    const markedWeakerLaterRead = item({
      title: "Marked weaker later read",
      providerKey: "reddit",
      signalScore: 1.9,
      matchedRules: [readerSummaryUnverifiedLegalSafetyDemotionRule],
    });

    expect(
      isEditorialSafetyExplainedLeadInversion({
        earlierRank: 1,
        laterRank: 2,
        earlier: markedLead,
        later: ordinaryLaterRead,
      }),
    ).toBe(false);
    expect(
      isEditorialSafetyExplainedLeadInversion({
        earlierRank: 2,
        laterRank: 3,
        earlier: ordinaryLaterRead,
        later: markedLead,
      }),
    ).toBe(false);
    expect(
      isEditorialSafetyExplainedLeadInversion({
        earlierRank: 1,
        laterRank: 2,
        earlier: markedLead,
        later: markedWeakerLaterRead,
      }),
    ).toBe(false);
  });

  it("strips the reserved safety marker from public reader content", () => {
    expect(
      publicReaderSummaryMatchedRules([
        readerSummaryUnverifiedLegalSafetyDemotionRule,
        readerSummaryEditorialCurationRule,
        "reader-visible-topic",
      ]),
    ).toEqual(["reader-visible-topic"]);
  });
});

describe("reader summary top-read ranking failed-report CLI", () => {
  it.each([
    { label: "neither flag", update: false, writeFailedReport: false },
    { label: "--update only", update: true, writeFailedReport: false },
    { label: "--write-failed-report only", update: false, writeFailedReport: true },
  ])("does not write a failed report with $label", (flags) => {
    const persistFailedReport = jest.fn();

    expect(() =>
      failTopReadRankingReport({ ...flags, persistFailedReport }),
    ).toThrow("Reader summary top-read ranking gates failed");
    expect(persistFailedReport).not.toHaveBeenCalled();
  });

  it("writes with both flags and still fails the ranking gate", () => {
    const persistFailedReport = jest.fn();

    expect(() =>
      failTopReadRankingReport({
        update: true,
        writeFailedReport: true,
        persistFailedReport,
      }),
    ).toThrow("Reader summary top-read ranking gates failed");
    expect(persistFailedReport).toHaveBeenCalledTimes(1);
  });

  it("propagates temporary-write errors and does not rename", () => {
    const writeError = new Error("temporary write failed");
    const operations = atomicOperations({
      writeFile: jest.fn(() => {
        throw writeError;
      }),
    });

    expect(() =>
      writeTopReadRankingReportAtomically({
        outputPath: "ops/evals/test-report.json",
        serialized: "{}\n",
        operations,
      }),
    ).toThrow(writeError);
    expect(operations.renameFile).not.toHaveBeenCalled();
    expect(operations.removeFile).toHaveBeenCalledTimes(1);
  });

  it("propagates rename errors and removes the temporary file", () => {
    const renameError = new Error("rename failed");
    const operations = atomicOperations({
      renameFile: jest.fn(() => {
        throw renameError;
      }),
    });

    expect(() =>
      writeTopReadRankingReportAtomically({
        outputPath: "ops/evals/test-report.json",
        serialized: "{}\n",
        operations,
      }),
    ).toThrow(renameError);
    expect(operations.writeFile).toHaveBeenCalledTimes(1);
    expect(operations.removeFile).toHaveBeenCalledTimes(1);
  });
});

function item(
  overrides: Partial<RankingAuditTopRead> & {
    readonly title: string;
    readonly providerKey: string;
    readonly signalScore: number;
  },
): RankingAuditTopRead {
  return {
    confidence: { level: "medium" },
    confirmedProviderKeys: [overrides.providerKey],
    citationIds: [],
    ...overrides,
  };
}

function atomicOperations(
  overrides: Partial<AtomicTopReadRankingReportOperations> = {},
): AtomicTopReadRankingReportOperations {
  return {
    makeDirectory: jest.fn(),
    writeFile: jest.fn(),
    renameFile: jest.fn(),
    removeFile: jest.fn(),
    ...overrides,
  };
}
