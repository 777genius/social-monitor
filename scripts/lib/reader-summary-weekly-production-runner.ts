import { readFileSync } from "node:fs";

import { ReaderSummaryWeeklyArtifact } from "../../libs/summary/domain/entities/reader-summary-weekly-artifact";
import type { ReaderSummaryWeeklyEditorialQualityResult } from "../../libs/summary/domain/policies/reader-summary-weekly-editorial-quality-policy";
import {
  canonicalizeReaderSummaryWeeklyJson,
  readerSummaryWeeklyScopeKey,
} from "../../libs/summary/domain/value-objects/reader-summary-weekly-canonical-json";
import type { ReaderSummaryWeeklyReviewManifest } from "../../libs/summary/domain/value-objects/reader-summary-weekly-review-manifest";
import type {
  ReaderSummaryWeeklyModelInput,
  ReaderSummaryWeeklyModelOutput,
  ReaderSummaryWeeklyModelPort,
} from "../../libs/summary/ports/reader-summary-weekly-model.port";

import {
  commitReaderSummaryWeeklyArtifactPair,
  inspectReaderSummaryWeeklyArtifactPairReadOnly,
  inspectOrRecoverReaderSummaryWeeklyArtifactPair,
  readerSummaryWeeklyArtifactPairPaths,
  type ReaderSummaryWeeklyArtifactPairPaths,
  type ReaderSummaryWeeklyArtifactPairValidation,
} from "./reader-summary-weekly-production-artifact-pair";
import {
  buildModelInputFromDbState,
} from "./reader-summary-weekly-production-input";
import {
  deterministicWeeklyQualityGate,
  weeklyProductionCanary,
  type DeterministicWeeklyQualityGate,
  type WeeklyProductionCanary,
} from "./reader-summary-weekly-production-quality-gate";
import {
  readerSummaryWeeklyProductionModel,
} from "./reader-summary-weekly-production-model";
import type {
  ReaderSummaryWeeklyProductionDbState,
  ReaderSummaryWeeklyProductionStatus,
} from "./reader-summary-weekly-production-postgres-contract";

export {
  AgentRuntimeReaderSummaryWeeklyTextModel,
} from "./reader-summary-weekly-production-model";
export type {
  ReaderSummaryWeeklyAgentRuntimeModelParams,
} from "./reader-summary-weekly-production-model";
export {
  buildModelInputFromDbState,
} from "./reader-summary-weekly-production-input";

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
  databasePublicationVerified: boolean;
  blockingReasons: readonly string[];
}>;

export type ReaderSummaryWeeklyProductionPublisher = Readonly<{
  publish(command: Readonly<{
    artifact: ReaderSummaryWeeklyArtifact;
    modelInput: ReaderSummaryWeeklyModelInput;
  }>): Promise<Readonly<{ databasePublicationVerified: true }>>;
}>;

export type ReaderSummaryWeeklyProductionRunnerParams = Readonly<{
  dbState: ReaderSummaryWeeklyProductionDbState;
  reviewManifest: ReaderSummaryWeeklyReviewManifest | null;
  outputDirectory: string;
  model: ReaderSummaryWeeklyModelPort;
  replay: boolean;
  generatedAt: Date;
  generatedBy?: string;
  publisher?: ReaderSummaryWeeklyProductionPublisher;
  onDurableArtifactPair?: (
    pair: Readonly<{ artifactSha256: string; proofSha256: string }>,
  ) => Promise<void>;
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
  reviewManifestId: string;
  reviewManifestSha256: string;
  modelInput: ReaderSummaryWeeklyModelInput;
  output: ReaderSummaryWeeklyModelOutput;
  editorialQuality: ReaderSummaryWeeklyEditorialQualityResult;
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
  reviewManifestId: string;
  reviewManifestSha256: string;
  modelInputSealId: string;
  modelInputSealSha: string;
  qualityGateSha256: string;
  canarySha256: string;
  artifactSha256: string;
  model: {
    provider: "agent-runtime";
    agentProvider: "codex";
    model: "gpt-5.6-sol";
    reasoningEffort: "high";
    runtimeOutput: "output_text";
  };
  zeroProviderCalls: true;
}>;

