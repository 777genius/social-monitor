import { createHash } from "node:crypto";
import { existsSync } from "node:fs";

import {
  tenantId,
  workspaceId,
} from "@social-monitor/shared-kernel";

import { ReaderSummaryWeeklyArtifact } from "../../libs/summary/domain/entities/reader-summary-weekly-artifact";
import {
  canonicalizeReaderSummaryWeeklyJson,
  readerSummaryWeeklyScopeKey,
} from "../../libs/summary/domain/value-objects/reader-summary-weekly-canonical-json";
import type { evaluateReaderSummaryWeeklyEditorialQuality } from "../../libs/summary/domain/policies/reader-summary-weekly-editorial-quality-policy";
import {
  buildOpenAiReaderSummaryWeeklyInstructions,
  buildOpenAiReaderSummaryWeeklyPromptPayload,
  currentReaderSummaryWeeklyPromptRelease,
} from "../../libs/summary/adapters/model/openai-responses-reader-summary-weekly-prompt";
import { parseOpenAiReaderSummaryWeeklyResponse } from "../../libs/summary/adapters/model/openai-responses-reader-summary-weekly-response-parser";
import { buildOpenAiReaderSummaryWeeklyJsonSchema } from "../../libs/summary/adapters/model/openai-responses-reader-summary-weekly-schema";
import {
  readerSummaryWeeklyInputManifestSchemaVersion,
} from "../../libs/summary/domain/value-objects/reader-summary-weekly-input-manifest";
import {
  assertReaderSummaryWeeklyModelInput,
  readerSummaryWeeklyModelInputSchemaVersion,
  type ReaderSummaryWeeklyModelCitationEvidence,
  type ReaderSummaryWeeklyModelInput,
  type ReaderSummaryWeeklyModelObservationEvidence,
  type ReaderSummaryWeeklyModelOutput,
  type ReaderSummaryWeeklyModelPort,
  type ReaderSummaryWeeklyModelStoryEvidence,
} from "../../libs/summary/ports/reader-summary-weekly-model.port";
import type {
  AgentRuntimeClientPort,
  AgentRuntimeProvider,
  AgentRuntimeTaskCommand,
} from "../../libs/summary/ports/agent-runtime-client.port";
import {
  commitReaderSummaryWeeklyArtifactPair,
  inspectOrRecoverReaderSummaryWeeklyArtifactPair,
  readerSummaryWeeklyArtifactPairPaths,
  type ReaderSummaryWeeklyArtifactPairPaths,
  type ReaderSummaryWeeklyArtifactPairValidation,
} from "./reader-summary-weekly-production-artifact-pair";
import {
  type ReaderSummaryWeeklyProductionCertification,
  type ReaderSummaryWeeklyProductionDbState,
  type ReaderSummaryWeeklyProductionProviderEvidence,
  type ReaderSummaryWeeklyProductionStatus,
} from "./reader-summary-weekly-production-postgres-contract";
import { writeReaderSummaryWeeklyProductionReplayCanary } from "./reader-summary-weekly-production-replay-canary";

export type ReaderSummaryWeeklyProductionRunnerResult = Readonly<{
  status: ReaderSummaryWeeklyProductionStatus;
  weekStartedOn: string;
  weekEndedOn: string;
  artifactPath: string | null;
  proofPath: string | null;
  replayCanaryPath: string | null;
  modelCallPerformed: boolean;
  writePerformed: boolean;
  replayCanaryWritePerformed: boolean;
  replayed: boolean;
  blockingReasons: readonly string[];
}>;

export type ReaderSummaryWeeklyProductionRunnerParams = Readonly<{
  dbState: ReaderSummaryWeeklyProductionDbState;
  outputDirectory: string;
  model: ReaderSummaryWeeklyModelPort;
  replay: boolean;
  generatedAt: Date;
  generatedBy?: string;
}>;

export type ReaderSummaryWeeklyAgentRuntimeModelParams = Readonly<{
  client: AgentRuntimeClientPort;
  provider?: AgentRuntimeProvider;
  model?: string;
  reasoningEffort?: "xhigh";
  timeoutMs?: number;
  maxOutputTokens?: number;
}>;

