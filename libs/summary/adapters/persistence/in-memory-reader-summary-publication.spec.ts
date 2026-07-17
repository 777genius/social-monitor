import { eventId, tenantId, workspaceId } from "@social-monitor/shared-kernel";

import { InMemorySummaryEventPublisher } from "../messaging/in-memory-summary-event-publisher";
import { InMemoryReaderSummaryArtifactRepository } from "./in-memory-reader-summary-artifact.repository";
import { InMemoryReaderSummaryJobRepository } from "./in-memory-reader-summary-job.repository";
import { InMemoryReaderSummaryPublication } from "./in-memory-reader-summary-publication";
import {
  buildReaderSummaryPublicationPayload,
  stablePublicationJson,
} from "./reader-summary-publication-proof";
import type {
  ReaderSummaryPublicationCommand,
  SummaryEventPublisherPort,
} from "../../ports";

describe("InMemoryReaderSummaryPublication", () => {
  it.each(["COMPLETED", "NO_SIGNAL"] as const)(
    "publishes and semantically replays %s exactly once",
    async (semanticStatus) => {
      const fixture = createFixture({ semanticStatus, sequence: 1 });
      const context = await createContext(fixture.command);

      await expect(context.publication.publish(fixture.command)).resolves.toBe(
        "published",
      );
      await expect(context.publication.publish(fixture.command)).resolves.toBe(
        "replayed",
      );
      await expect(
        context.publication.publish({
          ...fixture.command,
          readyEvent: {
            ...fixture.command.readyEvent,
            eventId: eventId("30000000-0000-4000-8000-999999999999"),
          },
        }),
      ).rejects.toThrow("idempotency conflict");
      await expect(
        context.artifacts.findById(fixture.identity),
      ).resolves.toBe(fixture.command.artifact);
      expect(context.events.all()).toHaveLength(1);
      expect(context.jobs.all()).toHaveLength(1);
    },
  );

  it("serializes a real concurrent equal-requestedAt race to one winner", async () => {
    const left = createFixture({ semanticStatus: "COMPLETED", sequence: 2 });
    const right = createFixture({
      semanticStatus: "COMPLETED",
      sequence: 3,
      requestedAt: left.requestedAt,
    });
    const context = await createContext(left.command, right.command);

    const outcomes = await Promise.all([
      context.publication.publish(left.command),
      context.publication.publish(right.command),
    ]);

    expect([...outcomes].sort()).toEqual(["published", "stale"]);
    expect(context.events.all()).toHaveLength(1);
    await expect(context.artifacts.findById(left.identity)).resolves.toBe(
      left.command.artifact,
    );
    await expect(context.artifacts.findById(right.identity)).resolves.toBeNull();
  });

  it("rejects a mismatched ready event before a candidate becomes visible", async () => {
    const fixture = createFixture({ semanticStatus: "COMPLETED", sequence: 4 });
    const invalid = {
      ...fixture.command,
      readyEvent: {
        ...fixture.command.readyEvent,
        correlationId: "00000000-0000-4000-8000-000000000999",
      },
    } as ReaderSummaryPublicationCommand;
    const context = await createContext(invalid);

    await expect(context.publication.publish(invalid)).rejects.toThrow(
      "exact publication binding",
    );
    await expect(context.artifacts.findById(fixture.identity)).resolves.toBeNull();
    expect(context.events.all()).toHaveLength(0);
  });

  it("keeps the candidate hidden when event publication fails", async () => {
    const fixture = createFixture({ semanticStatus: "COMPLETED", sequence: 5 });
    const jobs = new InMemoryReaderSummaryJobRepository();
    const artifacts = new InMemoryReaderSummaryArtifactRepository();
    await artifacts.save(fixture.command.artifact, {
      publicationDecision: fixture.command.publicationDecision,
    });
    const publication = new InMemoryReaderSummaryPublication(
      jobs,
      artifacts,
      new ThrowingSummaryEventPublisher(),
    );

    await expect(publication.publish(fixture.command)).rejects.toThrow(
      "fixture event failure",
    );
    await expect(artifacts.findById(fixture.identity)).resolves.toBeNull();
    expect(jobs.all()).toEqual([]);
  });

  it("builds a stable report SHA and exact requested UTC date proof", () => {
    const fixture = createFixture({ semanticStatus: "COMPLETED", sequence: 6 });
    const first = buildReaderSummaryPublicationPayload(fixture.command);
    const second = buildReaderSummaryPublicationPayload(fixture.command);

    expect(second).toEqual(first);
    expect(stablePublicationJson(first.report)).toBe(first.reportCanonical);
    expect(first.requestedUtcDate).toBe("2026-07-05");
    expect(first.exactProof).toMatchObject({
      tenantId: fixture.identity.tenantId,
      workspaceId: fixture.identity.workspaceId,
      readerSummaryJobId: fixture.jobId,
      readerSummaryArtifactId: fixture.identity.readerSummaryId,
      reportSha256: first.reportSha256,
    });
  });
});