const generatedByDefault = "npm run run:reader-summary-weekly-production";

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

  const admitted = buildModelInputFromDbState(
    params.dbState,
    params.reviewManifest,
  );
  if (admitted.status === "partial") {
    return result(
      params,
      "partial",
      false,
      false,
      false,
      false,
      admitted.reasons,
    );
  }
  const { input, reviewManifest } = admitted;
  const existing = (params.replay
    ? inspectReaderSummaryWeeklyArtifactPairReadOnly
    : inspectOrRecoverReaderSummaryWeeklyArtifactPair)({
    paths,
    validate: (artifact, proof, validation) =>
      validateArtifactPair(artifact, proof, validation, input, reviewManifest),
  });
  if (existing.status === "valid") {
    if (params.replay) {
      return result(params, "complete", false, false, false, true, []);
    }
    await params.onDurableArtifactPair?.(existing);
    const databasePublicationVerified = await publishExistingPair(
      params.publisher,
      paths.artifactPath,
      input,
    );
    return result(
      params,
      "complete",
      false,
      false,
      false,
      true,
      [],
      databasePublicationVerified,
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
  const qualityGate = deterministicWeeklyQualityGate(snapshot.editorialQuality);
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
    reviewManifestId: reviewManifest.manifestId,
    reviewManifestSha256: reviewManifest.manifestSha256,
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
    reviewManifest,
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
      validateArtifactPair(
        artifactValue,
        proofValue,
        validation,
        input,
        reviewManifest,
      ),
  });
  const durablePair = inspectOrRecoverReaderSummaryWeeklyArtifactPair({
    paths,
    validate: (artifactValue, proofValue, validation) =>
      validateArtifactPair(
        artifactValue,
        proofValue,
        validation,
        input,
        reviewManifest,
      ),
  });
  if (durablePair.status !== "valid") {
    throw new Error("Reader summary weekly durable artifact pair is missing");
  }
  await params.onDurableArtifactPair?.(durablePair);
  const databasePublicationVerified = await publishArtifact(
    params.publisher,
    artifact,
    input,
  );
  return result(
    params,
    "complete",
    true,
    true,
    false,
    false,
    [],
    databasePublicationVerified,
  );
};

const publishExistingPair = async (
  publisher: ReaderSummaryWeeklyProductionPublisher | undefined,
  artifactPath: string,
  input: ReaderSummaryWeeklyModelInput,
): Promise<boolean> => {
  if (publisher === undefined) return false;
  const envelope = JSON.parse(readFileSync(artifactPath, "utf8")) as ArtifactEnvelope;
  return publishArtifact(
    publisher,
    ReaderSummaryWeeklyArtifact.create({ input, output: envelope.output }),
    input,
  );
};

const publishArtifact = async (
  publisher: ReaderSummaryWeeklyProductionPublisher | undefined,
  artifact: ReaderSummaryWeeklyArtifact,
  modelInput: ReaderSummaryWeeklyModelInput,
): Promise<boolean> => publisher === undefined
  ? false
  : (await publisher.publish({ artifact, modelInput })).databasePublicationVerified;

const proofFor = (input: {
  params: ReaderSummaryWeeklyProductionRunnerParams;
  input: ReaderSummaryWeeklyModelInput;
  reviewManifest: ReaderSummaryWeeklyReviewManifest;
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
    input.params.dbState.certifications.map((certification) => certification.identity),
  ),
  dailyCertificationSha256s: Object.freeze(
    input.params.dbState.certifications.map((certification) =>
      certification.canonicalSha256),
  ),
  manifestSealId: input.input.manifestSealId,
  manifestSealSha: input.input.manifestSealSha,
  reviewManifestId: input.reviewManifest.manifestId,
  reviewManifestSha256: input.reviewManifest.manifestSha256,
  modelInputSealId: input.input.sealId,
  modelInputSealSha: input.input.sealSha,
  qualityGateSha256: input.qualityGateSha256,
  canarySha256: input.canarySha256,
  artifactSha256: input.artifactSha256,
  model: Object.freeze({
    provider: "agent-runtime",
    agentProvider: "codex",
    model: readerSummaryWeeklyProductionModel,
    reasoningEffort: "high",
    runtimeOutput: "output_text",
  }),
  zeroProviderCalls: true,
});

