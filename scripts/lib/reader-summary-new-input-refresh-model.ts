import { sourceContentAssessmentPurpose, refreshAssessmentBudget, refreshAssessmentLimits, verifyRefreshAssessmentExecution } from "./reader-summary-new-input-refresh-assessment-runtime";
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
import type { AgentRuntimeClientPort, AgentRuntimeTaskCommand, AgentRuntimeTaskResult, ReaderSummaryModelPort } from "@social-monitor/summary/ports";
import { verifyAndRecordReaderSummaryExecution, type ReaderSummaryAttestedTaskRole, type VerifiedReaderSummaryExecutionAttestationSink } from
  "@social-monitor/summary/adapters/model/reader-summary-execution-attestation";
import { refreshHash, type RefreshManifest } from "./reader-summary-new-input-refresh-manifest";
import { assertRefreshEqual } from "./reader-summary-new-input-refresh-guard";

const noInvocation: AgentRuntimeClientPort = {
  runTask: async () => { throw new Error("Preparation cannot invoke a model"); },
  checkHealth: async () => { throw new Error("Preparation cannot invoke runtime"); },
};
export function refreshCaptureModelControls(env: NodeJS.ProcessEnv) {
  return { assessment: refreshAssessmentLimits, generation: [
    resolveAgentRuntimeReaderSummaryModelOptions(env, noInvocation),
    resolveAgentRuntimeReaderSummaryTopicLabelerOptions(env, noInvocation),
    resolveAgentRuntimeReaderSummaryTopicRelationVerifierOptions(env, noInvocation),
    resolveAgentRuntimeReaderSummaryStoryRelationVerifierOptions(env, noInvocation),
  ].map(({ client, ...options }) => { void client; return options; }) };
}
export function refreshGenerationSha256(env: NodeJS.ProcessEnv): string {
  return refreshHash(refreshCaptureModelControls(env));
}
export type GuardedRefreshRuntime = AgentRuntimeClientPort & {
  assertUsable(): void;
  invalidateAdapter(taskRole: ReaderSummaryAttestedTaskRole | "source_content_assessment"): void;
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
// This boundary validates the runtime envelope. Concrete assessment/relation
// parsers separately capture semantic acceptance; envelope validity is not it.
export type RefreshModelCaptureEvent =
  | { readonly kind: "invocation_rejected"; readonly command: AgentRuntimeTaskCommand;
      readonly delegated: false; readonly reason: "in_flight" | "duplicate_request" | "generation_already_consumed" | "authority_rejected" }
  | { readonly kind: "envelope_not_consumed"; readonly command: AgentRuntimeTaskCommand;
      readonly selectionOutcome: "not_consumed"; readonly reason: "deadline" | "aborted" | "authority_or_runtime_rejected";
      readonly result: Pick<AgentRuntimeTaskResult, "status" | "structuredOutput" | "usage" | "durationMs" | "executionAttestation"> }
  | { readonly kind: "invocation_started"; readonly command: AgentRuntimeTaskCommand }
  | { readonly kind: "invocation_returned"; readonly requestId: string; readonly status: AgentRuntimeTaskResult["status"] }
  | { readonly kind: "invocation_aborted"; readonly requestId: string }
  | { readonly kind: "invocation_failed"; readonly requestId: string; readonly delegated: boolean }
  | { readonly kind: "envelope_verified"; readonly command: AgentRuntimeTaskCommand;
      readonly result: Pick<AgentRuntimeTaskResult, "status" | "structuredOutput" | "usage" | "durationMs" | "executionAttestation"> };

export function guardedRefreshRuntime(input: {
  delegate: AgentRuntimeClientPort; manifest: RefreshManifest; now?: () => number;
  assertLocal(): void; assertCurrent(): Promise<void>; record(event: unknown): void;
  capture?(event: RefreshModelCaptureEvent): void; captureFailure?(): void;
}): GuardedRefreshRuntime {
  const capture = (event: RefreshModelCaptureEvent) => {
    if (!input.capture) return;
    try { input.capture(structuredClone(event)); }
    catch {
      // IO/observer failures are separate from consumed model authority. Never
      // send a callback exception through the reconciliation/retry path.
      try { input.captureFailure?.(); } catch { /* capture owner retains failure */ }
    }
  };
  const assessment = refreshAssessmentBudget(input.now ?? Date.now);
  const seen = new Set<string>();
  let ambiguous = false;
  let generated = false;
  let exclusiveInFlight = false;
  const assessmentInFlight = new Set<string>();
  const assertUsable = () => {
    if (ambiguous) throw new Error("Refresh invocation budget requires reconciliation");
    try { input.assertLocal(); } catch (error) { ambiguous = true; throw error; }
  };
  const purposes: readonly string[] = [activeReaderSummaryPurposes.generate, activeReaderSummaryPurposes.topicLabel,
    activeReaderSummaryPurposes.topicRelations, activeReaderSummaryPurposes.storyRelations,
    activeReaderSummaryPurposes.relatedTopicRelations, sourceContentAssessmentPurpose];
  const expectedReasoningEffort = (purpose: string) =>
    purpose === sourceContentAssessmentPurpose ? "low" : "high";
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
      const isAssessment = command.purpose === sourceContentAssessmentPurpose;
      const concurrencyFull = isAssessment
        ? exclusiveInFlight || assessmentInFlight.size >= 6
        : exclusiveInFlight || assessmentInFlight.size > 0;
      if (ambiguous || concurrencyFull || seen.has(command.requestId) ||
          (generated && command.purpose === activeReaderSummaryPurposes.generate)) {
        // Only scoped, allowed task inputs can enter the private tape. This is
        // an attempt, not admission, and must not change guard state.
        if (purposes.includes(command.purpose) && command.metadata?.attempt !== "repair" &&
            command.tenantId === input.manifest.tenantId && command.workspaceId === input.manifest.workspaceId &&
            command.provider === "codex" && command.controls.model === "gpt-5.6-sol" &&
            command.controls.reasoningEffort === expectedReasoningEffort(command.purpose)) {
          capture({ kind: "invocation_rejected", command, delegated: false,
            reason: ambiguous ? "authority_rejected" : concurrencyFull ? "in_flight" :
              seen.has(command.requestId) ? "duplicate_request" : "generation_already_consumed" });
        }
        throw new Error("Refresh invocation budget or model authority rejected");
      }
      if (!purposes.includes(command.purpose) || command.metadata?.attempt === "repair" ||
          command.tenantId !== input.manifest.tenantId || command.workspaceId !== input.manifest.workspaceId ||
          command.provider !== "codex" || command.controls.model !== "gpt-5.6-sol" ||
          command.controls.reasoningEffort !== expectedReasoningEffort(command.purpose)) {
        ambiguous = true;
        throw new Error("Refresh invocation budget or model authority rejected");
      }
      seen.add(command.requestId);
      if (command.purpose === activeReaderSummaryPurposes.generate) generated = true;
      if (isAssessment) assessmentInFlight.add(command.requestId);
      else exclusiveInFlight = true;
      let delegated = false;
      let returnedResult: AgentRuntimeTaskResult | undefined;
      let canonicalRequestSha256: string | undefined;
      let notConsumedReason: "deadline" | "aborted" | "authority_or_runtime_rejected" = "authority_or_runtime_rejected";
      let removeAbortCapture: (() => void) | undefined;
      let capturedCommand: AgentRuntimeTaskCommand | undefined;
      if (input.capture) {
        try { capturedCommand = structuredClone(command); }
        catch { try { input.captureFailure?.(); } catch { /* capture owner retains failure */ } }
      }
      const identity = { requestId: command.requestId, purpose: command.purpose,
        requestSha256: refreshHash(command), operation: input.manifest.operation,
        observedThrough: input.manifest.observedThrough, model: "gpt-5.6-sol",
        reasoningEffort: expectedReasoningEffort(command.purpose) };
      const verifyResponse = (result: AgentRuntimeTaskResult): void | Promise<unknown> => {
        const taskRole = ({
          [activeReaderSummaryPurposes.generate]: "summary",
          [activeReaderSummaryPurposes.topicLabel]: "topic_label",
          [activeReaderSummaryPurposes.topicRelations]: "topic_relation",
          [activeReaderSummaryPurposes.storyRelations]: "story_relation",
          [activeReaderSummaryPurposes.relatedTopicRelations]: "related_topic_relation",
        } as Record<string, ReaderSummaryAttestedTaskRole>)[command.purpose]!;
        // Verify the attested response envelope here. The composed adapter guard
        // above also covers failures in the real parsers and normalizers.
        if (command.purpose === sourceContentAssessmentPurpose) {
          verifyRefreshAssessmentExecution(command, result);
        } else {
          return verifyAndRecordReaderSummaryExecution({ command, result, taskRole,
            attempt: "primary", normalizedOutput: result.structuredOutput });
        }
      };
      const verifyIdentity = (result: AgentRuntimeTaskResult) => {
        const attestation = result.executionAttestation!;
        if (attestation.canonicalRequestSha256 !== canonicalRequestSha256) {
          throw new Error("Refresh execution attestation does not bind the invoked request");
        }
        assertRefreshEqual({ engine: attestation.runtimeEngine, packageVersion: attestation.runtimePackageVersion,
          launcherSha256: attestation.launcherSha256 }, input.manifest.runtime, "runtime attestation");
      };
      try {
        if (capturedCommand) capture({ kind: "invocation_started", command: capturedCommand });
        assertUsable();
        const assessmentUsage = command.purpose === sourceContentAssessmentPurpose ? assessment.consume(command) : {};
        // Match GrpcAgentRuntimeClient JSON serialization and the service's
        // optional-string normalization, then use the executor's real admission
        // contract for profile defaults/controls. Hash before any awaited work;
        // the journal's refreshHash(command) is not the canonical runtime request.
        canonicalRequestSha256 = canonicalJsonSha256(admitSubscriptionRuntimeRequest({
          ...command,
          providerInstanceId: command.providerInstanceId?.trim() || undefined,
          cwd: command.cwd?.trim() || undefined,
          outputSchemaJson: JSON.stringify(command.outputSchema),
          controlsJson: JSON.stringify(command.controls),
          metadata: command.metadata ?? {},
        }).canonicalRequest);
        await input.assertCurrent();
        assertUsable();
        input.record({ ...identity, ...assessmentUsage, status: "invocation_consumed" });
        assertUsable(); // fsync/recording can itself cross the cutoff.

        if (command.purpose === sourceContentAssessmentPurpose) {
          assessment.assertTimely(command);
          if (options?.signal?.aborted) throw new Error("Refresh assessment cancelled");
        }
        if (input.capture && options?.signal) {
          const signal = options.signal;
          const onAbort = () => capture({ kind: "invocation_aborted", requestId: command.requestId });
          signal.addEventListener("abort", onAbort, { once: true });
          removeAbortCapture = () => signal.removeEventListener("abort", onAbort);
          if (signal.aborted) onAbort();
        }
        delegated = true;
        const result = await input.delegate.runTask(command, options);
        returnedResult = result;
        if (["completed", "failed", "waiting_for_input"].includes(result.status)) {
          capture({ kind: "invocation_returned", requestId: command.requestId, status: result.status });
        } else if (input.capture) {
          try { input.captureFailure?.(); } catch { /* capture owner retains failure */ }
        }
        input.record({ ...identity, status: "invocation_returned", outcome: result.status,
          ...(result.usage === undefined ? {} : { tokens: result.usage }) });
        if (result.status !== "completed" || result.executionAttestation === undefined || result.usage === undefined) {
          throw new Error("Refresh invocation outcome requires reconciliation");
        }
        if (command.purpose === sourceContentAssessmentPurpose) {
          try { assessment.assertTimely(command); }
          catch (error) { notConsumedReason = "deadline"; throw error; }
          if (options?.signal?.aborted) { notConsumedReason = "aborted"; throw new Error("Refresh assessment cancelled"); }
        }
        const verification = verifyResponse(result);
        if (verification) await verification;
        verifyIdentity(result);
        const attestation = result.executionAttestation;
        assertUsable();
        if (command.purpose === sourceContentAssessmentPurpose) {
          input.record({ ...identity, status: "verified_attestation", taskRole: "source_content_assessment", attestation });
        }
        input.record({ ...identity, status: result.status, tokens: result.usage,
          outputSha256: attestation.selectedOutputSha256 });
        assertUsable();
        if (capturedCommand) capture({ kind: "envelope_verified", command: capturedCommand,
          result: { status: result.status, structuredOutput: result.structuredOutput, usage: result.usage,
            durationMs: result.durationMs, executionAttestation: result.executionAttestation } });
        return result;
      } catch {
        ambiguous = true;
        // A paid response can be independently valid while admission for
        // selection has expired. Retain only verified semantic bytes, without
        // retrying the delegate or restoring publication authority.
        if (capturedCommand && returnedResult) {
          try {
            const verification = verifyResponse(returnedResult);
            if (verification) await verification;
            verifyIdentity(returnedResult);
            capture({ kind: "envelope_not_consumed", command: capturedCommand,
              selectionOutcome: "not_consumed", reason: notConsumedReason,
              result: { status: returnedResult.status, structuredOutput: returnedResult.structuredOutput,
                usage: returnedResult.usage, durationMs: returnedResult.durationMs,
                executionAttestation: returnedResult.executionAttestation } });
          } catch { /* Unvalidated diagnostics never enter the private tape. */ }
        }
        capture({ kind: "invocation_failed", requestId: command.requestId, delegated });
        input.record({ ...identity, status: "requires_reconciliation" });
        throw new Error("Refresh invocation failed or is ambiguous; original operation remains consumed");
      } finally {
        removeAbortCapture?.();
        if (isAssessment) assessmentInFlight.delete(command.requestId);
        else exclusiveInFlight = false;
      }
    },
  };
}
