import { fixtureHeadline } from "../../test/support/promotion-content-assessment";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { classifyFeedPromotionEligibility } from "@social-monitor/feed/domain";
import { FixedClock, tenantId, workspaceId } from "@social-monitor/shared-kernel";
import type { PromotionFeedItemSnapshotRepositoryPort, FeedItemReadRepositoryPort } from "@social-monitor/feed/ports";
import type { ConfiguredInterestScope } from "@social-monitor/relevance/ports";
import { fixture } from "../../test/support/promotion-content-assessment";
import { refreshManifest, refreshNow } from "./reader-summary-new-input-refresh.spec-support";
import { guardedRefreshRuntime, refreshCaptureModelControls } from "./reader-summary-new-input-refresh-model";
import { completedRefreshModelRequest } from "./reader-summary-new-input-refresh-model.spec-support";
import { createRefreshAssessmentReviewer } from "./reader-summary-new-input-refresh-assessment";
import { createReaderSummaryDailyCapturePublicationWiring } from "./reader-summary-daily-story-relation-verifier";
import { RefreshPairedExport } from "./reader-summary-new-input-refresh-paired-export";
import { refreshPeriod } from "./reader-summary-new-input-refresh-capture";
import { sourceContentAssessmentPurpose } from "./reader-summary-new-input-refresh-assessment-runtime";
import type { AgentRuntimeTaskCommand } from "@social-monitor/summary/ports";

// Every source, native attestation and semantic response here is synthetic.
export function pairedFixture(options: { capture?: boolean; path?: string; supplemental?: number;
  extra?: number; relationCase?: boolean; omitPreparation?: boolean; response?: (command: AgentRuntimeTaskCommand) => Record<string, unknown> } = {}) {
  const manifest = refreshManifest();
  const scope = { tenantId: tenantId(manifest.tenantId), workspaceId: workspaceId(manifest.workspaceId) };
  const common = { ...scope, publishedAt: new Date("2026-09-03T08:00:00Z"), observedAt: new Date("2026-09-03T08:01:00Z") };
  const primary = ["promote", "reject", "abstain", "hard-gate", ...Array.from({ length: options.extra ?? 0 }, (_, i) => `z-${i}`)]
    .map((id) => fixture(id, options.relationCase && id === "promote" ? "hacker-news" : "reddit", { ...common,
      ...(options.relationCase && ["promote", "reject"].includes(id) ? {
        canonicalUrl: `https://${id === "promote" ? "hacker-news" : "reddit"}.example.test/${id}`,
        providerMetadata: { kind: id === "promote" ? "hacker_news_story" : "reddit_post",
          ...(id === "promote" ? { points: 210 } : { score: 190 }),
          promotionAuthority: { official: true, trusted: true, attestedBy: "source_catalog" },
          interestQuerySnapshot: { query: "TypeScript, developer tools" } },
        title: id === "promote" ? "TypeScript compiler rewrite moves to Go" : "Go rewrite of the TypeScript compiler reaches developers",
        bodyPreview: id === "promote" ? "Microsoft details the plan for AI-assisted editors." : "The engineering team explains the pipeline for coding agents.",
      } : { title: `Editor extension ${id}` }) }));
  const supplemental = Array.from({ length: options.supplemental ?? 12 }, (_, i) => fixture(`github-${i}`, "github-trending-page", {
    ...common, canonicalUrl: `https://github.com/synthetic/repo-${i}`,
    title: `synthetic/repo-${i} is #${i + 1} on GitHub Trending`,
    providerMetadata: { kind: "github_trending_page_repository",
      repository: { fullName: `synthetic/repo-${i}`, totalStars: 20_000, forksCount: 500 },
      trending: { rank: i + 1, starsGained: 100 + i, window: "daily" } },
  }));
  const raw = { ok: true as const, exhausted: true as const, physicalRowsRead: primary.length + supplemental.length,
    candidates: primary.map((item) => {
      const canonical = classifyFeedPromotionEligibility(item.toSnapshot());
      if (!canonical.eligible) throw new Error("Synthetic metric fixture invalid");
      return { item, canonical, metricAuthority: { observedAt: new Date(manifest.observedThrough),
        regressionState: item.toSnapshot().id === "hard-gate" ? "unresolved_regression" as const : "stable" as const } };
    }), supplementalItems: supplemental,
    sourceContent: [...primary, ...supplemental].map((item) => ({ feedItemId: item.toSnapshot().id,
      sourceItemId: item.toSnapshot().sourceItemId, body: item.toSnapshot().bodyPreview! })),
  };
  const feed: FeedItemReadRepositoryPort & PromotionFeedItemSnapshotRepositoryPort = {
    list: jest.fn(async () => { throw new Error("Unexpected list"); }), findById: jest.fn(async () => null),
    readPromotionSnapshot: jest.fn(async () => raw),
  };
  const clock = new FixedClock(refreshNow);
  const parent = options.path ? undefined : mkdtempSync(join(tmpdir(), "paired-export-synthetic-"));
  const path = options.path ?? join(parent!, "capture");
  const capture = options.capture === false ? undefined : new RefreshPairedExport(path, manifest, () => clock.now().getTime());
  const delegate = { checkHealth: jest.fn(), runTask: jest.fn(async (command: AgentRuntimeTaskCommand) =>
    completedRefreshModelRequest(command, options.response?.(command) ?? syntheticOutput(command, options.relationCase))) };
  const runtime = guardedRefreshRuntime({ delegate, manifest, now: () => clock.now().getTime(),
    assertLocal: () => undefined, assertCurrent: async () => undefined, record: () => undefined,
    ...(capture ? { capture: capture.model, captureFailure: () => capture.fail("model_callback_failed") } : {}) });
  const assessment = createRefreshAssessmentReviewer({ env: {}, runtime, clock,
    ...(capture ? { capture: capture.assessment, captureCanonical: (value) => capture.canonicalBindings(value) } : {}) });
  capture?.assessmentCompletion(() => assessment.assertCaptureComplete());
  capture?.controls({ manifest, model: refreshCaptureModelControls({}), synthetic: true });
  const interests = { readCurrent: jest.fn(async (query: ConfiguredInterestScope) =>
    ({ kind: "available" as const, interest: { ...query, query: options.relationCase ? "TypeScript Cursor Claude coding agents" : "developer tooling and secure coding" } })) };
  const wiring = createReaderSummaryDailyCapturePublicationWiring({
    configuredInterests: capture?.interests(interests) ?? interests, feedItems: capture?.feed(feed) ?? feed,
    qualityReviewer: assessment, replay: null, summaryClient: {} as never, clock,
    attestationSink: { record: () => undefined }, summaryModelMode: "agent-runtime", env: {}, agentRuntimeClient: runtime,
    storyRelationVerifierGuard: runtime,
    ...(capture ? { preparationObserver: { ...capture.observer,
      ...(options.omitPreparation ? { beforePolicy: () => { throw new Error("Synthetic P1 callback loss"); } } : {}) },
      relationCapture: capture.relations, rankCommandCapture: { captured: (value) => capture.rankCommand(value), failed: () => capture.fail("rank_command_callback_failed") } } : {}),
  });
  const query = { ...scope, scope: { type: "workspace" as const }, period: refreshPeriod(manifest.date),
    maxItems: 120, observedThrough: new Date(manifest.observedThrough) };
  return { path, parent, capture, feed, raw, interests, delegate, query, clock, runtime,
    select: () => (capture?.selector(wiring.evidenceSelector) ?? wiring.evidenceSelector).select(query) };
}

