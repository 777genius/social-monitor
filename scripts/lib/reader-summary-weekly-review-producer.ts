import {
  tenantId,
  workspaceId,
} from "@social-monitor/shared-kernel";

import {
  verifyAndRecordReaderSummaryExecution,
} from "../../libs/summary/adapters/model/reader-summary-execution-attestation";
import {
  canonicalizeReaderSummaryWeeklyJson,
  exactReaderSummaryWeeklySha256,
  readerSummaryWeeklyScopeKey,
} from "../../libs/summary/domain/value-objects/reader-summary-weekly-canonical-json";
import {
  createReaderSummaryWeeklyReviewManifest,
  deriveReaderSummaryWeeklyReviewStoryCandidates,
  readerSummaryWeeklyReviewResponseSchemaVersion,
  type ReaderSummaryWeeklyReviewAuthority,
  type ReaderSummaryWeeklyReviewExecutionAttestation,
  type ReaderSummaryWeeklyReviewManifest,
} from "../../libs/summary/domain/value-objects/reader-summary-weekly-review-manifest";
import type {
  AgentRuntimeClientPort,
  AgentRuntimeTaskCommand,
} from "../../libs/summary/ports/agent-runtime-client.port";
import type {
  ReaderSummaryWeeklyReviewManifestPort,
} from "../../libs/summary/ports/reader-summary-weekly-review-manifest.port";
import {
  buildReaderSummaryWeeklyReviewPrompt,
} from "./reader-summary-weekly-review-prompt";
import {
  parseReaderSummaryWeeklyReviewResponse,
  readerSummaryWeeklyReviewResponseJsonSchema,
} from "./reader-summary-weekly-review-response";
import {
  readerSummaryWeeklySubscriptionRuntimeFailureFromResult,
} from "./reader-summary-weekly-execution-receipt";

export type ReaderSummaryWeeklyReviewAuthorityLoader = Readonly<{
  load(): Promise<ReaderSummaryWeeklyReviewAuthority>;
}>;

export type ReaderSummaryWeeklyReviewProducerResult = Readonly<{
  outcome: "persisted" | "replayed";
  manifest: ReaderSummaryWeeklyReviewManifest;
  modelCallPerformed: boolean;
  writePerformed: boolean;
}>;

export type ReaderSummaryWeeklyReviewProducerParams = Readonly<{
  authorityLoader: ReaderSummaryWeeklyReviewAuthorityLoader;
  manifestStore: ReaderSummaryWeeklyReviewManifestPort;
  agentRuntime: AgentRuntimeClientPort;
  timeoutMs?: number;
}>;

const purpose = "social_monitor.reader_summary.weekly.review" as const;
const model = "gpt-5.6-sol" as const;
const reasoningEffort = "xhigh" as const;

export class ReaderSummaryWeeklyReviewManifestAuthorityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReaderSummaryWeeklyReviewManifestAuthorityError";
  }
}

export const runReaderSummaryWeeklyReviewProducer = async (
  params: ReaderSummaryWeeklyReviewProducerParams,
): Promise<ReaderSummaryWeeklyReviewProducerResult> => {
  const timeoutMs = params.timeoutMs ?? 600_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    throw new Error("Reader summary weekly review timeout is invalid");
  }
  const authority = await params.authorityLoader.load();
  const existing = await params.manifestStore.findBySeal({
    tenantId: authority.tenantId,
    workspaceId: authority.workspaceId,
    scope: authority.scope,
    weekStartedOn: authority.weekStartedOn,
    sealId: authority.sealId,
  });
  if (existing !== null) {
    assertExistingManifestAuthority(existing, authority);
    return Object.freeze({
      outcome: "replayed",
      manifest: existing,
      modelCallPerformed: false,
      writePerformed: false,
    });
  }

  const candidates = deriveReaderSummaryWeeklyReviewStoryCandidates(authority);
  const prompt = buildReaderSummaryWeeklyReviewPrompt({
    authority,
    candidates,
    outputSchema: readerSummaryWeeklyReviewResponseJsonSchema,
  });
  const command = reviewCommand(authority, prompt, timeoutMs);
  const result = await params.agentRuntime.runTask(command);
  if (result.status !== "completed") {
    throw readerSummaryWeeklySubscriptionRuntimeFailureFromResult(
      result.failure,
      result.status,
    );
  }
  if (result.structuredOutput === undefined) {
    throw new Error("Reader summary weekly review runtime did not return structured output");
  }
  const selections = parseReaderSummaryWeeklyReviewResponse(
    result.structuredOutput,
    authority.sealId,
  );
  const normalizedResponse = Object.freeze({
    schemaVersion: readerSummaryWeeklyReviewResponseSchemaVersion,
    selections,
  });
  const modelResponseSha256 = canonicalizeReaderSummaryWeeklyJson(
    result.structuredOutput,
    "weekly review raw model response",
  ).sha256;
  await verifyAndRecordReaderSummaryExecution({
    command,
    result,
    taskRole: "weekly_review",
    attempt: "1",
    normalizedOutput: normalizedResponse,
  });
  const manifest = createReaderSummaryWeeklyReviewManifest({
    authority,
    selections,
    modelResponseSha256,
    executionAttestation: reviewExecutionAttestation(
      result.executionAttestation,
      modelResponseSha256,
    ),
  });
  const persisted = await params.manifestStore.persist({ manifest });
  if (
    persisted.manifest.manifestId !== manifest.manifestId ||
    persisted.manifest.manifestSha256 !== manifest.manifestSha256
  ) {
    throw new ReaderSummaryWeeklyReviewManifestAuthorityError(
      "Reader summary weekly review persistence returned another manifest",
    );
  }
  return Object.freeze({
    outcome: persisted.outcome,
    manifest: persisted.manifest,
    modelCallPerformed: true,
    writePerformed: persisted.outcome === "persisted",
  });
};

