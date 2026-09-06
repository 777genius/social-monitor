import { activeReaderSummaryPurposes } from "@social-monitor/summary/adapters/model/active-reader-summary-generation-profile";
import { canonicalJsonSha256 } from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import { admitSubscriptionRuntimeRequest } from "../../apps/agent-runtime/src/subscription-runtime-purpose-model-policy";
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
import type { AgentRuntimeClientPort, ReaderSummaryModelPort } from "@social-monitor/summary/ports";
import { verifyAndRecordReaderSummaryExecution, type ReaderSummaryAttestedTaskRole, type VerifiedReaderSummaryExecutionAttestationSink } from
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
type GuardedRefreshRuntime = AgentRuntimeClientPort & {
  assertUsable(): void;
  invalidateAdapter(taskRole: ReaderSummaryAttestedTaskRole): void;
};

export function buildRefreshModelWiring(env: NodeJS.ProcessEnv, client: GuardedRefreshRuntime,
  sink: VerifiedReaderSummaryExecutionAttestationSink) {
  const model = new AgentRuntimeReaderSummaryModelAdapter({
    ...resolveAgentRuntimeReaderSummaryModelOptions(env, client), verifiedAttestationSink: sink,
  });
  const labeler = new AgentRuntimeReaderSummaryTopicLabeler({
    ...resolveAgentRuntimeReaderSummaryTopicLabelerOptions(env, client), verifiedAttestationSink: sink,
  });
  const relationVerifier = new AgentRuntimeReaderSummaryTopicRelationVerifier({
    ...resolveAgentRuntimeReaderSummaryTopicRelationVerifierOptions(env, client), verifiedAttestationSink: sink,
  });
  // The real adapters own parsing and completeness/normalization. Poison their
  // failures before a workflow can catch them and accept a fallback candidate.
  // A valid plan's later coverage-only rejection never passes through this catch.
  const validated = async <T>(taskRole: ReaderSummaryAttestedTaskRole, action: () => Promise<T>): Promise<T> => {
    try {
      client.assertUsable();
      const result = await action();
      client.assertUsable();
      return result;
    } catch (error) {
      client.invalidateAdapter(taskRole);
      throw error;
    }
  };
  return {
    model: {
      route: (...args) => model.route(...args),
      estimate: (...args) => model.estimate(...args),
      generate: (...args) => validated("summary", () => model.generate(...args)),
      validateRawProviderResponse: (attempt) => {
        const result = model.validateRawProviderResponse(attempt);
        if (!result.ok) client.invalidateAdapter("summary");
        return result;
      },
      classifyError: (error) => model.classifyError(error),
    } satisfies ReaderSummaryModelPort,
    topicMap: new BuildReaderSummaryTopicMapUseCase({
      // The normal workflow owns at most two complete topic-map attempts after
      // a known coverage-only rejection. This is separate from primary generation.
      mode: "agent-runtime",
      labeler: { label: (...args) => validated("topic_label", () => labeler.label(...args)) },
      relationVerifier: { verify: (...args) => validated("topic_relation", () => relationVerifier.verify(...args)) },
    }),
  };
}
export function guardedRefreshRuntime(input: {
  delegate: AgentRuntimeClientPort; manifest: RefreshManifest;
  assertLocal(): void; assertCurrent(): Promise<void>; record(event: unknown): void;
}): GuardedRefreshRuntime {
  const seen = new Set<string>();
  let ambiguous = false;
  let generated = false;
  let inFlight = false;
  const assertUsable = () => {
    if (ambiguous) throw new Error("Refresh invocation budget requires reconciliation");
    try { input.assertLocal(); } catch (error) { ambiguous = true; throw error; }
  };
  const purposes: readonly string[] = [activeReaderSummaryPurposes.generate, activeReaderSummaryPurposes.topicLabel,
    activeReaderSummaryPurposes.topicRelations, activeReaderSummaryPurposes.storyRelations,
    activeReaderSummaryPurposes.relatedTopicRelations];
  return {
    assertUsable,
    invalidateAdapter: (taskRole) => {
      if (ambiguous) return;
      ambiguous = true; // Recording failure must not restore authority either.
      input.record({ status: "requires_reconciliation", phase: "adapter_validation", taskRole,
        operation: input.manifest.operation, observedThrough: input.manifest.observedThrough });
    },
    checkHealth: async (service) => {
      try { assertUsable(); return await input.delegate.checkHealth(service); }
      catch (error) { ambiguous = true; throw error; }
    },
    runTask: async (command, options) => {
      if (ambiguous || inFlight || seen.has(command.requestId) ||
          (generated && command.purpose === activeReaderSummaryPurposes.generate)) {
        throw new Error("Refresh invocation budget or model authority rejected");
      }
      if (!purposes.includes(command.purpose) || command.metadata?.attempt === "repair" ||
          command.tenantId !== input.manifest.tenantId || command.workspaceId !== input.manifest.workspaceId ||
          command.provider !== "codex" || command.controls.model !== "gpt-5.6-sol" ||
          command.controls.reasoningEffort !== "high") {
        ambiguous = true;
        throw new Error("Refresh invocation budget or model authority rejected");
      }
      seen.add(command.requestId);
      if (command.purpose === activeReaderSummaryPurposes.generate) generated = true;
      inFlight = true;
      const identity = { requestId: command.requestId, purpose: command.purpose,
        requestSha256: refreshHash(command), operation: input.manifest.operation,
        observedThrough: input.manifest.observedThrough, model: "gpt-5.6-sol", reasoningEffort: "high" };
      try {
        assertUsable();
        // Match GrpcAgentRuntimeClient JSON serialization and the service's
        // optional-string normalization, then use the executor's real admission
        // contract for profile defaults/controls. Hash before any awaited work;
        // the journal's refreshHash(command) is not the canonical runtime request.
        const canonicalRequestSha256 = canonicalJsonSha256(admitSubscriptionRuntimeRequest({
          ...command,
          providerInstanceId: command.providerInstanceId?.trim() || undefined,
          cwd: command.cwd?.trim() || undefined,
          outputSchemaJson: JSON.stringify(command.outputSchema),
          controlsJson: JSON.stringify(command.controls),
          metadata: command.metadata ?? {},
        }).canonicalRequest);
        await input.assertCurrent();
        assertUsable();
        input.record({ ...identity, status: "invocation_consumed" });
        assertUsable(); // fsync/recording can itself cross the cutoff.

        const result = await input.delegate.runTask(command, options);
        input.record({ ...identity, status: "invocation_returned", outcome: result.status,
          ...(result.usage === undefined ? {} : { tokens: result.usage }) });
        if (result.status !== "completed" || result.executionAttestation === undefined || result.usage === undefined) {
          throw new Error("Refresh invocation outcome requires reconciliation");
        }
        const taskRole = ({
          [activeReaderSummaryPurposes.generate]: "summary",
          [activeReaderSummaryPurposes.topicLabel]: "topic_label",
          [activeReaderSummaryPurposes.topicRelations]: "topic_relation",
          [activeReaderSummaryPurposes.storyRelations]: "story_relation",
          [activeReaderSummaryPurposes.relatedTopicRelations]: "related_topic_relation",
        } as Record<string, ReaderSummaryAttestedTaskRole>)[command.purpose]!;
        // Verify the attested response envelope here. The composed adapter guard
        // above also covers failures in the real parsers and normalizers.
        await verifyAndRecordReaderSummaryExecution({ command, result, taskRole,
          attempt: "primary", normalizedOutput: result.structuredOutput });
        const attestation = result.executionAttestation;
        if (attestation.canonicalRequestSha256 !== canonicalRequestSha256) {
          throw new Error("Refresh execution attestation does not bind the invoked request");
        }
        assertRefreshEqual({ engine: attestation.runtimeEngine, packageVersion: attestation.runtimePackageVersion,
          launcherSha256: attestation.launcherSha256 }, input.manifest.runtime, "runtime attestation");
        assertUsable();
        input.record({ ...identity, status: result.status, tokens: result.usage,
          outputSha256: attestation.selectedOutputSha256 });
        assertUsable();
        return result;
      } catch {
        ambiguous = true;
        input.record({ ...identity, status: "requires_reconciliation" });
        throw new Error("Refresh invocation failed or is ambiguous; original operation remains consumed");
      } finally { inFlight = false; }
    },
  };
}
