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
