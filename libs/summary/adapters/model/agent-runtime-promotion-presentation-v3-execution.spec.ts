import type {
  ReaderPostPresentationV3Input,
} from "../../domain/services/reader-post-presentation-v3";
import type {
  AgentRuntimeClientPort,
  AgentRuntimeTaskCommand,
  AgentRuntimeTaskResult,
} from "../../ports";
import { executeAgentRuntimePromotionPresentation } from "./agent-runtime-promotion-presentation-v3-execution";
import type { createPromotionPresentationTaskCommand } from "./agent-runtime-promotion-presentation-v3-task-command";

const command = { requestId: "synthetic-presentation-request" } as AgentRuntimeTaskCommand;
const inputs = [{}] as unknown as readonly ReaderPostPresentationV3Input[];
const catalogCandidates = [] as ReturnType<typeof createPromotionPresentationTaskCommand>["catalogCandidates"];

const invoke = async (replies: readonly AgentRuntimeTaskResult[]) => {
  const runTask = jest.fn<Promise<AgentRuntimeTaskResult>, [AgentRuntimeTaskCommand]>();
  for (const reply of replies) runTask.mockResolvedValueOnce(reply);
  const client = { runTask } as unknown as AgentRuntimeClientPort;
  const results = await executeAgentRuntimePromotionPresentation({
    client, command, inputs, catalogCandidates, sourceCopyWire: false,
    modelBackend: "openai-chatgpt",
  });
  return { results, runTask };
};

const failure = (code: string, details: Record<string, string> = {}): AgentRuntimeTaskResult => ({
  status: "failed", warnings: [], failure: {
    code, safeMessage: "Synthetic rejected task", retryable: false,
    reconnectRequired: false, causeCategory: "agent_runtime", details,
  },
});

describe("promotion presentation execution trust boundary", () => {
  it("uses one identical task command for the single permitted transient retry", async () => {
    const first = failure("task_cancelled");
    const second = failure("task_cancelled", { gatewayCleanup: "pending" });
    const { results, runTask } = await invoke([first, second]);
    expect(runTask).toHaveBeenCalledTimes(2);
    expect(runTask.mock.calls.map(([request]) => request)).toEqual([command, command]);
    expect(results).toEqual([{ status: "unavailable", reason: "runtime_failure",
      runtimeFailure: { code: "task_cancelled", causeCategory: "agent_runtime" },
      cleanupPending: true }]);
  });

  it("does not retry an exhausted deadline", async () => {
    const { results, runTask } = await invoke([failure("task_timeout")]);
    expect(runTask).toHaveBeenCalledTimes(1);
    expect(results).toEqual([{ status: "unavailable", reason: "runtime_failure",
      runtimeFailure: { code: "task_timeout", causeCategory: "agent_runtime" } }]);
  });

  it("does not read rejected provider output during explicit schema failure", async () => {
    const rejected = failure("provider_output_invalid", {
      outputValidationStage: "schema_normalization",
      outputValidationCode: "schema_normalization_failed",
    });
    Object.defineProperty(rejected, "structuredOutput", { get: () => {
      throw new Error("Untrusted rejected output was read");
    } });
    const { results, runTask } = await invoke([rejected]);
    expect(runTask).toHaveBeenCalledTimes(1);
    expect(results).toEqual([{ status: "unavailable", reason: "invalid_presentation",
      validation: { stage: "runtime_output", code: "schema_normalization_failed" } }]);
  });
});
