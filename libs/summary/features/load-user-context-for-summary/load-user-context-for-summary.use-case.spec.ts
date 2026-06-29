import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import type { SummaryMemoryContext, SummaryMemoryPort } from "../../ports";
import { LoadUserContextForSummaryUseCase } from "./load-user-context-for-summary.use-case";
import type { LoadUserContextForSummaryQuery } from "./load-user-context-for-summary.query";

describe("LoadUserContextForSummaryUseCase", () => {
  it("loads summary memory context through the memory port", async () => {
    const memory = new CapturingSummaryMemory({
      status: "available",
      renderedText: "Prefers practical AI infra news.",
      diagnostics: { provider: "memo-stack" },
      retrievedAt: now,
    });
    const result = await new LoadUserContextForSummaryUseCase(memory).execute(
      query(),
    );

    expect(result.ok).toBe(true);
    expect(memory.queries).toHaveLength(1);
    if (result.ok) {
      expect(result.value.context).toMatchObject({
        status: "available",
        renderedText: "Prefers practical AI infra news.",
      });
    }
  });

  it("returns unavailable context with redacted diagnostics when memory fails", async () => {
    const result = await new LoadUserContextForSummaryUseCase(
      new FailingSummaryMemory(),
    ).execute(query());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.context.status).toBe("unavailable");
      expect(result.value.context.diagnostics.code).toBe(
        "summary.memory.unavailable",
      );
      const message = result.value.context.diagnostics.message;
      expect(message).toContain("[REDACTED]");
      expect(message).not.toContain("token-value");
      expect(message).not.toContain("query-token");
      expect(message).not.toContain("key-value");
    }
  });
});

const now = new Date("2026-06-24T10:00:00.000Z");

const query = (): LoadUserContextForSummaryQuery => ({
  tenantId: tenantId("tenant-memory"),
  workspaceId: workspaceId("workspace-memory"),
  interestId: "interest-ai",
  userId: "user-1",
  evidence: {
    sourceWindow: {
      windowId: "window-1",
      startedAt: new Date("2026-06-24T09:00:00.000Z"),
      endedAt: now,
      selectedFeedItemIds: ["feed-1"],
    },
    items: [],
  },
  requestedAt: now,
});

class CapturingSummaryMemory implements SummaryMemoryPort {
  readonly queries: Parameters<SummaryMemoryPort["buildContext"]>[0][] = [];

  constructor(private readonly context: SummaryMemoryContext) {}

  async buildContext(
    query: Parameters<SummaryMemoryPort["buildContext"]>[0],
  ): Promise<SummaryMemoryContext> {
    this.queries.push(query);

    return this.context;
  }

  async recordSummaryFeedback(): Promise<
    Awaited<ReturnType<SummaryMemoryPort["recordSummaryFeedback"]>>
  > {
    return { status: "disabled" };
  }
}

class FailingSummaryMemory extends CapturingSummaryMemory {
  constructor() {
    super({
      status: "disabled",
      diagnostics: {},
      retrievedAt: now,
    });
  }

  override async buildContext(): Promise<SummaryMemoryContext> {
    throw new Error(
      "memo-stack failed Bearer token-value https://example.test/callback?token=query-token&api_key=key-value",
    );
  }
}
