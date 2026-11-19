import type { AgentRuntimeTaskResult } from "../../ports";
import type { ReaderPostPresentationV3Result } from "../../domain/services/reader-post-presentation-v3";
import { projectPromotionPresentationCleanup } from "./agent-runtime-promotion-presentation-v3-cleanup-policy";

const unavailable: ReaderPostPresentationV3Result = {
  status: "unavailable", reason: "insufficient_support",
};

const failed = (details: Record<string, string>): AgentRuntimeTaskResult => ({
  status: "failed", warnings: [],
  failure: {
    code: "task_timeout", safeMessage: "synthetic failure", retryable: false,
    reconnectRequired: false, causeCategory: "deadline", details,
  },
});

describe("promotion presentation cleanup projection", () => {
  it("propagates pending gateway cleanup from a warning without changing the original outcome", () => {
    const result: AgentRuntimeTaskResult = {
      status: "completed", structuredOutput: { presentations: [] },
      warnings: [{ code: "gateway_cleanup_pending", message: "pending" }],
    };
    const project = projectPromotionPresentationCleanup(result);
    expect(project(unavailable)).toEqual({ ...unavailable, cleanupPending: true });
    expect(unavailable).toEqual({ status: "unavailable", reason: "insufficient_support" });
  });

  it("propagates pending cleanup from failed-task diagnostics independently of warnings", () => {
    expect(projectPromotionPresentationCleanup(failed({ gatewayCleanup: "pending" }))(unavailable))
      .toEqual({ ...unavailable, cleanupPending: true });
  });

  it("preserves object identity and does not invent cleanup when the runtime gives no pending signal", () => {
    const project = projectPromotionPresentationCleanup(failed({ gatewayCleanup: "closed" }));
    expect(project(unavailable)).toBe(unavailable);
    expect(projectPromotionPresentationCleanup(failed({}))(unavailable)).toBe(unavailable);
  });
});