const reviewCommand = (
  authority: ReaderSummaryWeeklyReviewAuthority,
  prompt: ReturnType<typeof buildReaderSummaryWeeklyReviewPrompt>,
  timeoutMs: number,
): AgentRuntimeTaskCommand => {
  const requestId = [
    "reader-summary-weekly-review",
    authority.tenantId,
    authority.workspaceId,
    authority.weekStartedOn,
    authority.sealSha256.slice(0, 16),
  ].join(":");
  return {
    requestId,
    tenantId: tenantId(authority.tenantId),
    workspaceId: workspaceId(authority.workspaceId),
    correlationId: `${requestId}:correlation`,
    provider: "codex",
    purpose,
    systemPrompt: prompt.systemPrompt,
    prompt: prompt.prompt,
    outputSchema: prompt.outputSchema,
    controls: {
      interactive: false,
      outputSchemaName: "reader_summary_weekly_review_response_v1",
      schemaVersion: readerSummaryWeeklyReviewResponseSchemaVersion,
      model,
      reasoningEffort,
      maxOutputTokens: 8_000,
    },
    timeoutMs,
    metadata: {
      producer: "reader-summary-weekly-review",
      reasoningEffort,
      runtimeOutput: "structured_output",
    },
  };
};

const reviewExecutionAttestation = (
  input: unknown,
  modelResponseSha256: string,
): ReaderSummaryWeeklyReviewExecutionAttestation => {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("Reader summary weekly review execution attestation is absent");
  }
  const attestation = input as ReaderSummaryWeeklyReviewExecutionAttestation;
  if (
    attestation.schemaVersion !== 1 ||
    attestation.purpose !== purpose ||
    attestation.provider !== "codex" ||
    attestation.model !== model ||
    attestation.reasoningEffort !== reasoningEffort ||
    attestation.runtimeEngine !== "subscription-runtime-cli" ||
    attestation.selectedOutputKind !== "structured_output" ||
    exactReaderSummaryWeeklySha256(
      attestation.selectedOutputSha256,
      "weekly review selected output hash",
    ) !== modelResponseSha256
  ) {
    throw new Error("Reader summary weekly review execution attestation diverged");
  }
  return Object.freeze({
    schemaVersion: 1,
    requestId: attestation.requestId,
    purpose,
    canonicalRequestSha256: attestation.canonicalRequestSha256,
    provider: "codex",
    model,
    reasoningEffort,
    runtimeEngine: "subscription-runtime-cli",
    runtimePackageVersion: attestation.runtimePackageVersion,
    launcherSha256: attestation.launcherSha256,
    selectedOutputKind: "structured_output",
    selectedOutputSha256: modelResponseSha256,
  });
};

const assertExistingManifestAuthority = (
  manifest: ReaderSummaryWeeklyReviewManifest,
  authority: ReaderSummaryWeeklyReviewAuthority,
): void => {
  if (
    manifest.sealId !== authority.sealId ||
    manifest.sealSha256 !== authority.sealSha256 ||
    manifest.tenantId !== authority.tenantId ||
    manifest.workspaceId !== authority.workspaceId ||
    manifest.scopeKey !== readerSummaryWeeklyScopeKey(authority.scope) ||
    manifest.weekStartedOn !== authority.weekStartedOn ||
    manifest.weekEndedOn !== authority.weekEndedOn
  ) {
    throw new ReaderSummaryWeeklyReviewManifestAuthorityError(
      "Reader summary weekly review replay manifest authority diverged",
    );
  }
};
