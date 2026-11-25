import {
  type EventEnvelope,
  FixedClock,
  err,
  ok,
  tenantId,
  workspaceId,
} from "@social-monitor/shared-kernel";

import { ReaderSummaryTopicRecommendationDecision } from "../../domain";
import type {
  ApplyReaderSummaryAcceptedTopicCommand,
  ReaderSummaryAcceptedTopicApplication,
  ReaderSummaryAcceptedTopicApplierPort,
  RevertReaderSummaryAcceptedTopicCommand,
  ReaderSummaryTopicRecommendationDecisionRepositoryPort,
  SummaryEventPublisherPort,
} from "../../ports";
import { DecideReaderSummaryTopicRecommendationUseCase } from "./decide-reader-summary-topic-recommendation.use-case";

describe("DecideReaderSummaryTopicRecommendationUseCase", () => {
  it("records an accepted topic recommendation decision", async () => {
    const decisions = new FakeTopicRecommendationDecisions();
    const applier = new FakeAcceptedTopicApplier();
    const events = new FakeSummaryEvents();
    const useCase = new DecideReaderSummaryTopicRecommendationUseCase(
      decisions,
      new FixedClock(new Date("2026-07-05T12:00:00.000Z")),
      applier,
      events,
      new SequenceIds(),
    );

    const result = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      recommendationId: "topic-rec:14:ai security",
      topicLabel: "AI security",
      action: "accept",
      interestIds: ["interest-ai"],
      decidedBy: "admin-user",
      note: "Promote",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        decision: expect.objectContaining({
          toSnapshot: expect.any(Function),
        }),
        decisionStatus: "accepted",
        application: {
          status: "applied",
          changedSourceBindingCount: 1,
          sourceBindingUpdates: [
            {
              sourceBindingId: "binding-reddit",
              interestId: "interest-ai",
              providerKey: "reddit",
              changed: true,
              changedConfigPaths: ["promotedTopics", "scanPasses"],
              rollbackToken: expect.objectContaining({ schemaVersion: 1 }),
            },
          ],
        },
        reversion: {
          status: "not_requested",
          revertedSourceBindingCount: 0,
          sourceBindingReversions: [],
        },
      },
    });
    expect(applier.commands).toEqual([
      expect.objectContaining({
        recommendationId: "topic-rec:14:ai security",
        topicLabel: "AI security",
        interestIds: ["interest-ai"],
        decidedBy: "admin-user",
      }),
    ]);
    expect(decisions.saved?.toSnapshot()).toEqual({
      tenantId: tenant,
      workspaceId: workspace,
      recommendationId: "topic-rec:14:ai security",
      topicLabel: "AI security",
      status: "accepted",
      decidedBy: "admin-user",
      note: "Promote",
      decidedAt: new Date("2026-07-05T12:00:00.000Z"),
      application: {
        status: "applied",
        changedSourceBindingCount: 1,
        sourceBindingUpdates: [
          {
            sourceBindingId: "binding-reddit",
            interestId: "interest-ai",
            providerKey: "reddit",
            changed: true,
            changedConfigPaths: ["promotedTopics", "scanPasses"],
            rollbackToken: { schemaVersion: 1 },
          },
        ],
      },
    });
    expect(events.events).toEqual([
      expect.objectContaining({
        eventType: "summary.reader-summary-topic-recommendation.decided",
        payload: expect.objectContaining({
          recommendationId: "topic-rec:14:ai security",
          status: "accepted",
          applicationStatus: "applied",
          changedSourceBindingCount: 1,
        }),
      }),
    ]);
  });

  it("canonicalizes stale headline-like topic labels before applying", async () => {
    const decisions = new FakeTopicRecommendationDecisions();
    const applier = new FakeAcceptedTopicApplier();
    const useCase = new DecideReaderSummaryTopicRecommendationUseCase(
      decisions,
      new FixedClock(new Date("2026-07-05T12:00:00.000Z")),
      applier,
      new FakeSummaryEvents(),
      new SequenceIds(),
    );

    const result = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      recommendationId:
        "topic-rec:14:the productivity stack many professionals rely on every",
      topicLabel: "The productivity stack many professionals rely on every",
      action: "accept",
      interestIds: ["interest-ai"],
      decidedBy: "admin-user",
    });

    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        decisionStatus: "accepted",
      }),
    });
    expect(applier.commands).toEqual([
      expect.objectContaining({
        recommendationId: "topic-rec:14:productivity stack",
        topicLabel: "Productivity stack",
      }),
    ]);
    expect(decisions.saved?.toSnapshot()).toMatchObject({
      recommendationId: "topic-rec:14:productivity stack",
      topicLabel: "Productivity stack",
      status: "accepted",
    });
  });

  it("rejects blank actors", async () => {
    const result = await new DecideReaderSummaryTopicRecommendationUseCase(
      new FakeTopicRecommendationDecisions(),
      new FixedClock(new Date("2026-07-05T12:00:00.000Z")),
      new FakeAcceptedTopicApplier(),
      new FakeSummaryEvents(),
      new SequenceIds(),
    ).execute({
      tenantId: tenant,
      workspaceId: workspace,
      recommendationId: "topic-rec:14:ai security",
      topicLabel: "AI security",
      action: "reject",
      decidedBy: " ",
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "validation.failed" }),
    });
  });

  it("requires interest ids before accepting a recommendation", async () => {
    const decisions = new FakeTopicRecommendationDecisions();
    const applier = new FakeAcceptedTopicApplier();
    const result = await new DecideReaderSummaryTopicRecommendationUseCase(
      decisions,
      new FixedClock(new Date("2026-07-05T12:00:00.000Z")),
      applier,
      new FakeSummaryEvents(),
      new SequenceIds(),
    ).execute({
      tenantId: tenant,
      workspaceId: workspace,
      recommendationId: "topic-rec:14:ai security",
      topicLabel: "AI security",
      action: "accept",
      decidedBy: "admin-user",
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "validation.failed" }),
    });
    expect(decisions.saved).toBeUndefined();
    expect(applier.commands).toEqual([]);
  });

  it.each(["The", "Show"])(
    "rejects generic stopword label %s before applying a topic",
    async (topicLabel) => {
    const decisions = new FakeTopicRecommendationDecisions();
    const applier = new FakeAcceptedTopicApplier();
    const result = await new DecideReaderSummaryTopicRecommendationUseCase(
      decisions,
      new FixedClock(new Date("2026-07-05T12:00:00.000Z")),
      applier,
      new FakeSummaryEvents(),
      new SequenceIds(),
    ).execute({
      tenantId: tenant,
      workspaceId: workspace,
      recommendationId: `topic-rec:14:${topicLabel.toLowerCase()}`,
      topicLabel,
      action: "accept",
      interestIds: ["interest-ai"],
      decidedBy: "admin-user",
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: "validation.failed",
      }),
    });
    expect(decisions.saved).toBeUndefined();
    expect(applier.commands).toEqual([]);
    },
  );

  it("wraps unexpected topic application failures in a public domain error", async () => {
    const result = await new DecideReaderSummaryTopicRecommendationUseCase(
      new FakeTopicRecommendationDecisions(),
      new FixedClock(new Date("2026-07-05T12:00:00.000Z")),
      new FailingAcceptedTopicApplier(),
      new FakeSummaryEvents(),
      new SequenceIds(),
    ).execute({
      tenantId: tenant,
      workspaceId: workspace,
      recommendationId: "topic-rec:14:ai security",
      topicLabel: "AI security",
      action: "accept",
      interestIds: ["interest-ai"],
      decidedBy: "admin-user",
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: "external.dependency_unavailable",
      }),
    });
  });

  it("does not apply collection config for rejected recommendations", async () => {
    const decisions = new FakeTopicRecommendationDecisions();
    const applier = new FakeAcceptedTopicApplier();
    const result = await new DecideReaderSummaryTopicRecommendationUseCase(
      decisions,
      new FixedClock(new Date("2026-07-05T12:00:00.000Z")),
      applier,
      new FakeSummaryEvents(),
      new SequenceIds(),
    ).execute({
      tenantId: tenant,
      workspaceId: workspace,
      recommendationId: "topic-rec:14:ai security",
      topicLabel: "AI security",
      action: "reject",
      decidedBy: "admin-user",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        decision: expect.objectContaining({
          toSnapshot: expect.any(Function),
        }),
        decisionStatus: "rejected",
        application: {
          status: "not_requested",
          changedSourceBindingCount: 0,
          sourceBindingUpdates: [],
        },
        reversion: {
          status: "not_requested",
          revertedSourceBindingCount: 0,
          sourceBindingReversions: [],
        },
      },
    });
    expect(applier.commands).toEqual([]);
  });

  it("undoes an accepted recommendation only after reverting applied source bindings", async () => {
    const decisions = new FakeTopicRecommendationDecisions();
    const applier = new FakeAcceptedTopicApplier();
    const events = new FakeSummaryEvents();
    const useCase = new DecideReaderSummaryTopicRecommendationUseCase(
      decisions,
      new FixedClock(new Date("2026-07-05T12:00:00.000Z")),
      applier,
      events,
      new SequenceIds(),
    );
    await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      recommendationId: "topic-rec:14:ai security",
      topicLabel: "AI security",
      action: "accept",
      interestIds: ["interest-ai"],
      decidedBy: "admin-user",
    });

    const result = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      recommendationId: "topic-rec:14:ai security",
      topicLabel: "AI security",
      action: "undo",
      decidedBy: "admin-user",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        decisionStatus: "pending",
        application: {
          status: "not_requested",
          changedSourceBindingCount: 0,
          sourceBindingUpdates: [],
        },
        reversion: {
          status: "reverted",
          revertedSourceBindingCount: 1,
          sourceBindingReversions: [
            {
              sourceBindingId: "binding-reddit",
              interestId: "interest-ai",
              providerKey: "reddit",
              reverted: true,
              restoredConfigPaths: ["promotedTopics", "scanPasses"],
            },
          ],
        },
      },
    });
    expect(applier.revertCommands).toEqual([
      expect.objectContaining({
        recommendationId: "topic-rec:14:ai security",
        application: expect.objectContaining({ status: "applied" }),
      }),
    ]);
    expect(await decisions.findByRecommendationId({
      tenantId: tenant,
      workspaceId: workspace,
      recommendationId: "topic-rec:14:ai security",
    })).toBeNull();
    expect(events.events.at(-1)).toEqual(
      expect.objectContaining({
        payload: expect.objectContaining({
          status: "pending",
          reversionStatus: "reverted",
          revertedSourceBindingCount: 1,
        }),
      }),
    );
  });

  it("can undo legacy headline-like decisions saved under the raw recommendation id", async () => {
    const decisions = new FakeTopicRecommendationDecisions();
    const applier = new FakeAcceptedTopicApplier();
    const events = new FakeSummaryEvents();
    const rawRecommendationId =
      "topic-rec:14:the productivity stack many professionals rely on every";
    decisions.saved = ReaderSummaryTopicRecommendationDecision.record({
      tenantId: tenant,
      workspaceId: workspace,
      recommendationId: rawRecommendationId,
      topicLabel: "The productivity stack many professionals rely on every",
      status: "accepted",
      decidedBy: "admin-user",
      decidedAt: new Date("2026-07-05T12:00:00.000Z"),
      application: {
        status: "applied",
        changedSourceBindingCount: 1,
        sourceBindingUpdates: [
          {
            sourceBindingId: "binding-reddit",
            interestId: "interest-ai",
            providerKey: "reddit",
            changed: true,
            changedConfigPaths: ["promotedTopics", "scanPasses"],
            rollbackToken: { schemaVersion: 1 },
          },
        ],
      },
    });
    const useCase = new DecideReaderSummaryTopicRecommendationUseCase(
      decisions,
      new FixedClock(new Date("2026-07-05T12:00:00.000Z")),
      applier,
      events,
      new SequenceIds(),
    );

    const result = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      recommendationId: rawRecommendationId,
      topicLabel: "The productivity stack many professionals rely on every",
      action: "undo",
      decidedBy: "admin-user",
    });

    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        decisionStatus: "pending",
        reversion: expect.objectContaining({ status: "reverted" }),
      }),
    });
    expect(applier.revertCommands).toEqual([
      expect.objectContaining({
        recommendationId: rawRecommendationId,
        topicLabel: "The productivity stack many professionals rely on every",
      }),
    ]);
    expect(decisions.saved).toBeUndefined();
  });
});

