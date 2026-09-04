import type {
  AgentRuntimeExecutionRequest,
  AgentRuntimeExecutionResult,
  AgentRuntimeExecutorPort,
} from "../../apps/agent-runtime/src/agent-runtime-executor.port";
import {
  readerPromotionV2CanaryActivationCapability,
  readerPromotionV2CanaryOutputSchema,
  readerPromotionV2CanarySchemaName,
  readerPromotionV2CanarySchemaVersion,
  admitSubscriptionRuntimeRequest,
} from "../../apps/agent-runtime/src/subscription-runtime-purpose-model-policy";
import { readerPromotionV2CanaryOutputIsValid } from
  "../../apps/agent-runtime/src/reader-promotion-v2-canary-contract";
import { reconcileStoryRelationDecisions } from
  "@social-monitor/summary/domain/services/story-relation-decision-trace";
import { STORY_RELATION_APPROVAL_CONFIDENCE_MIN } from
  "@social-monitor/summary/domain/services/story-relation-candidates";
import type { StoryRelationCandidate } from
  "@social-monitor/summary/domain/services/story-relation-candidates";

import {
  CANARY_RECEIPT_FORMAT,
  type CanaryArtifact,
  type CanaryBinding,
  type CanaryManifest,
  type CanaryProvenance,
  type CanaryReceipt,
  assertCanaryAttestation,
  assertCanaryProvenance,
  assertCanaryUsage,
  canonicalSha256,
  canaryManifestSha256,
  canarySchemaSha256,
  sha256,
} from "./reader-promotion-v2-production-canary-contract";
import type { ReaderPromotionV2ProductionCanaryStore } from
  "./reader-promotion-v2-production-canary-store";
import { runReaderPromotionV2ProductAssertions } from
  "./reader-promotion-v2-production-canary-product-assertions";

export type CanaryRunInput = {
  readonly targetSha: string;
  readonly ownerId: string;
  readonly fence: string;
  readonly provenance: CanaryProvenance;
};

export type CanaryRunResult = {
  readonly state: "SUCCEEDED" | "REJECTED" | "IN_PROGRESS";
  readonly receipt: CanaryReceipt | null;
};

export class ReaderPromotionV2ProductionCanaryRunner {
  constructor(private readonly dependencies: {
    readonly manifest: CanaryManifest;
    readonly store: ReaderPromotionV2ProductionCanaryStore;
    readonly executor: AgentRuntimeExecutorPort;
    readonly afterModelRunning?: () => Promise<void>;
    readonly afterProviderResponse?: () => Promise<void>;
    readonly afterModelCompleted?: () => Promise<void>;
  }) {}

  async run(input: CanaryRunInput): Promise<CanaryRunResult> {
    assertCanaryProvenance(input.provenance, input.targetSha);
    const request = this.request(input);
    const canonicalRequest = admitSubscriptionRuntimeRequest(
      request,
      readerPromotionV2CanaryActivationCapability,
    ).canonicalRequest;
    const requestedBinding = {
      singletonId: this.dependencies.manifest.singletonId,
      ownerId: input.ownerId,
      fence: input.fence,
      manifestSha256: canaryManifestSha256(this.dependencies.manifest),
      schemaName: readerPromotionV2CanarySchemaName,
      schemaVersion: readerPromotionV2CanarySchemaVersion,
      schemaSha256: canarySchemaSha256(),
      model: this.dependencies.manifest.model,
      reasoningEffort: this.dependencies.manifest.reasoningEffort,
      canonicalRequestSha256: canonicalSha256(canonicalRequest),
      ...input.provenance,
    };
    const claim = await this.dependencies.store.claim(requestedBinding);
    if (claim.action === "TERMINAL") return terminalResult(claim.snapshot);
    if (claim.action === "IN_PROGRESS") return {
      state: "IN_PROGRESS", receipt: null,
    };
    const binding: CanaryBinding = claim.snapshot.binding;
    if (claim.snapshot.state === "MODEL_COMPLETED") {
      return this.finalize(binding, claim.snapshot.outcome ?? "UNCERTAIN",
        claim.snapshot.artifactSha256,
        claim.snapshot.artifact?.usage ?? null);
    }
    if (claim.snapshot.state === "MODEL_RUNNING") {
      return { state: "IN_PROGRESS", receipt: null };
    }

    const barrier = await this.dependencies.store.markModelRunning(binding);
    if (barrier.action !== "ENTER") {
      return { state: "IN_PROGRESS", receipt: null };
    }
    let providerResult: AgentRuntimeExecutionResult;
    try {
      await this.dependencies.afterModelRunning?.();
      providerResult = await this.dependencies.executor.execute(request);
      await this.dependencies.afterProviderResponse?.();
    } catch {
      return terminalResult(await this.dependencies.store.rejectUncertain(binding));
    }
    if (providerResult.status !== "completed") {
      if (!definitiveFailure(providerResult)) {
        return terminalResult(
          await this.dependencies.store.rejectUncertain(binding),
        );
      }
      await this.dependencies.store.completeModel({
        binding,
        outcome: "EXPLICIT_FAILURE",
        artifact: null,
        artifactSha256: null,
      });
      await this.dependencies.afterModelCompleted?.();
      return this.finalize(binding, "EXPLICIT_FAILURE", null, null);
    }

    let artifact: CanaryArtifact;
    try {
      artifact = await this.responseArtifact(providerResult, binding);
    } catch {
      await this.dependencies.store.completeModel({
        binding,
        outcome: "EXPLICIT_FAILURE",
        artifact: null,
        artifactSha256: null,
      });
      await this.dependencies.afterModelCompleted?.();
      return this.finalize(binding, "EXPLICIT_FAILURE", null, null);
    }
    const artifactSha256 = canonicalSha256(artifact);
    await this.dependencies.store.completeModel({
      binding,
      outcome: "RESPONSE",
      artifact,
      artifactSha256,
    });
    await this.dependencies.afterModelCompleted?.();
    return this.finalize(binding, "RESPONSE", artifactSha256, artifact.usage);
  }

