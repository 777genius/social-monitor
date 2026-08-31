import { ReaderSummaryPolicy } from "@social-monitor/summary/domain";
import type { ReaderSummaryPolicyRepositoryPort } from
  "@social-monitor/summary/ports";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import {
  HistoricalPromotionPolicyGuard,
  HistoricalPromotionPolicyGuardedEvidenceSelector,
} from
  "./reader-summary-promotion-v2-policy-guard";
import {
  historicalPromotionGenerationAuthorityJson,
  historicalPromotionGenerationAuthoritySha256,
  parseHistoricalPromotionGenerationAuthority,
} from "./reader-summary-promotion-v2-historical-generation-authority";

const tenant = tenantId("10000000-0000-4000-8000-000000000001");
const workspace = workspaceId("20000000-0000-4000-8000-000000000002");
const scope = { type: "workspace" } as const;

const policy = (tone: "concise" | "analytical") => ReaderSummaryPolicy.create({
  id: "30000000-0000-4000-8000-000000000003",
  tenantId: tenant,
  workspaceId: workspace,
  scope,
  language: "ru",
  format: "risk_brief",
  tone,
  maxStories: 7,
  includeRisks: false,
  includeInterestHighlights: false,
  includeRepeatedSignals: false,
  dedupeStrategy: "canonical_url_then_title",
  customInstructions: "Use the prepared non-default policy.",
  rulesVersion: "reader_summary.rules.custom.v8",
  createdAt: new Date("2026-08-01T00:00:00.000Z"),
  updatedAt: new Date("2026-08-30T00:00:00.000Z"),
});

const expected = {
  id: "30000000-0000-4000-8000-000000000003",
  language: "ru",
  format: "risk_brief",
  tone: "concise",
  maxStories: 7,
  includeRisks: false,
  includeInterestHighlights: false,
  includeRepeatedSignals: false,
  dedupeStrategy: "canonical_url_then_title",
  customInstructions: "Use the prepared non-default policy.",
  rulesVersion: "reader_summary.rules.custom.v8",
} as const;

describe("HistoricalPromotionPolicyGuard", () => {
  it("returns the exact prepared non-default policy", async () => {
    const delegate = repository(policy("concise"));
    const guard = new HistoricalPromotionPolicyGuard(delegate, expected);

    await expect(guard.findByScope({
      tenantId: tenant,
      workspaceId: workspace,
      scope,
    })).resolves.toBeTruthy();
  });

  it("fails closed when the policy changes before model execution", async () => {
    const guard = new HistoricalPromotionPolicyGuard(
      repository(policy("analytical")),
      expected,
    );

    await expect(guard.findByScope({
      tenantId: tenant,
      workspaceId: workspace,
      scope,
    })).rejects.toThrow("Prepared historical promotion policy changed");
  });

  it("prohibits policy mutation in historical promotion execution", () => {
    const guard = new HistoricalPromotionPolicyGuard(
      repository(policy("concise")),
      expected,
    );

    expect(() => guard.save(policy("concise"))).toThrow(
      "Historical promotion policy mutation is prohibited",
    );
  });

  it("hash-binds the complete prepared authority snapshot", () => {
    const authority = {
      policy: expected,
      execution: {
        release: "reader-summary-production-day.promotion-v2.v1",
        provider: "codex",
        model: "gpt-5.6-sol",
        reasoningEffort: "high",
        runtimeEngine: "subscription-runtime-cli",
        promptVersion: "reader_summary.prompt.v1",
        topicLabelerPromptVersion: "reader_summary.topic.v1",
        topicRelationPromptVersion: "reader_summary.relation.v1",
        evalDatasetVersion: "reader_summary.eval.v1",
        rankingPolicyVersion: "story_ranking_v10",
        promotionPolicyVersion: "reader_post_promotion.v2",
        maxEvidenceItems: 120,
        maxGeneratedStories: 15,
        topicLabelerMaxCandidates: 18,
        maxOutputTokens: 16_000,
      },
    } as const;
    const json = historicalPromotionGenerationAuthorityJson(authority);
    const digest = historicalPromotionGenerationAuthoritySha256(authority);

    expect(parseHistoricalPromotionGenerationAuthority(json, digest).policy)
      .toEqual(expected);
    expect(() => parseHistoricalPromotionGenerationAuthority(
      json.replace('"tone":"concise"', '"tone":"analytical"'),
      digest,
    )).toThrow("authority digest drifted");
  });

  it("rechecks policy before selector-side paid verifier work", async () => {
    const delegate = {
      select: jest.fn(async () => {
        throw new Error("selector must not run");
      }),
    };
    const selector = new HistoricalPromotionPolicyGuardedEvidenceSelector(
      delegate,
      new HistoricalPromotionPolicyGuard(
        repository(policy("analytical")),
        expected,
      ),
    );

    await expect(selector.select({
      tenantId: tenant,
      workspaceId: workspace,
      scope,
      period: {
        cadence: "daily",
        startedAt: new Date("2026-08-01T00:00:00.000Z"),
        endedAt: new Date("2026-08-02T00:00:00.000Z"),
        timezone: "UTC",
        periodKey:
          "daily:2026-08-01T00:00:00.000Z:2026-08-02T00:00:00.000Z:UTC",
      },
      maxItems: 120,
    })).rejects.toThrow("Prepared historical promotion policy changed");
    expect(delegate.select).not.toHaveBeenCalled();
  });
});

const repository = (
  value: ReaderSummaryPolicy | null,
): ReaderSummaryPolicyRepositoryPort => ({
  save: jest.fn(async () => undefined),
  findByScope: jest.fn(async () => value),
  listScheduled: jest.fn(async () => []),
});