const tenant = tenantId("tenant-topic-rec-decision");
const workspace = workspaceId("workspace-topic-rec-decision");

class FakeTopicRecommendationDecisions
  implements ReaderSummaryTopicRecommendationDecisionRepositoryPort
{
  saved: ReaderSummaryTopicRecommendationDecision | undefined;

  async save(
    decision: ReaderSummaryTopicRecommendationDecision,
  ): Promise<void> {
    this.saved = decision;
  }

  async listByRecommendationIds(): Promise<
    readonly ReaderSummaryTopicRecommendationDecision[]
  > {
    return this.saved === undefined ? [] : [this.saved];
  }

  async findByRecommendationId(
    lookup?: {
      readonly recommendationId?: string;
      readonly [key: string]: unknown;
    },
  ): Promise<
    ReaderSummaryTopicRecommendationDecision | null
  > {
    if (this.saved === undefined) {
      return null;
    }

    return this.saved.toSnapshot().recommendationId === lookup?.recommendationId
      ? this.saved
      : null;
  }

  async deleteByRecommendationId(
    lookup?: {
      readonly recommendationId?: string;
      readonly [key: string]: unknown;
    },
  ): Promise<void> {
    if (
      this.saved === undefined ||
      this.saved.toSnapshot().recommendationId === lookup?.recommendationId
    ) {
      this.saved = undefined;
    }
  }
}