export function syntheticOutput(command: AgentRuntimeTaskCommand, relationCase = false): Record<string, unknown> {
  if (command.purpose === sourceContentAssessmentPurpose) {
    const { candidates } = JSON.parse(command.prompt) as { candidates: { candidateId: string; bindingId: string;
      untrustedSource: { title: string; bodyPreview: string } }[] };
    return { reviews: candidates.map((c) => ({ candidateId: c.candidateId, bindingId: c.bindingId,
      decision: c.candidateId === "reject" && !relationCase ? "reject" : c.candidateId === "abstain" ? "needs_context" : "promote",
      confidence: 0.96, qualityScore: 0.85, interestRelevanceScore: 0.95, engagementIntegrityScore: 0.95,
      flags: [], reason: "Synthetic concrete parser result", resolvedSoftFlags: [], readerHeadline: fixtureHeadline(c.untrustedSource),
      evidence: [{ field: "bodyPreview", start: 0, end: c.untrustedSource.bodyPreview.length, quote: c.untrustedSource.bodyPreview }] })) };
  }
  const { pairs } = JSON.parse(command.prompt) as { pairs: { leftFeedItemId: string; rightFeedItemId: string }[] };
  return { decisions: pairs.map((pair) => ({ leftFeedItemId: pair.leftFeedItemId, rightFeedItemId: pair.rightFeedItemId,
    ...(command.purpose.includes("related_topic") ? { relation: "unrelated" } : { sameStory: false }),
    confidenceScore: 0.99, rationale: "Synthetic unrelated subjects" })) };
}