type ArtifactEnvelope = Readonly<{
  schemaVersion: "reader_summary.weekly_production_artifact.v1";
  generatedBy: string;
  status: "complete";
  tenantId: string;
  workspaceId: string;
  scope: unknown;
  weekStartedOn: string;
  weekEndedOn: string;
  modelInput: ReaderSummaryWeeklyModelInput;
  output: ReaderSummaryWeeklyModelOutput;
  editorialQuality: ReturnType<typeof evaluateReaderSummaryWeeklyEditorialQuality>;
  qualityGate: DeterministicWeeklyQualityGate;
  canary: WeeklyProductionCanary;
}>;

type ProofEnvelope = Readonly<{
  schemaVersion: "reader_summary.weekly_production_proof.v1";
  generatedBy: string;
  status: "complete";
  tenantId: string;
  workspaceId: string;
  scopeKey: string;
  weekStartedOn: string;
  weekEndedOn: string;
  certificationCount: 7;
  dailyCertificationIds: readonly string[];
  dailyCertificationSha256s: readonly string[];
  manifestSealId: string;
  manifestSealSha: string;
  modelInputSealId: string;
  modelInputSealSha: string;
  qualityGateSha256: string;
  canarySha256: string;
  artifactSha256: string;
  model: {
    provider: "agent-runtime";
    agentProvider: "codex";
    model: "gpt-5.5";
    reasoningEffort: "xhigh";
    runtimeOutput: "text";
  };
  zeroProviderCalls: true;
}>;

type DeterministicWeeklyQualityGate = Readonly<{
  schemaVersion: "reader_summary.weekly_production_quality_gate.v1";
  evaluator: "deterministic";
  decision: "allow";
  checks: Readonly<{
    editorialPolicyPassed: true;
    weeklySynthesisIsCoherent: true;
    synthesisCitesAtLeastThreeDays: true;
    synthesisCitesMultipleProviders: true;
    synthesisDayDominanceIsControlled: true;
    synthesisProviderDominanceIsControlled: true;
  }>;
  metrics: Readonly<{
    synthesisCitationCount: number;
    synthesisCitedDayCount: number;
    synthesisCitedProviderCount: number;
    dominantSynthesisDayCitationShare: number;
    dominantSynthesisProviderCitationShare: number;
  }>;
}>;

type WeeklyProductionCanary = Readonly<{
  schemaVersion: "reader_summary.weekly_production_canary.v1";
  mode: "fail_closed";
  status: "passed";
  artifactWriteAuthorized: true;
  qualityGateSha256: string;
}>;

const generatedByDefault = "npm run run:reader-summary-weekly-production";
const maxEvidencePerWeek = 12;
const maximumDominantCitationShare = 2 / 3;

