import type {
  AgentRuntimeClientPort,
  AgentRuntimeTaskCommand,
  AgentRuntimeTaskResult,
} from "../../ports";
import { runPromotionPresentationTaskAttempts } from "./agent-runtime-promotion-presentation-v3-task-attempts";

const command = Object.freeze({
  requestId: "synthetic-presentation-attempt",
}) as AgentRuntimeTaskCommand;

const failure = (code: string, details: Record<string, string> = {}): AgentRuntimeTaskResult => ({
  status: "failed",
  warnings: [],
  failure: {
    code,
    safeMessage: "Synthetic runtime failure",
    retryable: false,
    reconnectRequired: false,
    causeCategory: "agent_runtime",
    details,
  },
});

const capture = () => {
  const runTask = jest.fn<Promise<AgentRuntimeTaskResult>, [AgentRuntimeTaskCommand]>();
  const client = { runTask } as unknown as AgentRuntimeClientPort;
  return { runTask, client };
};

describe("promotion presentation paid task attempt ownership", () => {
  it("retries a task-local cancellation just once with the same frozen command identity", async () => {
    const first = failure("task_cancelled");
    const second = failure("task_cancelled", { gatewayCleanup: "pending" });
    const { client, runTask } = capture();
    runTask.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    await expect(runPromotionPresentationTaskAttempts(client, command)).resolves.toBe(second);
    expect(runTask.mock.calls).toEqual([[command], [command]]);
    expect(runTask.mock.calls[0]?.[0]).toBe(runTask.mock.calls[1]?.[0]);
  });

  it("never replays an exhausted deadline or output-validation rejection", async () => {
    for (const rejected of [
      failure("task_timeout"),
      failure("provider_output_invalid", {
        outputValidationStage: "schema_normalization",
        outputValidationCode: "schema_normalization_failed",
      }),
    ]) {
      Object.defineProperty(rejected, "structuredOutput", {
        get: () => { throw new Error("Rejected provider payload was read"); },
      });
      const { client, runTask } = capture();
      runTask.mockResolvedValueOnce(rejected);
      await expect(runPromotionPresentationTaskAttempts(client, command)).resolves.toBe(rejected);
      expect(runTask.mock.calls).toEqual([[command]]);
    }
  });

  it("propagates transport errors without speculative paid replay", async () => {
    const { client, runTask } = capture();
    const rejection = new Error("synthetic transport rejection");
    runTask.mockRejectedValueOnce(rejection);
    await expect(runPromotionPresentationTaskAttempts(client, command)).rejects.toBe(rejection);
    expect(runTask.mock.calls).toEqual([[command]]);
  });
});