  private async responseArtifact(
    result: AgentRuntimeExecutionResult,
    binding: CanaryBinding,
  ): Promise<CanaryArtifact> {
    const output = result.structuredOutput;
    if (output === undefined || !readerPromotionV2CanaryOutputIsValid(output)) {
      throw new Error("canary_output_invalid");
    }
    const outputSha256 = canonicalSha256(output);
    assertCanaryAttestation({
      attestation: result.executionAttestation,
      binding,
      outputSha256,
    });
    const decisions = Array.isArray(output.decisions) ? output.decisions : [];
    const allowedOrientations = new Set(this.dependencies.manifest.relationBatch
      .map((relation) =>
        `${relation.leftFeedItemId}\u0000${relation.rightFeedItemId}`));
    if (decisions.some((decision) => !record(decision) ||
        typeof decision.leftFeedItemId !== "string" ||
        typeof decision.rightFeedItemId !== "string" ||
        !allowedOrientations.has(
          `${decision.leftFeedItemId}\u0000${decision.rightFeedItemId}`,
        ))) throw new Error("canary_relation_orientation_invalid");
    const reconciliation = reconcileStoryRelationDecisions({
      candidates: relationCandidates(this.dependencies.manifest),
      decisions,
      rankingPolicyVersion: "story_ranking_v10",
      approvalThreshold: STORY_RELATION_APPROVAL_CONFIDENCE_MIN,
    });
    if (!reconciliation.responseAccepted ||
        reconciliation.traces.some((trace, index) =>
          trace.sameStory !== this.dependencies.manifest.relationBatch[index]?.sameStory ||
          (trace.confidenceScore ?? 0) < STORY_RELATION_APPROVAL_CONFIDENCE_MIN ||
          trace.rationalePresent !== true || trace.applied !==
            this.dependencies.manifest.relationBatch[index]?.sameStory)) {
      throw new Error("canary_relation_assertion_failed");
    }
    const productAssertions = await runReaderPromotionV2ProductAssertions();
    const usage = assertCanaryUsage(result.usage);
    return {
      format: "reader-promotion-v2-production-canary-artifact.v1",
      manifestSha256: binding.manifestSha256,
      schemaSha256: binding.schemaSha256,
      canonicalRequestSha256: binding.canonicalRequestSha256,
      outputSha256,
      decisions: reconciliation.traces.map((trace, index) => ({
        leftFeedItemId:
          this.dependencies.manifest.relationBatch[index]?.leftFeedItemId ?? "",
        rightFeedItemId:
          this.dependencies.manifest.relationBatch[index]?.rightFeedItemId ?? "",
        sameStory: trace.sameStory === true,
        confidenceScore: trace.confidenceScore ?? 0,
      })),
      productAssertionsSha256: canonicalSha256(productAssertions),
      usage,
    };
  }