export class AgentRuntimeReaderSummaryWeeklyTextModel
  implements ReaderSummaryWeeklyModelPort
{
  private readonly provider: AgentRuntimeProvider;
  private readonly model: string;
  private readonly reasoningEffort: "xhigh";
  private readonly timeoutMs: number;
  private readonly maxOutputTokens: number;

  constructor(private readonly params: ReaderSummaryWeeklyAgentRuntimeModelParams) {
    this.provider = params.provider ?? "codex";
    this.model = params.model ?? "gpt-5.5";
    this.reasoningEffort = params.reasoningEffort ?? "xhigh";
    this.timeoutMs = params.timeoutMs ?? 600_000;
    this.maxOutputTokens = params.maxOutputTokens ?? 16_000;
  }

  async generate(
    input: ReaderSummaryWeeklyModelInput,
  ): Promise<ReaderSummaryWeeklyModelOutput> {
    const command = this.command(input);
    const result = await this.params.client.runTask(command);
    if (result.status !== "completed") {
      throw new Error(
        result.failure?.safeMessage ??
          "Reader summary weekly agent-runtime task did not complete",
      );
    }
    const outputText =
      result.outputText ??
      (result.structuredOutput === undefined
        ? undefined
        : JSON.stringify(result.structuredOutput));
    if (outputText === undefined || outputText.trim().length === 0) {
      throw new Error("Reader summary weekly agent-runtime returned no text");
    }
    if (
      result.executionAttestation !== undefined &&
      (result.executionAttestation.provider !== "codex" ||
        result.executionAttestation.model !== "gpt-5.5" ||
        result.executionAttestation.reasoningEffort !== "xhigh" ||
        result.executionAttestation.selectedOutputKind !== "output_text")
    ) {
      throw new Error(
        "Reader summary weekly agent-runtime attestation is not runtime-only text output",
      );
    }
    return parseOpenAiReaderSummaryWeeklyResponse(input, outputText);
  }

  private command(input: ReaderSummaryWeeklyModelInput): AgentRuntimeTaskCommand {
    const requestId = [
      "reader-summary-weekly",
      input.tenantId,
      input.workspaceId,
      input.weekStartedOn,
      shortHash(input.sealSha),
    ].join(":");
    return {
      requestId,
      tenantId: tenantId(input.tenantId),
      workspaceId: workspaceId(input.workspaceId),
      correlationId: `${requestId}:correlation`,
      provider: this.provider,
      purpose: "social_monitor.reader_summary.weekly.generate",
      systemPrompt: buildOpenAiReaderSummaryWeeklyInstructions(),
      prompt: buildOpenAiReaderSummaryWeeklyPromptPayload(input),
      outputSchema: buildOpenAiReaderSummaryWeeklyJsonSchema(input),
      controls: {
        interactive: false,
        outputSchemaName: "reader_summary_weekly_output_v1",
        schemaVersion: "reader_summary.weekly_model_output.v1",
        model: this.model,
        maxOutputTokens: this.maxOutputTokens,
      },
      timeoutMs: this.timeoutMs,
      metadata: {
        adapter: "agent-runtime-reader-summary-weekly-production",
        promptVersion: currentReaderSummaryWeeklyPromptRelease.id,
        reasoningEffort: this.reasoningEffort,
        runtimeOutput: "text",
      },
    };
  }
}

export const runReaderSummaryWeeklyProduction = async (
  params: ReaderSummaryWeeklyProductionRunnerParams,
): Promise<ReaderSummaryWeeklyProductionRunnerResult> => {
  const generatedBy = params.generatedBy ?? generatedByDefault;
  const paths = artifactPaths(params.outputDirectory, params.dbState);
  if (params.dbState.status !== "complete") {
    return result(params, params.dbState.status, false, false, false, false, [
      ...params.dbState.blockingReasons,
    ]);
  }

  const evidence = buildModelInputFromDbState(params.dbState);
  if (evidence.status === "partial") {
    return result(
      params,
      "partial",
      false,
      false,
      false,
      false,
      evidence.reasons,
    );
  }
  const input = evidence.input;
  const existing = inspectOrRecoverReaderSummaryWeeklyArtifactPair({
    paths,
    validate: (artifact, proof, validation) =>
      validateArtifactPair(artifact, proof, validation, input),
  });
  if (existing.status === "valid") {
    const replayCanaryWritePerformed = params.replay
      ? writeReaderSummaryWeeklyProductionReplayCanary({
          outputDirectory: paths.outputDirectory,
          replayCanaryPath: paths.replayCanaryPath,
          generatedBy,
          generatedAt: params.generatedAt,
          dbState: params.dbState,
          input,
          artifactSha256: existing.artifactSha256,
          proofSha256: existing.proofSha256,
        })
      : false;
    return result(
      params,
      "complete",
      false,
      false,
      replayCanaryWritePerformed,
      true,
      [],
    );
  }
  if (params.replay) {
    return result(
      params,
      "partial",
      false,
      false,
      false,
      true,
      ["replay requested but weekly artifact/proof is missing"],
    );
  }

  const output = await params.model.generate(input);
  const artifact = ReaderSummaryWeeklyArtifact.create({ input, output });
  const snapshot = artifact.toSnapshot();
  const qualityGate = deterministicWeeklyQualityGate(
    input,
    snapshot.output,
    snapshot.editorialQuality,
  );
  const qualityGateSha256 = canonicalizeReaderSummaryWeeklyJson(
    qualityGate,
    "weekly production quality gate",
  ).sha256;
  const canary = weeklyProductionCanary(qualityGateSha256);
  const canarySha256 = canonicalizeReaderSummaryWeeklyJson(
    canary,
    "weekly production canary",
  ).sha256;
  const artifactEnvelope: ArtifactEnvelope = Object.freeze({
    schemaVersion: "reader_summary.weekly_production_artifact.v1",
    generatedBy,
    status: "complete",
    tenantId: params.dbState.scope.tenantId,
    workspaceId: params.dbState.scope.workspaceId,
    scope: cloneScope(params.dbState.scope.scope),
    weekStartedOn: params.dbState.window.weekStartedOn,
    weekEndedOn: params.dbState.window.weekEndedOn,
    modelInput: input,
    output: snapshot.output,
    editorialQuality: snapshot.editorialQuality,
    qualityGate,
    canary,
  });
  const artifactSha256 = canonicalizeReaderSummaryWeeklyJson(
    artifactEnvelope,
    "weekly production artifact",
  ).sha256;
  const proofEnvelope = proofFor({
    params,
    input,
    artifactSha256,
    qualityGateSha256,
    canarySha256,
    generatedBy,
  });
  commitReaderSummaryWeeklyArtifactPair({
    paths,
    artifact: artifactEnvelope,
    proof: proofEnvelope,
    validate: (artifactValue, proofValue, validation) =>
      validateArtifactPair(artifactValue, proofValue, validation, input),
  });
  return result(params, "complete", true, true, false, false, []);
};