const createContext = async (
  ...commands: readonly ReaderSummaryPublicationCommand[]
) => {
  const jobs = new InMemoryReaderSummaryJobRepository();
  const artifacts = new InMemoryReaderSummaryArtifactRepository();
  const events = new InMemorySummaryEventPublisher();
  for (const command of commands) {
    await artifacts.save(command.artifact, {
      publicationDecision: command.publicationDecision,
    });
  }
  return {
    jobs,
    artifacts,
    events,
    publication: new InMemoryReaderSummaryPublication(jobs, artifacts, events),
  };
};

class ThrowingSummaryEventPublisher implements SummaryEventPublisherPort {
  async publish(): Promise<void> {
    throw new Error("fixture event failure");
  }
}

const createFixture = (params: {
  readonly semanticStatus: "COMPLETED" | "NO_SIGNAL";
  readonly sequence: number;
  readonly requestedAt?: Date;
}) => {
  const suffix = String(params.sequence).padStart(12, "0");
  const tenant = tenantId("00000000-0000-4000-8000-000000000001");
  const workspace = workspaceId("00000000-0000-4000-8000-000000000002");
  const jobId = `10000000-0000-4000-8000-${suffix}`;
  const artifactId = `20000000-0000-4000-8000-${suffix}`;
  const eventId = `30000000-0000-4000-8000-${suffix}`;
  const requestedAt = params.requestedAt ?? new Date("2026-07-05T10:00:00.000Z");
  const period = {
    cadence: "daily" as const,
    startedAt: new Date("2026-07-05T00:00:00.000Z"),
    endedAt: new Date("2026-07-06T00:00:00.000Z"),
    timezone: "UTC",
    periodKey:
      "daily:2026-07-05T00:00:00.000Z:2026-07-06T00:00:00.000Z:UTC",
  };
  const scope = { type: "workspace" as const };
  const noSignal = params.semanticStatus === "NO_SIGNAL";
  const artifactSnapshot = {
    schemaVersion: "reader_summary.artifact.v1" as const,
    readerSummaryId: artifactId,
    tenantId: tenant,
    workspaceId: workspace,
    scope,
    period,
    generatedAt: new Date("2026-07-05T10:30:00.000Z"),
    sourceWindow: {
      windowId: "publication-test-window",
      startedAt: period.startedAt,
      endedAt: period.endedAt,
      selectedFeedItemIds: [],
      storyClusterIds: [],
    },
    storyClusters: [],
    contextArtifacts: [],
    headline: noSignal ? "No reliable signal" : "Reader summary proof",
    executiveSummary: noSignal ? "No eligible evidence." : "Proved summary.",
    topStories: [],
    interestHighlights: [],
    repeatedSignals: [],
    risksAndUnknowns: [],
    citationMap: [],
    qualityFlags: noSignal ? ["no_signal"] : [],
    confidence: {
      level: noSignal ? "none" : "medium",
      score: noSignal ? 0 : 0.7,
      rationale: "Publication fixture",
    },
    lineage: {
      promptVersion: "reader-summary.prompt.publication-test.v1",
      schemaVersion: "reader_summary.artifact.v1",
      modelVersion: "codex:gpt-5.5:xhigh",
      providerVersion: "fixture",
      rulesVersion: "reader-summary.rules.v1",
      evalDatasetVersion: "reader-summary.eval.v1",
    },
    usage: { inputTokens: 10, outputTokens: 5, estimatedCostUsd: 0 },
    ...(noSignal ? { noSignalReason: "No eligible evidence." } : {}),
  };
  const finalStatus = noSignal ? "no_signal" : "completed";
  const finalJobSnapshot = {
    id: jobId,
    tenantId: tenant,
    workspaceId: workspace,
    scope,
    period,
    status: finalStatus,
    idempotencyKey: `publication-test:${jobId}`,
    requestedAt,
    startedAt: requestedAt,
    completedAt: new Date("2026-07-05T11:00:00.000Z"),
    readerSummaryId: artifactId,
  };
  const readyEvent = {
    eventId,
    eventType: "reader_summary.ready" as const,
    schemaVersion: 1 as const,
    occurredAt: new Date("2026-07-05T11:00:00.000Z"),
    tenantId: tenant,
    workspaceId: workspace,
    correlationId: jobId,
    causationId: jobId,
    payload: {
      readerSummaryJobId: jobId,
      readerSummaryId: artifactId,
      tenantId: tenant,
      workspaceId: workspace,
      scope,
      period,
      status: finalStatus,
    },
  };
  const command = {
    artifact: { toSnapshot: () => artifactSnapshot },
    finalJob: { toSnapshot: () => finalJobSnapshot },
    publicationDecision: {
      status: "published" as const,
      qualityPassed: true as const,
      canonicalScore: 1,
      shadow: {
        mode: "shadow" as const,
        policyVersion: "reader_summary_publication_shadow_v1" as const,
        riskScore: 0,
        signals: [],
      },
      reasons: [],
    },
    readyEvent,
  } as unknown as ReaderSummaryPublicationCommand;

  return {
    command,
    requestedAt,
    jobId,
    identity: {
      tenantId: tenant,
      workspaceId: workspace,
      readerSummaryId: artifactId,
    },
  };
};
