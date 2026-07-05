import {
  type EventEnvelope,
  FixedClock,
  tenantId,
  workspaceId,
} from "@social-monitor/shared-kernel";

import { SourceBinding } from "../../domain";
import type {
  IdempotencyPort,
  OutboxPort,
  SourceBindingConfig,
  SourceBindingConfigProtectorPort,
  SourceBindingRepositoryPort,
  SourceCatalogPort,
} from "../../ports";
import { ApplyAcceptedTopicRecommendationUseCase } from "./apply-accepted-topic-recommendation.use-case";

describe("ApplyAcceptedTopicRecommendationUseCase", () => {
  it("expands existing source bindings for an accepted topic", async () => {
    const sourceBindings = new FakeSourceBindingRepository();
    await sourceBindings.save(makeBinding("binding-reddit", "reddit"));
    await sourceBindings.save(makeBinding("binding-hn", "hacker-news"));
    await sourceBindings.save(makeBinding("binding-x", "x-twitter"));
    await sourceBindings.save(makeBinding("binding-rss", "rss"));
    const outbox = new FakeOutbox();
    const useCase = makeUseCase(sourceBindings, outbox);

    const result = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      recommendationId: "topic-rec:14:ai security",
      topicLabel: "AI security",
      interestIds: ["interest-ai"],
      decidedBy: "admin-user",
      idempotencyKey: "apply-topic-ai-security",
      correlationId: "corr-ai-security",
    });

    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        status: "applied",
        changedSourceBindingCount: 4,
      }),
    });
    expect(outbox.events).toHaveLength(4);
    expect(await configFor(sourceBindings, "binding-reddit")).toMatchObject({
      promotedTopics: ["AI security"],
      scanPasses: [expect.objectContaining({ query: "AI security" })],
    });
    expect(await configFor(sourceBindings, "binding-hn")).toMatchObject({
      promotedTopics: ["AI security"],
      scanPasses: [
        expect.objectContaining({ target: "story", query: "AI security" }),
        expect.objectContaining({ target: "comment", query: "AI security" }),
      ],
    });
    expect(await configFor(sourceBindings, "binding-x")).toMatchObject({
      promotedTopics: ["AI security"],
      searchQueries: ["AI security"],
      maxSearchQueries: 8,
    });
    expect(await configFor(sourceBindings, "binding-rss")).toMatchObject({
      promotedTopics: ["AI security"],
      extraFeedUrls: [expect.stringContaining("news.google.com/rss/search")],
    });
  });

  it("does not duplicate an already applied topic", async () => {
    const sourceBindings = new FakeSourceBindingRepository();
    await sourceBindings.save(
      makeBinding("binding-reddit", "reddit", {
        mode: "search",
        query: "AI",
        promotedTopics: ["AI security"],
        scanPasses: [{ mode: "search", query: "AI security" }],
      }),
    );
    const useCase = makeUseCase(sourceBindings, new FakeOutbox());

    const result = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      recommendationId: "topic-rec:14:ai security",
      topicLabel: "AI security",
      interestIds: ["interest-ai"],
      decidedBy: "admin-user",
      idempotencyKey: "apply-topic-ai-security",
      correlationId: "corr-ai-security",
    });

    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        status: "already_applied",
        changedSourceBindingCount: 0,
      }),
    });
    expect(await configFor(sourceBindings, "binding-reddit")).toMatchObject({
      promotedTopics: ["AI security"],
      scanPasses: [{ mode: "search", query: "AI security" }],
    });
  });

  it("reverts an accepted topic only when the applied config is unchanged", async () => {
    const sourceBindings = new FakeSourceBindingRepository();
    await sourceBindings.save(makeBinding("binding-reddit", "reddit"));
    const outbox = new FakeOutbox();
    const useCase = makeUseCase(sourceBindings, outbox);

    const applied = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      recommendationId: "topic-rec:14:ai security",
      topicLabel: "AI security",
      interestIds: ["interest-ai"],
      decidedBy: "admin-user",
      idempotencyKey: "apply-topic-ai-security",
      correlationId: "corr-ai-security",
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok) {
      return;
    }

    const reverted = await useCase.revert({
      tenantId: tenant,
      workspaceId: workspace,
      recommendationId: "topic-rec:14:ai security",
      topicLabel: "AI security",
      sourceBindingUpdates: applied.value.sourceBindingUpdates,
      decidedBy: "admin-user",
      idempotencyKey: "undo-topic-ai-security",
      correlationId: "corr-ai-security",
    });

    expect(reverted).toEqual({
      ok: true,
      value: expect.objectContaining({
        status: "reverted",
        revertedSourceBindingCount: 1,
      }),
    });
    expect(await configFor(sourceBindings, "binding-reddit")).toEqual({
      mode: "search",
      query: "AI",
    });
    expect(outbox.events.map((event) => event.eventType)).toEqual([
      "monitoring.source-binding.config-expanded",
      "monitoring.source-binding.config-expansion-reverted",
    ]);
  });

  it("blocks revert when the source binding config changed after apply", async () => {
    const sourceBindings = new FakeSourceBindingRepository();
    await sourceBindings.save(makeBinding("binding-reddit", "reddit"));
    const useCase = makeUseCase(sourceBindings, new FakeOutbox());

    const applied = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      recommendationId: "topic-rec:14:ai security",
      topicLabel: "AI security",
      interestIds: ["interest-ai"],
      decidedBy: "admin-user",
      idempotencyKey: "apply-topic-ai-security",
      correlationId: "corr-ai-security",
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok) {
      return;
    }
    await sourceBindings.save(
      makeBinding("binding-reddit", "reddit", {
        mode: "search",
        query: "manual override",
      }),
    );

    const reverted = await useCase.revert({
      tenantId: tenant,
      workspaceId: workspace,
      recommendationId: "topic-rec:14:ai security",
      topicLabel: "AI security",
      sourceBindingUpdates: applied.value.sourceBindingUpdates,
      decidedBy: "admin-user",
      idempotencyKey: "undo-topic-ai-security",
      correlationId: "corr-ai-security",
    });

    expect(reverted).toEqual({
      ok: true,
      value: expect.objectContaining({
        status: "blocked",
        revertedSourceBindingCount: 0,
      }),
    });
  });
});