export const buildModelInputFromDbState = (
  dbState: ReaderSummaryWeeklyProductionDbState,
):
  | Readonly<{ status: "complete"; input: ReaderSummaryWeeklyModelInput }>
  | Readonly<{ status: "partial"; reasons: readonly string[] }> => {
  if (dbState.status !== "complete") {
    return { status: "partial", reasons: dbState.blockingReasons };
  }
  const selected = selectProviderEvidence(dbState.certifications);
  const selectedDates = new Set(selected.map((item) => item.cert.requestedUtcDate));
  const selectedProviders = new Set(selected.map((item) => item.evidence.providerKey));
  if (selectedDates.size < 3 || selectedProviders.size < 2) {
    return {
      status: "partial",
      reasons: [
        "weekly DB certifications do not contain enough multi-day, multi-provider evidence",
      ],
    };
  }

  const stories = canonicalStories(selected);
  const observations = canonicalObservations(selected);
  const citations = canonicalCitations(selected);
  const days = dbState.certifications.map((cert) => {
    const githubSha = exactGithubSha(cert);
    return {
      date: cert.requestedUtcDate,
      dailyCertificationId: cert.identity,
      dailyCertificationSha: cert.canonicalSha256,
      dailyCertificationStatus: "certified" as const,
      githubBoardId: `${cert.githubEvidence.schemaVersion as string}:${githubSha}`,
      githubBoardSha: githubSha,
      githubBoardStatus: "verified" as const,
      providerCounts: cert.providerCounts,
    };
  });
  const manifestBody = {
    schemaVersion: readerSummaryWeeklyInputManifestSchemaVersion,
    status: "sealed",
    blockingPassed: true,
    weekStartedUtcDate: dbState.window.weekStartedOn,
    weekEndedUtcDate: dbState.window.weekEndedOn,
    tenantId: dbState.scope.tenantId,
    workspaceId: dbState.scope.workspaceId,
    scope: cloneScope(dbState.scope.scope),
    days: dbState.certifications.map((cert) => ({
      requestedUtcDate: cert.requestedUtcDate,
      publicationEvidenceIdentity: cert.identity,
      publicationEvidenceSha256: cert.canonicalSha256,
      githubEvidenceSha256: exactGithubSha(cert),
    })),
  };
  const manifestSealSha = canonicalizeReaderSummaryWeeklyJson(
    manifestBody,
    "weekly production manifest",
  ).sha256;
  const body = {
    schemaVersion: readerSummaryWeeklyModelInputSchemaVersion,
    manifestSealId: `${readerSummaryWeeklyInputManifestSchemaVersion}:${manifestSealSha}`,
    manifestSealSha,
    tenantId: dbState.scope.tenantId,
    workspaceId: dbState.scope.workspaceId,
    scope: cloneScope(dbState.scope.scope),
    weekStartedOn: dbState.window.weekStartedOn,
    weekEndedOn: dbState.window.weekEndedOn,
    days,
    stories,
    observations,
    citations,
  };
  const sealSha = canonicalizeReaderSummaryWeeklyJson(
    body,
    "weekly production model input",
  ).sha256;
  const input = Object.freeze({
    ...body,
    sealId: `${readerSummaryWeeklyModelInputSchemaVersion}:${sealSha}`,
    sealSha,
  });
  assertReaderSummaryWeeklyModelInput(input);
  return {
    status: "complete",
    input,
  };
};

