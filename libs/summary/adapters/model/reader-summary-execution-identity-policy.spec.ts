import type { AgentRuntimeTaskCommand } from "../../ports";
import {
  activeReaderSummaryModel,
  activeReaderSummaryPurposes,
  defaultOpenRouterReaderSummaryModel,
  frozenLegacyReaderSummaryRecoveryContract,
  gatewayDefaultReasoningEffort,
  mimoReaderSummaryBackend,
  mimoReaderSummaryModel,
  openRouterReaderSummaryBackend,
} from "./active-reader-summary-generation-profile";
import { expectedReaderSummaryExecutionRoute } from "./reader-summary-execution-route-identity";
import type { AgentRuntimeExecutionAttestation, AgentRuntimeTaskResult } from "../../ports";
import { AgentRuntimeReaderSummaryModelAdapter } from "./agent-runtime-reader-summary-model.adapter";
import {
  CapturingAgentRuntimeClient,
  readerSummaryInput,
  validReaderProviderDraft,
} from "./agent-runtime-reader-summary-model.spec-support";
import { withTestExecutionAttestation } from "./reader-summary-execution-attestation.spec-support";

type Attestation = AgentRuntimeExecutionAttestation;

const forgedAttestations: readonly {
  readonly name: string;
  readonly change: (value: Attestation) => Attestation;
}[] = [
  { name: "request identity", change: (value) => ({ ...value, requestId: "not-the-command-request" }) },
  { name: "purpose", change: (value) => ({ ...value, purpose: "not-the-command-purpose" }) },
  { name: "provider", change: (value) => ({ ...value, provider: "claude" }) },
  { name: "model", change: (value) => ({ ...value, model: "not-the-selected-model" }) },
  { name: "reasoning effort", change: (value) => ({ ...value, reasoningEffort: "xhigh" }) },
  { name: "canonical request digest", change: (value) => ({ ...value, canonicalRequestSha256: "invalid" }) },
  { name: "selected output digest", change: (value) => ({ ...value, selectedOutputSha256: "0".repeat(64) }) },
  { name: "selected output kind", change: (value) => ({ ...value, selectedOutputKind: "output_text" }) },
];

describe("reader summary attested execution identity policy", () => {
  it.each(forgedAttestations)("rejects forged $name without recording an attestation", async ({ change }) => {
    const recorded: Attestation[] = [];
    const client = new CapturingAgentRuntimeClient(
      {
        status: "completed",
        structuredOutput: validReaderProviderDraft(),
        warnings: [],
      },
      (command, result): AgentRuntimeTaskResult => {
        const attested = withTestExecutionAttestation(command, result);
        if (attested.executionAttestation === undefined) {
          throw new Error("Synthetic completed response did not receive test attestation");
        }
        return {
          ...attested,
          executionAttestation: change(attested.executionAttestation),
        };
      },
    );
    const adapter = new AgentRuntimeReaderSummaryModelAdapter({
      client,
      agentProvider: "codex",
      verifiedAttestationSink: { record: (value) => { recorded.push(value.attestation); } },
    });
    const input = readerSummaryInput();
    const route = adapter.route(
      input,
      {
        preferredProvider: "agent-runtime",
        maxInputTokens: 24_000,
        maxOutputTokens: 16_000,
        maxEstimatedCostUsd: 1,
      },
      { remainingTokens: 40_000, remainingCostUsd: 1 },
    );

    await expect(adapter.generate(input, route)).rejects.toThrow(
      "Reader summary execution attestation is invalid",
    );
    expect(client.commands).toHaveLength(1);
    expect(recorded).toEqual([]);
  });
});

describe("reader summary execution route identity", () => {
  // Only the purpose and route controls are consumed by this pure policy.
  const command = (purpose: string, controls: {
    readonly model: string;
    readonly modelBackend: string;
    readonly reasoningEffort?: string;
  }): AgentRuntimeTaskCommand =>
    ({ purpose, controls }) as AgentRuntimeTaskCommand;

  it("keeps CLI and MiMo generation identities distinct without mutating commands", () => {
    const cli = command(activeReaderSummaryPurposes.generate, {
      model: activeReaderSummaryModel, modelBackend: "openai-chatgpt",
    });
    const mimo = command(activeReaderSummaryPurposes.generate, {
      model: mimoReaderSummaryModel, modelBackend: mimoReaderSummaryBackend,
    });
    const snapshot = JSON.stringify([cli, mimo]);
    expect(expectedReaderSummaryExecutionRoute({ command: cli, taskRole: "summary" }))
      .toEqual({ mimoGeneration: false, gatewayRoute: false,
        expectedModel: activeReaderSummaryModel, expectedEffort: "high" });
    expect(expectedReaderSummaryExecutionRoute({ command: mimo, taskRole: "summary" }))
      .toEqual({ mimoGeneration: true, gatewayRoute: false,
        expectedModel: mimoReaderSummaryModel, expectedEffort: "high" });
    expect(JSON.stringify([cli, mimo])).toBe(snapshot);
  });

  it("takes the selected gateway model/effort from the command, defaulting only an absent effort", () => {
    const gateway = command(activeReaderSummaryPurposes.generate, {
      model: defaultOpenRouterReaderSummaryModel,
      modelBackend: openRouterReaderSummaryBackend,
      reasoningEffort: "low",
    });
    expect(expectedReaderSummaryExecutionRoute({ command: gateway, taskRole: "summary" }))
      .toEqual({ mimoGeneration: false, gatewayRoute: true,
        expectedModel: defaultOpenRouterReaderSummaryModel, expectedEffort: "low" });
    const absentEffort = command(activeReaderSummaryPurposes.generate, {
      model: defaultOpenRouterReaderSummaryModel, modelBackend: openRouterReaderSummaryBackend,
    });
    expect(expectedReaderSummaryExecutionRoute({ command: absentEffort, taskRole: "summary" }))
      .toMatchObject({ gatewayRoute: true, expectedEffort: gatewayDefaultReasoningEffort });
  });

  it("preserves frozen legacy recovery xhigh admission independently of gateway settings", () => {
    const legacy = command(
      frozenLegacyReaderSummaryRecoveryContract.purposes.generate,
      { model: activeReaderSummaryModel, modelBackend: "openai-chatgpt" },
    );
    expect(expectedReaderSummaryExecutionRoute({
      command: legacy,
      taskRole: "summary",
      legacyRecoveryContract: frozenLegacyReaderSummaryRecoveryContract,
    })).toEqual({ mimoGeneration: false, gatewayRoute: false,
      expectedModel: activeReaderSummaryModel, expectedEffort: "xhigh" });
  });
});