  private async finalize(
    binding: CanaryBinding,
    outcome: "RESPONSE" | "EXPLICIT_FAILURE" | "UNCERTAIN",
    artifactSha256: string | null,
    usage: CanaryArtifact["usage"] | null,
  ): Promise<CanaryRunResult> {
    const succeeded = outcome === "RESPONSE" && artifactSha256 !== null;
    const receipt: CanaryReceipt = {
      format: CANARY_RECEIPT_FORMAT,
      singletonId: binding.singletonId,
      state: succeeded ? "SUCCEEDED" : "REJECTED",
      outcome,
      protectedMainSha: binding.protectedMainSha,
      deployedReleaseSha: binding.deployedReleaseSha,
      deployedBackendSha: binding.deployedBackendSha,
      deployedControlSha: binding.deployedControlSha,
      deployedRuntimeSha: binding.deployedRuntimeSha,
      runtimeImageId: binding.runtimeImageId,
      manifestSha256: binding.manifestSha256,
      schemaName: binding.schemaName,
      schemaVersion: binding.schemaVersion,
      schemaSha256: binding.schemaSha256,
      model: binding.model,
      reasoningEffort: binding.reasoningEffort,
      canonicalRequestSha256: binding.canonicalRequestSha256,
      workflow: binding.workflow,
      workflowRunId: binding.workflowRunId,
      workflowRunAttempt: binding.workflowRunAttempt,
      fence: binding.fence,
      runtimePackageVersion: binding.runtimePackageVersion,
      runtimePackageSha256: binding.runtimePackageSha256,
      launcherSha256: binding.launcherSha256,
      artifactSha256,
      usage,
      rejectionCode: succeeded ? null : `model_${outcome.toLowerCase()}`,
    };
    const snapshot = await this.dependencies.store.finalize({
      binding,
      receipt,
      receiptSha256: canonicalSha256(receipt),
    });
    return terminalResult(snapshot);
  }

  private request(input: CanaryRunInput): AgentRuntimeExecutionRequest {
    const manifest = this.dependencies.manifest;
    return {
      requestId: `${manifest.singletonId}:${input.fence}`,
      tenantId: "00000000-0000-0000-0000-000000000000",
      workspaceId: "00000000-0000-0000-0000-000000000000",
      correlationId: sha256(`${input.ownerId}:${input.fence}`).slice(0, 32),
      provider: "codex",
      purpose: manifest.purpose,
      systemPrompt: "Return only the schema-conforming relation decisions.",
      prompt: JSON.stringify(manifest.relationBatch.map((relation) => ({
        leftFeedItemId: relation.leftFeedItemId,
        rightFeedItemId: relation.rightFeedItemId,
        leftLabel: relation.leftLabel,
        rightLabel: relation.rightLabel,
      }))),
      outputSchemaJson: JSON.stringify(readerPromotionV2CanaryOutputSchema),
      controlsJson: JSON.stringify({
        outputSchemaName: manifest.schema.name,
        schemaVersion: manifest.schema.version,
        model: manifest.model,
        reasoningEffort: manifest.reasoningEffort,
      }),
      timeoutMs: manifest.providerTimeoutMs,
      metadata: {},
    };
  }
}

const terminalResult = (snapshot: {
  readonly state: string;
  readonly receipt: CanaryReceipt | null;
}): CanaryRunResult => ({
  state: snapshot.state === "SUCCEEDED" ? "SUCCEEDED" : "REJECTED",
  receipt: snapshot.receipt,
});

const relationCandidates = (
  manifest: CanaryManifest,
): readonly StoryRelationCandidate[] => manifest.relationBatch.map(
  (relation, index) => ({
    leftFeedItemId: relation.leftFeedItemId,
    rightFeedItemId: relation.rightFeedItemId,
    leftClusterId: `left-${index}`,
    rightClusterId: `right-${index}`,
    sharedTopicTokens: ["canary", String(index)],
    sharedAnchorTokens: ["canary"],
    sharedEventTokens: ["event"],
    sharedSpecificProductTokens: ["product"],
    topicSimilarity: 0.75,
  }),
);

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const DEFINITIVE_FAILURE_CODES = new Set([
  "provider_request_rejected_before_execution",
  "provider_content_policy_rejected",
]);
const definitiveFailure = (result: AgentRuntimeExecutionResult): boolean =>
  result.status === "failed" && result.failure?.retryable === false &&
  DEFINITIVE_FAILURE_CODES.has(result.failure.code);