const selectProviderEvidence = (
  certifications: readonly ReaderSummaryWeeklyProductionCertification[],
): readonly Readonly<{
  cert: ReaderSummaryWeeklyProductionCertification;
  evidence: ReaderSummaryWeeklyProductionProviderEvidence;
}>[] => {
  const selected: {
    cert: ReaderSummaryWeeklyProductionCertification;
    evidence: ReaderSummaryWeeklyProductionProviderEvidence;
  }[] = [];
  for (const cert of certifications) {
    const byProvider = new Map<string, ReaderSummaryWeeklyProductionProviderEvidence>();
    for (const evidence of cert.providerEvidence) {
      if (usableEvidence(evidence) && !byProvider.has(evidence.providerKey)) {
        byProvider.set(evidence.providerKey, evidence);
      }
    }
    for (const provider of [
      "github-trending-page",
      "hacker-news",
      "reddit",
      "rss",
      "x-twitter",
    ]) {
      const evidence = byProvider.get(provider);
      if (evidence !== undefined) {
        selected.push({ cert, evidence });
      }
    }
  }
  return Object.freeze(selected.slice(0, maxEvidencePerWeek));
};

const canonicalStories = (
  selected: readonly Readonly<{
    evidence: ReaderSummaryWeeklyProductionProviderEvidence;
  }>[],
): readonly ReaderSummaryWeeklyModelStoryEvidence[] => {
  const storyById = new Map<string, ReaderSummaryWeeklyModelStoryEvidence>();
  for (const item of selected) {
    const stableStoryId = storyId(item.evidence);
    if (!storyById.has(stableStoryId)) {
      storyById.set(
        stableStoryId,
        Object.freeze({
          storyId: stableStoryId,
          label: boundedText(item.evidence.title, 180),
        }),
      );
    }
  }
  return Object.freeze([...storyById.values()].sort(by("storyId")));
};

const canonicalObservations = (
  selected: readonly Readonly<{
    cert: ReaderSummaryWeeklyProductionCertification;
    evidence: ReaderSummaryWeeklyProductionProviderEvidence;
  }>[],
): readonly ReaderSummaryWeeklyModelObservationEvidence[] =>
  Object.freeze(
    selected
      .map((item) =>
        Object.freeze({
          observationId: `observation:${item.cert.requestedUtcDate}:${shortHash(
            item.evidence.citationId,
          )}`,
          storyId: storyId(item.evidence),
          observedOn: item.cert.requestedUtcDate,
          providerKey: item.evidence.providerKey as never,
          text: boundedText(
            `${item.evidence.title}: ${item.evidence.sourceText}`,
            4_000,
          ),
          claimSupport: Object.freeze(["snapshot"] as const),
          citationIds: Object.freeze([item.evidence.citationId]),
          dailyCertificationId: item.cert.identity,
          dailyCertificationSha: item.cert.canonicalSha256,
          sourceSha256: item.evidence.sourceContentHash,
        }),
      )
      .sort(by("observationId")),
  );

const canonicalCitations = (
  selected: readonly Readonly<{
    cert: ReaderSummaryWeeklyProductionCertification;
    evidence: ReaderSummaryWeeklyProductionProviderEvidence;
  }>[],
): readonly ReaderSummaryWeeklyModelCitationEvidence[] =>
  Object.freeze(
    selected
      .map((item) =>
        Object.freeze({
          citationId: item.evidence.citationId,
          observationId: `observation:${item.cert.requestedUtcDate}:${shortHash(
            item.evidence.citationId,
          )}`,
          storyId: storyId(item.evidence),
          observedOn: item.cert.requestedUtcDate,
          providerKey: item.evidence.providerKey as never,
          title: boundedText(item.evidence.title, 240),
          canonicalUrl: item.evidence.canonicalUrl,
          dailyCertificationId: item.cert.identity,
          dailyCertificationSha: item.cert.canonicalSha256,
          sourceSha256: item.evidence.sourceContentHash,
        }),
      )
      .sort(by("citationId")),
  );

