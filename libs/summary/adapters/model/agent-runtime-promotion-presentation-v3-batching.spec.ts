import type {
  ReaderPostPresentationV3Input,
  ReaderPostPresentationV3Result,
} from "../../domain/services/reader-post-presentation-v3";
import { runAgentRuntimePromotionPresentationBatches } from "./agent-runtime-promotion-presentation-v3-batching";

const input = (candidateId: string, body = "Source evidence"): ReaderPostPresentationV3Input => ({
  tenantId: "tenant-test",
  workspaceId: "workspace-test",
  interestId: "interest-test",
  candidateId,
  sourceItemId: "source-test",
  sourceBindingId: "binding-test",
  providerKey: "rss",
  trustedIntent: "synthetic research interest",
  sourceSnapshotSha256: "1".repeat(64),
  title: "Synthetic reader title",
  body,
  captureComplete: true,
});

const unavailable: ReaderPostPresentationV3Result = {
  status: "unavailable",
  reason: "insufficient_support",
};
const executor = () => jest.fn(async (batch: readonly ReaderPostPresentationV3Input[]) =>
  batch.map(() => unavailable));

describe("agent-runtime promotion presentation batch admission", () => {
  it("rejects zero and more than four inputs before dispatching", async () => {
    const dispatch = executor();
    await expect(runAgentRuntimePromotionPresentationBatches([], "codex", dispatch))
      .rejects.toThrow("V3 presentation requires a configured batch of 1..4");
    await expect(runAgentRuntimePromotionPresentationBatches(
      [1, 2, 3, 4, 5].map((id) => input(String(id))), "codex", dispatch,
    )).rejects.toThrow("V3 presentation requires a configured batch of 1..4");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("keeps a normal Codex batch together and in original order", async () => {
    const items = [input("first"), input("second"), input("third")];
    const dispatch = executor();
    await expect(runAgentRuntimePromotionPresentationBatches(items, "codex", dispatch))
      .resolves.toEqual(items.map(() => unavailable));
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(items);
  });

  it("serializes MiMo attestation requests one story at a time", async () => {
    const items = [input("first"), input("second"), input("third")];
    const batches: string[][] = [];
    const dispatch = jest.fn(async (batch: readonly ReaderPostPresentationV3Input[]) => {
      batches.push(batch.map((item) => item.candidateId));
      return batch.map(() => unavailable);
    });
    await expect(runAgentRuntimePromotionPresentationBatches(
      items, "xiaomi-mimo-token-plan", dispatch,
    )).resolves.toEqual(items.map(() => unavailable));
    expect(batches).toEqual([["first"], ["second"], ["third"]]);
  });

  it("splits oversized Codex payloads in stable left-to-right order", async () => {
    const items = [input("first", "a".repeat(600_000)), input("second", "b".repeat(600_000))];
    const dispatch = executor();
    await expect(runAgentRuntimePromotionPresentationBatches(items, "codex", dispatch))
      .resolves.toEqual([unavailable, unavailable]);
    expect(dispatch.mock.calls.map(([batch]) => batch.map((item) => item.candidateId)))
      .toEqual([["first"], ["second"]]);
  });

  it("rejects an oversized singleton without executing or exposing provider output", async () => {
    const dispatch = executor();
    await expect(runAgentRuntimePromotionPresentationBatches(
      [input("oversize", "x".repeat(1_050_000))], "codex", dispatch,
    )).resolves.toEqual([{ status: "unavailable", reason: "input_over_budget" }]);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("does not dispatch later batches after a prior batch fails", async () => {
    const failure = new Error("Synthetic provider failure");
    const dispatch = jest.fn(async (_batch: readonly ReaderPostPresentationV3Input[]) => {
      throw failure;
    });
    await expect(runAgentRuntimePromotionPresentationBatches(
      [input("first", "a".repeat(600_000)), input("second", "b".repeat(600_000))],
      "codex", dispatch,
    )).rejects.toBe(failure);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith([expect.objectContaining({ candidateId: "first" })]);
  });
});