const validateArtifactPair = (
  artifact: unknown,
  proofValue: unknown,
  validation: ReaderSummaryWeeklyArtifactPairValidation,
  input: ReaderSummaryWeeklyModelInput,
  reviewManifest: ReaderSummaryWeeklyReviewManifest,
): void => {
  const proof = proofValue as ProofEnvelope;
  const artifactEnvelope = artifact as ArtifactEnvelope;
  const reconstructed = ReaderSummaryWeeklyArtifact.create({
    input,
    output: artifactEnvelope.output,
  }).toSnapshot();
  const outputSha256 = canonicalizeReaderSummaryWeeklyJson(
    artifactEnvelope.output,
    "existing weekly production artifact output",
  ).sha256;
  const reconstructedOutputSha256 = canonicalizeReaderSummaryWeeklyJson(
    reconstructed.output,
    "reconstructed weekly production artifact output",
  ).sha256;
  const editorialQualitySha256 = canonicalizeReaderSummaryWeeklyJson(
    artifactEnvelope.editorialQuality,
    "existing weekly production editorial quality",
  ).sha256;
  const reconstructedEditorialQualitySha256 = canonicalizeReaderSummaryWeeklyJson(
    reconstructed.editorialQuality,
    "reconstructed weekly production editorial quality",
  ).sha256;
  const recomputedQualityGate = deterministicWeeklyQualityGate(
    reconstructed.editorialQuality,
  );
  const qualityGateSha256 = canonicalizeReaderSummaryWeeklyJson(
    recomputedQualityGate,
    "recomputed weekly production quality gate",
  ).sha256;
  const artifactQualityGateSha256 = canonicalizeReaderSummaryWeeklyJson(
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
    artifactEnvelope.reviewManifestId !== reviewManifest.manifestId ||
    artifactEnvelope.reviewManifestSha256 !== reviewManifest.manifestSha256 ||
    artifactEnvelope.modelInput?.sealId !== input.sealId ||
    artifactEnvelope.modelInput?.sealSha !== input.sealSha ||
    artifactModelInputSha256 !== inputSha256 ||
    outputSha256 !== reconstructedOutputSha256 ||
    editorialQualitySha256 !== reconstructedEditorialQualitySha256 ||
    artifactQualityGateSha256 !== qualityGateSha256 ||
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
    proof.reviewManifestId !== reviewManifest.manifestId ||
    proof.reviewManifestSha256 !== reviewManifest.manifestSha256 ||
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
    proof.model?.model !== readerSummaryWeeklyProductionModel ||
    proof.model?.reasoningEffort !== "high" ||
    proof.model?.runtimeOutput !== "output_text" ||
    proof.zeroProviderCalls !== true
  ) {
    throw new Error("Reader summary weekly artifact/proof does not match admitted input");
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
  databasePublicationVerified = false,
): ReaderSummaryWeeklyProductionRunnerResult => {
  const paths = artifactPaths(params.outputDirectory, params.dbState);
  return Object.freeze({
    status,
    weekStartedOn: params.dbState.window.weekStartedOn,
    weekEndedOn: params.dbState.window.weekEndedOn,
    artifactPath: status === "complete" ? paths.artifactPath : null,
    proofPath: status === "complete" ? paths.proofPath : null,
    replayCanaryPath: null,
    modelCallPerformed,
    writePerformed,
    replayCanaryWritePerformed,
    replayed,
    databasePublicationVerified,
    blockingReasons: Object.freeze([...blockingReasons]),
  });
};

const cloneScope = (
  scope: ReaderSummaryWeeklyProductionDbState["scope"]["scope"],
): ReaderSummaryWeeklyProductionDbState["scope"]["scope"] =>
  scope.type === "workspace"
    ? Object.freeze({ type: "workspace" as const })
    : Object.freeze({ type: "interest" as const, interestId: scope.interestId });

const sameStrings = (
  left: readonly string[] | undefined,
  right: readonly string[],
): boolean =>
  left !== undefined &&
  left.length === right.length &&
  left.every((value, index) => value === right[index]);