const proofFor = (input: {
  params: ReaderSummaryWeeklyProductionRunnerParams;
  input: ReaderSummaryWeeklyModelInput;
  artifactSha256: string;
  qualityGateSha256: string;
  canarySha256: string;
  generatedBy: string;
}): ProofEnvelope => Object.freeze({
  schemaVersion: "reader_summary.weekly_production_proof.v1",
  generatedBy: input.generatedBy,
  status: "complete",
  tenantId: input.params.dbState.scope.tenantId,
  workspaceId: input.params.dbState.scope.workspaceId,
  scopeKey: readerSummaryWeeklyScopeKey(input.params.dbState.scope.scope),
  weekStartedOn: input.params.dbState.window.weekStartedOn,
  weekEndedOn: input.params.dbState.window.weekEndedOn,
  certificationCount: 7,
  dailyCertificationIds: Object.freeze(
    input.params.dbState.certifications.map((cert) => cert.identity),
  ),
  dailyCertificationSha256s: Object.freeze(
    input.params.dbState.certifications.map((cert) => cert.canonicalSha256),
  ),
  manifestSealId: input.input.manifestSealId,
  manifestSealSha: input.input.manifestSealSha,
  modelInputSealId: input.input.sealId,
  modelInputSealSha: input.input.sealSha,
  qualityGateSha256: input.qualityGateSha256,
  canarySha256: input.canarySha256,
  artifactSha256: input.artifactSha256,
  model: Object.freeze({
    provider: "agent-runtime",
    agentProvider: "codex",
    model: "gpt-5.5",
    reasoningEffort: "xhigh",
    runtimeOutput: "text",
  }),
  zeroProviderCalls: true,
});

const validateArtifactPair = (
  artifact: unknown,
  proofValue: unknown,
  validation: ReaderSummaryWeeklyArtifactPairValidation,
  input: ReaderSummaryWeeklyModelInput,
): void => {
  const proof = proofValue as ProofEnvelope;
  const artifactEnvelope = artifact as ArtifactEnvelope;
  const qualityGateSha256 = canonicalizeReaderSummaryWeeklyJson(
    artifactEnvelope.qualityGate,
    "existing weekly production quality gate",
  ).sha256;
  const canarySha256 = canonicalizeReaderSummaryWeeklyJson(
    artifactEnvelope.canary,
    "existing weekly production canary",
  ).sha256;
  const artifactScopeSha256 = canonicalizeReaderSummaryWeeklyJson(
    artifactEnvelope.scope,
    "existing weekly production artifact scope",
  ).sha256;
  const inputScopeSha256 = canonicalizeReaderSummaryWeeklyJson(
    input.scope,
    "weekly production model input scope",
  ).sha256;
  const artifactModelInputSha256 = canonicalizeReaderSummaryWeeklyJson(
    artifactEnvelope.modelInput,
    "existing weekly production artifact model input",
  ).sha256;
  const inputSha256 = canonicalizeReaderSummaryWeeklyJson(
    input,
    "weekly production expected model input",
  ).sha256;
  if (
    artifactEnvelope.schemaVersion !==
      "reader_summary.weekly_production_artifact.v1" ||
    artifactEnvelope.status !== "complete" ||
    artifactEnvelope.tenantId !== input.tenantId ||
    artifactEnvelope.workspaceId !== input.workspaceId ||
    artifactScopeSha256 !== inputScopeSha256 ||
    artifactEnvelope.weekStartedOn !== input.weekStartedOn ||
    artifactEnvelope.weekEndedOn !== input.weekEndedOn ||
    artifactEnvelope.modelInput?.sealId !== input.sealId ||
    artifactEnvelope.modelInput?.sealSha !== input.sealSha ||
    artifactModelInputSha256 !== inputSha256 ||
    proof.schemaVersion !== "reader_summary.weekly_production_proof.v1" ||
    proof.generatedBy !== artifactEnvelope.generatedBy ||
    proof.status !== "complete" ||
    proof.tenantId !== input.tenantId ||
    proof.workspaceId !== input.workspaceId ||
    proof.scopeKey !== readerSummaryWeeklyScopeKey(input.scope) ||
    proof.weekStartedOn !== input.weekStartedOn ||
    proof.weekEndedOn !== input.weekEndedOn ||
    proof.certificationCount !== 7 ||
    !sameStrings(
      proof.dailyCertificationIds,
      input.days.map((day) => day.dailyCertificationId),
    ) ||
    !sameStrings(
      proof.dailyCertificationSha256s,
      input.days.map((day) => day.dailyCertificationSha),
    ) ||
    proof.manifestSealId !== input.manifestSealId ||
    proof.manifestSealSha !== input.manifestSealSha ||
    proof.modelInputSealSha !== input.sealSha ||
    proof.modelInputSealId !== input.sealId ||
    artifactEnvelope.qualityGate?.evaluator !== "deterministic" ||
    artifactEnvelope.qualityGate?.decision !== "allow" ||
    artifactEnvelope.canary?.mode !== "fail_closed" ||
    artifactEnvelope.canary?.status !== "passed" ||
    artifactEnvelope.canary?.artifactWriteAuthorized !== true ||
    artifactEnvelope.canary?.qualityGateSha256 !== qualityGateSha256 ||
    proof.qualityGateSha256 !== qualityGateSha256 ||
    proof.canarySha256 !== canarySha256 ||
    proof.artifactSha256 !== validation.artifactSha256 ||
    proof.model?.provider !== "agent-runtime" ||
    proof.model?.agentProvider !== "codex" ||
    proof.model?.model !== "gpt-5.5" ||
    proof.model?.reasoningEffort !== "xhigh" ||
    proof.model?.runtimeOutput !== "text" ||
    proof.zeroProviderCalls !== true
  ) {
    throw new Error("Reader summary weekly artifact/proof does not match DB input");
  }
};