const tenant = tenantId("tenant-accepted-topic");
const workspace = workspaceId("workspace-accepted-topic");

const makeUseCase = (
  sourceBindings: SourceBindingRepositoryPort,
  outbox: OutboxPort,
): ApplyAcceptedTopicRecommendationUseCase =>
  new ApplyAcceptedTopicRecommendationUseCase(
    sourceBindings,
    new FakeSourceCatalog(),
    outbox,
    new FakeIdempotency(),
    new IdentityConfigProtector(),
    new SequenceIds(),
    new FixedClock(new Date("2026-07-05T12:00:00.000Z")),
  );

const makeBinding = (
  id: string,
  providerKey: string,
  config: SourceBindingConfig = { mode: "search", query: "AI" },
): SourceBinding =>
  SourceBinding.create({
    id,
    tenantId: tenant,
    workspaceId: workspace,
    interestId: "interest-ai",
    providerKey,
    capabilityProfileVersion: 1,
    config,
    createdAt: new Date("2026-07-05T00:00:00.000Z"),
  });

const configFor = async (
  sourceBindings: SourceBindingRepositoryPort,
  sourceBindingId: string,
): Promise<Readonly<Record<string, unknown>>> => {
  const binding = await sourceBindings.findById({
    tenantId: tenant,
    workspaceId: workspace,
    sourceBindingId,
  });

  return binding?.toSnapshot().config ?? {};
};

class IdentityConfigProtector implements SourceBindingConfigProtectorPort {
  async protect(config: SourceBindingConfig): Promise<SourceBindingConfig> {
    return config;
  }

  async unprotect(config: SourceBindingConfig): Promise<SourceBindingConfig> {
    return config;
  }
}

class FakeSourceBindingRepository implements SourceBindingRepositoryPort {
  private readonly bindings = new Map<string, SourceBinding>();

  async save(binding: SourceBinding): Promise<void> {
    const snapshot = binding.toSnapshot();
    this.bindings.set(snapshot.id, binding);
  }

  async findByInterestAndProvider(params: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly interestId: string;
    readonly providerKey: string;
  }): Promise<SourceBinding | null> {
    return (
      [...this.bindings.values()].find((binding) => {
        const snapshot = binding.toSnapshot();

        return (
          snapshot.tenantId === params.tenantId &&
          snapshot.workspaceId === params.workspaceId &&
          snapshot.interestId === params.interestId &&
          snapshot.providerKey === params.providerKey
        );
      }) ?? null
    );
  }

  async findById(params: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly sourceBindingId: string;
  }): Promise<SourceBinding | null> {
    const binding = this.bindings.get(params.sourceBindingId);
    const snapshot = binding?.toSnapshot();
    if (
      binding === undefined ||
      snapshot?.tenantId !== params.tenantId ||
      snapshot.workspaceId !== params.workspaceId
    ) {
      return null;
    }

    return binding;
  }

  async listByInterest(
    query: Parameters<SourceBindingRepositoryPort["listByInterest"]>[0],
  ) {
    const sourceBindings = [...this.bindings.values()].filter((binding) => {
      const snapshot = binding.toSnapshot();

      return (
        snapshot.tenantId === query.tenantId &&
        snapshot.workspaceId === query.workspaceId &&
        snapshot.interestId === query.interestId &&
        (query.providerKeys === undefined ||
          query.providerKeys.includes(snapshot.providerKey)) &&
        (query.statuses === undefined ||
          query.statuses.includes(snapshot.status))
      );
    });

    return { sourceBindings: sourceBindings.slice(0, query.limit) };
  }
}

class FakeSourceCatalog implements SourceCatalogPort {
  async getCapability() {
    return null;
  }

  async validateBindingConfig() {
    return { ok: true as const };
  }
}

class FakeOutbox implements OutboxPort {
  readonly events: EventEnvelope<Readonly<Record<string, unknown>>>[] = [];

  async append(
    event: EventEnvelope<Readonly<Record<string, unknown>>>,
  ): Promise<void> {
    this.events.push(event);
  }
}

class FakeIdempotency implements IdempotencyPort {
  private readonly values = new Map<string, unknown>();

  async get<T>(query: Parameters<IdempotencyPort["get"]>[0]) {
    return this.values.has(keyFor(query))
      ? { value: this.values.get(keyFor(query)) as T }
      : null;
  }

  async set(command: Parameters<IdempotencyPort["set"]>[0]): Promise<void> {
    this.values.set(keyFor(command), command.value);
  }
}

class SequenceIds {
  private next = 1;

  generate(): string {
    return `event-${this.next++}`;
  }
}

const keyFor = (value: {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly scope: string;
  readonly key: string;
}): string =>
  [value.tenantId, value.workspaceId, value.scope, value.key].join(":");
