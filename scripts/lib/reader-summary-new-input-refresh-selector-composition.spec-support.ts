import type { ConfiguredInterestScope } from "@social-monitor/relevance/ports";
import { createRefreshAssessmentReviewer, withRefreshAssessmentCompletion } from "./reader-summary-new-input-refresh-assessment";
import { sourceContentAssessmentPurpose } from "./reader-summary-new-input-refresh-assessment-runtime";
import { InMemoryFeedItemReadRepository } from "@social-monitor/feed/adapters/persistence/in-memory-feed-item-read.repository";
import { FeedItem } from "@social-monitor/feed/domain";
import { FixedClock, tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { ReaderSummaryJob } from "@social-monitor/summary/domain";
import { activeReaderSummaryPurposes as purposes } from "@social-monitor/summary/adapters/model/active-reader-summary-generation-profile";
import type { VerifiedReaderSummaryExecutionAttestation } from "@social-monitor/summary/adapters/model/reader-summary-execution-attestation";
import type { AgentRuntimeTaskCommand } from "@social-monitor/summary/ports";
import { createReaderSummaryDailyCapturePublicationWiring } from "./reader-summary-daily-story-relation-verifier";
import { preflightRefreshSelection, refreshPeriod } from "./reader-summary-new-input-refresh-capture";
import { NewInputRefreshGuard } from "./reader-summary-new-input-refresh-guard";
import { buildRefreshModelWiring, guardedRefreshRuntime } from "./reader-summary-new-input-refresh-model";
import { completedRefreshModelRequest } from "./reader-summary-new-input-refresh-model.spec-support";
import { primaryOutput, topicOutput } from "./reader-summary-new-input-refresh-model-composition.spec-support";
import { refreshManifest, refreshNow } from "./reader-summary-new-input-refresh.spec-support";

export type SelectorEvent = { status: string; phase?: string; taskRole?: string };
export async function selectorWiring(input: {
  output?: (command: AgentRuntimeTaskCommand) => Record<string, unknown>;
  guardAdapter?: boolean;
  sameStory?: boolean;
  extraCandidates?: number;
  assertSource?: () => void;
  onAttestation?: (value: VerifiedReaderSummaryExecutionAttestation) => void | Promise<void>;
  onEvent?: (value: SelectorEvent) => void;
} = {}) {
  const manifest = refreshManifest();
  const period = refreshPeriod(manifest.date);
  const guard = new NewInputRefreshGuard(manifest, "synthetic-job", {
    now: () => refreshNow, assertFences: () => undefined, assertCurrent: async () => undefined,
  });
  await guard.claim(ReaderSummaryJob.request({ id: "synthetic-job", tenantId: tenantId(manifest.tenantId),
    workspaceId: workspaceId(manifest.workspaceId), scope: { type: "workspace" }, period,
    idempotencyKey: manifest.operation, requestedAt: refreshNow }).toSnapshot());
  const commands: AgentRuntimeTaskCommand[] = [];
  const events: SelectorEvent[] = [];
  const runtime = guardedRefreshRuntime({ manifest,
    assertLocal: () => { input.assertSource?.(); guard.assertLocal(); },
    assertCurrent: () => guard.assertCurrent(),
    record: (value) => { events.push(value as SelectorEvent); input.onEvent?.(value as SelectorEvent); },
    delegate: { checkHealth: jest.fn(), runTask: async (command) => {
      commands.push(command);
      return completedRefreshModelRequest(command, input.output?.(command) ?? selectorOutput(command, input.sameStory));
    } },
  });
  const sink = { record: jest.fn(async (value: VerifiedReaderSummaryExecutionAttestation) => {
    runtime.assertUsable();
    await input.onAttestation?.(value);
  }) };
  const feed = selectorFeed(input.sameStory, input.extraCandidates);
  const configuredInterests = { readCurrent: async (scope: ConfiguredInterestScope) =>
    ({ kind: "available" as const, interest: { ...scope, query: "AI developer tools" } }) };
  const clock = new FixedClock(refreshNow);
  const preflight = await preflightRefreshSelection({ configuredInterests, feed, date: manifest.date,
    observedThrough: new Date(manifest.observedThrough), clock });
  const assessment = createRefreshAssessmentReviewer({ env: {}, runtime, clock,
    canonicalEvidence: preflight.canonicalEvidence });
  const canonical = createReaderSummaryDailyCapturePublicationWiring({
    configuredInterests, qualityReviewer: assessment,
    replay: null, feedItems: feed, summaryClient: {} as never,
    clock: new FixedClock(refreshNow), attestationSink: sink,
    summaryModelMode: "agent-runtime", env: {}, agentRuntimeClient: runtime,
    ...(input.guardAdapter === false ? {} : { storyRelationVerifierGuard: runtime }),
  });
  const selector = guard.selector(canonical.evidenceSelector);
  const query = { tenantId: tenantId(manifest.tenantId), workspaceId: workspaceId(manifest.workspaceId),
    scope: { type: "workspace" as const }, period, maxItems: 2, observedThrough: new Date(manifest.observedThrough) };
  return { runtime, guard, commands, events, sink, preflight, assessment, model: buildRefreshModelWiring({}, runtime, sink),
    selectComplete: () => guard.selector(withRefreshAssessmentCompletion(
      canonical.evidenceSelector, assessment, preflight.assessmentCandidateCount)).select(query),
    select: () => selector.select(query) };
}

export function selectorOutput(command: AgentRuntimeTaskCommand, sameStory = false): Record<string, unknown> {
  if (command.purpose === sourceContentAssessmentPurpose) return refreshSelectorAssessmentOutput(command);
  if (command.purpose === purposes.generate) return primaryOutput();
  if (command.purpose !== purposes.storyRelations && command.purpose !== purposes.relatedTopicRelations) {
    return topicOutput(command, command.metadata?.attemptNumber === "2");
  }
  const { pairs } = JSON.parse(command.prompt) as { pairs: { leftFeedItemId: string; rightFeedItemId: string }[] };
  return { decisions: pairs.map(({ leftFeedItemId, rightFeedItemId }) => ({ leftFeedItemId, rightFeedItemId,
    ...(command.purpose === purposes.relatedTopicRelations ? { relation: "unrelated" } : { sameStory }),
    confidenceScore: 0.99, rationale: "Synthetic independent evidence" })) };
}

function selectorFeed(sameStory = false, extraCandidates = 0) {
  const m = refreshManifest();
  const feed = new InMemoryFeedItemReadRepository();
  for (const [id, providerKey, title, bodyPreview, providerMetadata] of [
    ["synthetic-x", "x-twitter", sameStory ? "TypeScript compiler rewrite moves to Go"
      : "Microsoft is rewriting the TypeScript compiler in Go",
      "Microsoft details a TypeScript compiler release for AI coding agents and developer tools.",
      { kind: "x_post", contentKind: "original_post", likes: 500, reposts: 50,
        promotionAuthority: { official: true, trusted: true, attestedBy: "source_catalog" } }],
    ["synthetic-reddit", "reddit", sameStory ? "Go rewrite of the TypeScript compiler reaches developers"
      : "Developers discuss rewriting TypeScript tooling into isolated sandboxes",
      sameStory ? "The engineering team explains the TypeScript compiler release for AI coding agents."
        : "A forum question compares TypeScript compiler choices for AI coding agents and developer tools.",
      { kind: "reddit_post", score: 190, comments: 30, upvoteRatio: 0.95 }],
  ] as const) {
    feed.upsert(FeedItem.publish({ id, tenantId: tenantId(m.tenantId), workspaceId: workspaceId(m.workspaceId),
      interestId: "interest-ai", sourceItemId: `source-${id}`, sourceBindingId: `binding-${id}`, providerKey,
      canonicalUrl: `https://${providerKey}.example.test/${id}`, title, bodyPreview,
      authorHandle: providerKey === "x-twitter" ? "OpenAI" : "synthetic-forum",
      publishedAt: new Date("2026-09-03T08:00:00Z"), observedAt: new Date("2026-09-03T08:01:00Z"),
      providerMetadata: { ...providerMetadata, interestQuerySnapshot: { query: "TypeScript, developer tools" } },
    }));
  }
  for (let i = 0; i < extraCandidates; i++) {
    feed.upsert(FeedItem.publish({ id: `synthetic-extra-${i}`, tenantId: tenantId(m.tenantId),
      workspaceId: workspaceId(m.workspaceId), interestId: "interest-ai", sourceItemId: `extra-source-${i}`,
      sourceBindingId: "extra-binding", providerKey: "hacker-news", canonicalUrl: `https://example.test/extra/${i}`,
      title: "TypeScript compiler release improves AI coding agents",
      bodyPreview: "The TypeScript compiler release improves AI coding agents with a documented sandbox interface.",
      publishedAt: new Date("2026-09-03T08:00:00Z"), observedAt: new Date("2026-09-03T08:01:00Z"),
      providerMetadata: { kind: "hacker_news_story", points: 500, comments: 10 },
    }));
  }
  const snapshot = feed.readPromotionSnapshot.bind(feed);
  jest.spyOn(feed, "readPromotionSnapshot").mockImplementation(async (query) => {
    const result = await snapshot(query);
    return result.ok ? { ...result, candidates: result.candidates.map((candidate) => ({ ...candidate,
      metricAuthority: { observedAt: new Date("2026-09-05T21:55:00Z"), regressionState: "stable" as const },
    })) } : result;
  });
  return feed;
}

// A bounded fixture for two posts and 199 named exhaustion-test copies. Unknown candidates,
// intent, or missing evidence fail instead of receiving an all-pass response.
export function refreshSelectorAssessmentOutput(command: AgentRuntimeTaskCommand) {
  const { candidates } = JSON.parse(command.prompt) as { candidates: {
    candidateId: string; bindingId: string; trustedIntent: string;
    untrustedSource: { title: string; bodyPreview: string };
  }[] };
  return { reviews: candidates.map((candidate) => {
    const knownExtra = Array.from({ length: 199 }, (_, i) => `synthetic-extra-${i}`).includes(candidate.candidateId) &&
      candidate.untrustedSource.bodyPreview === "The TypeScript compiler release improves AI coding agents with a documented sandbox interface.";
    if ((!knownExtra && !["synthetic-x", "synthetic-reddit"].includes(candidate.candidateId)) ||
        candidate.trustedIntent !== "AI developer tools" ||
        !candidate.untrustedSource.bodyPreview.includes("TypeScript compiler") ||
        !candidate.untrustedSource.bodyPreview.includes("AI coding agents")) {
      throw new Error("Unexpected synthetic assessment evidence");
    }
    const quote = candidate.untrustedSource.bodyPreview;
    return { candidateId: candidate.candidateId, bindingId: candidate.bindingId,
      decision: "promote", confidence: 0.96, qualityScore: 0.94,
      interestRelevanceScore: 0.95, engagementIntegrityScore: 0.95,
      flags: [], reason: "Captured compiler details concern the configured developer tools intent",
      evidence: [{ field: "bodyPreview", start: 0, end: quote.length, quote }], resolvedSoftFlags: [] };
  }) };
}
