import { InMemoryFeedItemReadRepository } from "@social-monitor/feed/adapters/persistence/in-memory-feed-item-read.repository";
import { FeedItem } from "@social-monitor/feed/domain";
import { FixedClock, tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { ReaderSummaryJob } from "@social-monitor/summary/domain";
import { activeReaderSummaryPurposes as purposes } from "@social-monitor/summary/adapters/model/active-reader-summary-generation-profile";
import type { VerifiedReaderSummaryExecutionAttestation } from "@social-monitor/summary/adapters/model/reader-summary-execution-attestation";
import type { AgentRuntimeTaskCommand } from "@social-monitor/summary/ports";
import { createReaderSummaryDailyCapturePublicationWiring } from "./reader-summary-daily-story-relation-verifier";
import { refreshPeriod } from "./reader-summary-new-input-refresh-capture";
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
  const canonical = createReaderSummaryDailyCapturePublicationWiring({
    replay: null, feedItems: selectorFeed(input.sameStory), summaryClient: {} as never,
    clock: new FixedClock(refreshNow), attestationSink: sink,
    summaryModelMode: "agent-runtime", env: {}, agentRuntimeClient: runtime,
    ...(input.guardAdapter === false ? {} : { storyRelationVerifierGuard: runtime }),
  });
  const selector = guard.selector(canonical.evidenceSelector);
  const query = { tenantId: tenantId(manifest.tenantId), workspaceId: workspaceId(manifest.workspaceId),
    scope: { type: "workspace" as const }, period, maxItems: 2, observedThrough: new Date(manifest.observedThrough) };
  return { runtime, guard, commands, events, sink, model: buildRefreshModelWiring({}, runtime, sink),
    select: () => selector.select(query) };
}

export function selectorOutput(command: AgentRuntimeTaskCommand, sameStory = false): Record<string, unknown> {
  if (command.purpose === purposes.generate) return primaryOutput();
  if (command.purpose !== purposes.storyRelations && command.purpose !== purposes.relatedTopicRelations) {
    return topicOutput(command, command.metadata?.attemptNumber === "2");
  }
  const { pairs } = JSON.parse(command.prompt) as { pairs: { leftFeedItemId: string; rightFeedItemId: string }[] };
  return { decisions: pairs.map(({ leftFeedItemId, rightFeedItemId }) => ({ leftFeedItemId, rightFeedItemId,
    ...(command.purpose === purposes.relatedTopicRelations ? { relation: "unrelated" } : { sameStory }),
    confidenceScore: 0.99, rationale: "Synthetic independent evidence" })) };
}

function selectorFeed(sameStory = false) {
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
  const snapshot = feed.readPromotionSnapshot.bind(feed);
  jest.spyOn(feed, "readPromotionSnapshot").mockImplementation(async (query) => {
    const result = await snapshot(query);
    return result.ok ? { ...result, candidates: result.candidates.map((candidate) => ({ ...candidate,
      metricAuthority: { observedAt: new Date("2026-09-05T21:55:00Z"), regressionState: "stable" as const },
    })) } : result;
  });
  return feed;
}