class FailingAcceptedTopicApplier implements ReaderSummaryAcceptedTopicApplierPort {
  async apply() {
    return err(new Error("monitoring adapter failed"));
  }

  async revert() {
    return err(new Error("monitoring adapter failed"));
  }
}

class FakeAcceptedTopicApplier implements ReaderSummaryAcceptedTopicApplierPort {
  readonly commands: ApplyReaderSummaryAcceptedTopicCommand[] = [];
  readonly revertCommands: RevertReaderSummaryAcceptedTopicCommand[] = [];

  async apply(command: ApplyReaderSummaryAcceptedTopicCommand) {
    this.commands.push(command);

    return ok({
      status: "applied",
      changedSourceBindingCount: 1,
      sourceBindingUpdates: [
        {
          sourceBindingId: "binding-reddit",
          interestId: "interest-ai",
              providerKey: "reddit",
              changed: true,
              changedConfigPaths: ["promotedTopics", "scanPasses"],
              rollbackToken: { schemaVersion: 1 },
            },
          ],
        } satisfies ReaderSummaryAcceptedTopicApplication);
  }

  async revert(command: RevertReaderSummaryAcceptedTopicCommand) {
    this.revertCommands.push(command);

    return ok({
      status: "reverted",
      revertedSourceBindingCount: 1,
      sourceBindingReversions: [
        {
          sourceBindingId: "binding-reddit",
          interestId: "interest-ai",
          providerKey: "reddit",
          reverted: true,
          restoredConfigPaths: ["promotedTopics", "scanPasses"],
        },
      ],
    } as const);
  }
}

class FakeSummaryEvents implements SummaryEventPublisherPort {
  readonly events: EventEnvelope<Readonly<Record<string, unknown>>>[] = [];

  async publish(
    event: EventEnvelope<Readonly<Record<string, unknown>>>,
  ): Promise<void> {
    this.events.push(event);
  }
}

class SequenceIds {
  private next = 1;

  generate(): string {
    return `event-${this.next++}`;
  }
}