const artifactPaths = (
  outputDirectory: string,
  dbState: ReaderSummaryWeeklyProductionDbState,
): ReaderSummaryWeeklyArtifactPairPaths =>
  readerSummaryWeeklyArtifactPairPaths(
    outputDirectory,
    dbState.window.weekStartedOn,
  );

const result = (
  params: ReaderSummaryWeeklyProductionRunnerParams,
  status: ReaderSummaryWeeklyProductionStatus,
  modelCallPerformed: boolean,
  writePerformed: boolean,
  replayCanaryWritePerformed: boolean,
  replayed: boolean,
  blockingReasons: readonly string[],
): ReaderSummaryWeeklyProductionRunnerResult => {
  const paths = artifactPaths(params.outputDirectory, params.dbState);
  return Object.freeze({
    status,
    weekStartedOn: params.dbState.window.weekStartedOn,
    weekEndedOn: params.dbState.window.weekEndedOn,
    artifactPath: status === "complete" ? paths.artifactPath : null,
    proofPath: status === "complete" ? paths.proofPath : null,
    replayCanaryPath:
      status === "complete" && existsSync(paths.replayCanaryPath)
        ? paths.replayCanaryPath
        : null,
    modelCallPerformed,
    writePerformed,
    replayCanaryWritePerformed,
    replayed,
    blockingReasons: Object.freeze([...blockingReasons]),
  });
};

const usableEvidence = (
  evidence: ReaderSummaryWeeklyProductionProviderEvidence,
): boolean => {
  try {
    const parsed = new URL(evidence.canonicalUrl);
    return (
      parsed.protocol === "https:" &&
      evidence.title.trim().length > 0 &&
      evidence.sourceText.trim().length > 0 &&
      /^[0-9a-f]{64}$/u.test(evidence.sourceContentHash)
    );
  } catch {
    return false;
  }
};

