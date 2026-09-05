import { activeReaderSummaryPurposes } from "@social-monitor/summary/adapters/model/active-reader-summary-generation-profile";
import { AgentRuntimeReaderSummaryModelAdapter, resolveAgentRuntimeReaderSummaryModelOptions } from
  "@social-monitor/summary/adapters/model/agent-runtime-reader-summary-model.adapter";
import { AgentRuntimeReaderSummaryTopicLabeler, resolveAgentRuntimeReaderSummaryTopicLabelerOptions } from
  "@social-monitor/summary/adapters/model/agent-runtime-reader-summary-topic-labeler.adapter";
import { AgentRuntimeReaderSummaryTopicRelationVerifier, resolveAgentRuntimeReaderSummaryTopicRelationVerifierOptions } from
  "@social-monitor/summary/adapters/model/agent-runtime-reader-summary-topic-relation-verifier.adapter";
import { resolveAgentRuntimeReaderSummaryStoryRelationVerifierOptions } from
  "@social-monitor/summary/adapters/model/agent-runtime-reader-summary-story-relation-verifier.adapter";
import { BuildReaderSummaryTopicMapUseCase } from
  "@social-monitor/summary/features/build-reader-summary-topic-map/build-reader-summary-topic-map.use-case";
import type { AgentRuntimeClientPort } from "@social-monitor/summary/ports";
import type { VerifiedReaderSummaryExecutionAttestationSink } from
  "@social-monitor/summary/adapters/model/reader-summary-execution-attestation";
import { refreshHash, type RefreshManifest } from "./reader-summary-new-input-refresh-manifest";
import { assertRefreshEqual } from "./reader-summary-new-input-refresh-guard";

const noInvocation: AgentRuntimeClientPort = {
  runTask: async () => { throw new Error("Preparation cannot invoke a model"); },
  checkHealth: async () => { throw new Error("Preparation cannot invoke runtime"); },
};
export function refreshGenerationSha256(env: NodeJS.ProcessEnv): string {
  return refreshHash([
    resolveAgentRuntimeReaderSummaryModelOptions(env, noInvocation),
    resolveAgentRuntimeReaderSummaryTopicLabelerOptions(env, noInvocation),
    resolveAgentRuntimeReaderSummaryTopicRelationVerifierOptions(env, noInvocation),
    resolveAgentRuntimeReaderSummaryStoryRelationVerifierOptions(env, noInvocation),
  ].map(({ client, ...options }) => { void client; return options; }));
}
export function buildRefreshModelWiring(env: NodeJS.ProcessEnv, client: AgentRuntimeClientPort,
  sink: VerifiedReaderSummaryExecutionAttestationSink) {
  return {
    model: new AgentRuntimeReaderSummaryModelAdapter({
      ...resolveAgentRuntimeReaderSummaryModelOptions(env, client), verifiedAttestationSink: sink,
    }),
    topicMap: new BuildReaderSummaryTopicMapUseCase({
      mode: "agent-runtime",
      labeler: new AgentRuntimeReaderSummaryTopicLabeler({
        ...resolveAgentRuntimeReaderSummaryTopicLabelerOptions(env, client), verifiedAttestationSink: sink,
      }),
      relationVerifier: new AgentRuntimeReaderSummaryTopicRelationVerifier({
        ...resolveAgentRuntimeReaderSummaryTopicRelationVerifierOptions(env, client), verifiedAttestationSink: sink,
      }),
    }),
  };
}
export function guardedRefreshRuntime(input: {
  delegate: AgentRuntimeClientPort; manifest: RefreshManifest;
  assertCurrent(): Promise<void>; record(event: unknown): void;
}): AgentRuntimeClientPort {
  const seen = new Set<string>();
  let ambiguous = false;
  let generated = false;
  const purposes: readonly string[] = [activeReaderSummaryPurposes.generate, activeReaderSummaryPurposes.topicLabel,
    activeReaderSummaryPurposes.topicRelations, activeReaderSummaryPurposes.storyRelations,
    activeReaderSummaryPurposes.relatedTopicRelations];
  return {
    checkHealth: (service) => input.delegate.checkHealth(service),
    runTask: async (command, options) => {
      if (!purposes.includes(command.purpose) ||
          (generated && command.purpose === activeReaderSummaryPurposes.generate) || ambiguous || seen.has(command.requestId) || command.metadata?.attempt === "repair" ||
          command.tenantId !== input.manifest.tenantId || command.workspaceId !== input.manifest.workspaceId ||
          command.provider !== "codex" || command.controls.model !== "gpt-5.6-sol" ||
          command.controls.reasoningEffort !== "high") {
        throw new Error("Refresh invocation budget or model authority rejected");
      }
      seen.add(command.requestId);
      if (command.purpose === activeReaderSummaryPurposes.generate) generated = true;
      await input.assertCurrent();
      const identity = { requestId: command.requestId, purpose: command.purpose,
        requestSha256: refreshHash(command), operation: input.manifest.operation,
        observedThrough: input.manifest.observedThrough, model: "gpt-5.6-sol", reasoningEffort: "high" };
      input.record({ ...identity, status: "invocation_consumed" });
      try {
        const result = await input.delegate.runTask(command, options);
        input.record({ ...identity, status: "invocation_returned", outcome: result.status,
          ...(result.usage === undefined ? {} : { tokens: result.usage }) });
        if (result.status !== "completed" || result.executionAttestation === undefined || result.usage === undefined) {
          throw new Error("Refresh invocation outcome requires reconciliation");
        }
        const attestation = result.executionAttestation;
        assertRefreshEqual({ engine: attestation.runtimeEngine, packageVersion: attestation.runtimePackageVersion,
          launcherSha256: attestation.launcherSha256 }, input.manifest.runtime, "runtime attestation");
        input.record({ ...identity, status: result.status, tokens: result.usage,
          outputSha256: attestation.selectedOutputSha256 });
        return result;
      } catch {
        ambiguous = true;
        input.record({ ...identity, status: "requires_reconciliation" });
        throw new Error("Refresh invocation failed or is ambiguous; original operation remains consumed");
      }
    },
  };
}