const deterministicWeeklyQualityGate = (
  input: ReaderSummaryWeeklyModelInput,
  output: ReaderSummaryWeeklyModelOutput,
  editorialQuality: ReturnType<typeof evaluateReaderSummaryWeeklyEditorialQuality>,
): DeterministicWeeklyQualityGate => {
  const citationById = new Map(
    input.citations.map((citation) => [citation.citationId, citation] as const),
  );
  const synthesisCitations = output.synthesisCitationIds.map((citationId) => {
    const citation = citationById.get(citationId);
    if (citation === undefined) {
      throw new Error(
        "Reader summary weekly production quality canary found an unknown synthesis citation",
      );
    }
    return citation;
  });
  const dayCounts = countsBy(
    synthesisCitations.map((citation) => citation.observedOn),
  );
  const providerCounts = countsBy(
    synthesisCitations.map((citation) => citation.providerKey),
  );
  const dominantDayShare = dominantCitationShare(
    dayCounts,
    synthesisCitations.length,
  );
  const dominantProviderShare = dominantCitationShare(
    providerCounts,
    synthesisCitations.length,
  );
  const checks = {
    editorialPolicyPassed:
      editorialQuality.blockingPassed &&
      editorialQuality.publicationDecision === "allow",
    weeklySynthesisIsCoherent:
      editorialQuality.qualityGates.weeklySynthesisIsCoherent,
    synthesisCitesAtLeastThreeDays: dayCounts.size >= 3,
    synthesisCitesMultipleProviders: providerCounts.size >= 2,
    synthesisDayDominanceIsControlled:
      dominantDayShare <= maximumDominantCitationShare,
    synthesisProviderDominanceIsControlled:
      dominantProviderShare <= maximumDominantCitationShare,
  };
  const failedChecks = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  if (failedChecks.length > 0) {
    throw new Error(
      `Reader summary weekly production quality canary blocked artifact write: ${failedChecks.join(
        ", ",
      )}`,
    );
  }
  return Object.freeze({
    schemaVersion: "reader_summary.weekly_production_quality_gate.v1",
    evaluator: "deterministic",
    decision: "allow",
    checks: Object.freeze({
      editorialPolicyPassed: true,
      weeklySynthesisIsCoherent: true,
      synthesisCitesAtLeastThreeDays: true,
      synthesisCitesMultipleProviders: true,
      synthesisDayDominanceIsControlled: true,
      synthesisProviderDominanceIsControlled: true,
    }),
    metrics: Object.freeze({
      synthesisCitationCount: synthesisCitations.length,
      synthesisCitedDayCount: dayCounts.size,
      synthesisCitedProviderCount: providerCounts.size,
      dominantSynthesisDayCitationShare: dominantDayShare,
      dominantSynthesisProviderCitationShare: dominantProviderShare,
    }),
  });
};

const weeklyProductionCanary = (
  qualityGateSha256: string,
): WeeklyProductionCanary => Object.freeze({
  schemaVersion: "reader_summary.weekly_production_canary.v1",
  mode: "fail_closed",
  status: "passed",
  artifactWriteAuthorized: true,
  qualityGateSha256,
});

const countsBy = (values: readonly string[]): ReadonlyMap<string, number> => {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
};

const dominantCitationShare = (
  counts: ReadonlyMap<string, number>,
  total: number,
): number =>
  total === 0 ? 1 : Math.max(0, ...counts.values()) / total;

const storyId = (
  evidence: ReaderSummaryWeeklyProductionProviderEvidence,
): string => `story:${shortHash(`${evidence.providerKey}:${evidence.canonicalUrl}`)}`;

const exactGithubSha = (
  cert: ReaderSummaryWeeklyProductionCertification,
): string => {
  const value = cert.githubEvidence.sha256;
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error("Reader summary weekly GitHub evidence hash is invalid");
  }
  return value;
};

const boundedText = (input: string, max: number): string => {
  const normalized = input.replace(/\s+/gu, " ").trim();
  if (normalized.length === 0) {
    throw new Error("Reader summary weekly evidence text is empty");
  }
  return normalized.length <= max ? normalized : normalized.slice(0, max).trim();
};

const shortHash = (value: string): string =>
  createHash("sha256").update(value).digest("hex").slice(0, 24);

const cloneScope = (
  scope: ReaderSummaryWeeklyProductionDbState["scope"]["scope"],
): ReaderSummaryWeeklyProductionDbState["scope"]["scope"] =>
  scope.type === "workspace"
    ? Object.freeze({ type: "workspace" as const })
    : Object.freeze({ type: "interest" as const, interestId: scope.interestId });

const by = <TKey extends string>(key: TKey) =>
  <TValue extends Readonly<Record<TKey, string>>>(
    left: TValue,
    right: TValue,
  ): number => left[key].localeCompare(right[key]);

const sameStrings = (
  left: readonly string[] | undefined,
  right: readonly string[],
): boolean =>
  left !== undefined &&
  left.length === right.length &&
  left.every((value, index) => value === right[index]);
