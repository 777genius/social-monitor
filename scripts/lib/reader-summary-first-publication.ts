import { mimoReaderSummaryModel } from "@social-monitor/summary/adapters/model/active-reader-summary-generation-profile";
import { lstatSync, readFileSync } from "node:fs";
import type { Clock } from "@social-monitor/shared-kernel";
import { readerSummaryFirstPublicationPrefix,
  type ReaderSummaryFirstPublicationAuthority } from "@social-monitor/summary/application/contracts/reader-summary-first-publication-authority";
import type { ReaderSummaryJobProps } from "@social-monitor/summary/domain";
import type { PrismaTransactionalSummaryClient } from "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-transaction";
import type { ReaderSummaryServingAuthority } from "./reader-summary-serving-authority";
import { ReaderSummaryDayDatasetGuard, createReaderSummaryDayDatasetAdmission } from "./reader-summary-day-dataset-guard";
import { assertImmutableRecoveryInputs } from "./reader-summary-recovery-files";
import { firstPublicationBytesSha256, parseFirstPublicationInventory,
  type FirstPublicationInventory } from "./reader-summary-first-publication-inventory";
import { reserveFirstPublicationDay } from "./reader-summary-first-publication-reservation";

export const firstPublicationModeArgument = "--historical-first-publication";

/** Explicit operator route, intentionally bounded to the requested day. This
 * cannot be mixed with live cutoff, prior-report recovery, replay or refresh. */
export function resolveFirstPublicationMode(input: {
  argv: readonly string[]; environment: Readonly<Record<string, string | undefined>>;
  cadence: string; timezone: string; startedAt: Date; endedAt: Date; now: Date;
  replayActive: boolean; recoveryActive: boolean;
}): boolean {
  if (!input.argv.includes(firstPublicationModeArgument)) return false;
  if (input.argv.filter((a) => a === firstPublicationModeArgument).length !== 1 ||
      input.replayActive || input.recoveryActive || input.cadence !== "daily" || input.timezone !== "UTC" ||
      input.startedAt.toISOString() !== "2026-09-29T00:00:00.000Z" ||
      input.endedAt.toISOString() !== "2026-09-30T00:00:00.000Z" ||
      !Number.isFinite(input.now.getTime()) || input.endedAt > input.now ||
      ["DURABLE_READER_SUMMARY_LIVE_OBSERVATION_CUTOFF", "DURABLE_READER_SUMMARY_PROMOTION_REBUILD_IDENTITY",
        "DURABLE_READER_SUMMARY_PROMOTION_GENERATION_AUTHORITY_JSON", "DURABLE_READER_SUMMARY_PUBLICATION_RECOVERY_DIR",
        "DURABLE_READER_SUMMARY_SOURCE_REPORT_SHA256", "DURABLE_READER_SUMMARY_COLLECTION_ARTIFACT_SHA256",
        "DURABLE_READER_SUMMARY_COLLECTION_QUALITY_REPORT_SHA256"].some((k) => !!input.environment[k])) {
    throw new Error("Historical first publication requires the isolated completed Sep29 UTC operator route");
  }
  if (input.environment.DURABLE_READER_SUMMARY_MODEL !== "agent-runtime" ||
      input.environment.DURABLE_READER_SUMMARY_TOPIC_LABELER !== "agent-runtime" ||
      input.environment.AGENT_RUNTIME_READER_SUMMARY_BACKEND !== "xiaomi-mimo-token-plan") {
    throw new Error("Historical first publication requires authorized MiMo agent-runtime generation and topic labeling");
  }
  return true;
}

export function readFirstPublicationOperation(input: {
  client: PrismaTransactionalSummaryClient; clock: Clock;
  tenantId: string; workspaceId: string; startedAt: Date; endedAt: Date;
  manifestPath: string; manifestSha256: string; privateRoot: string;
  forbiddenOutputPaths: readonly string[];
}): FirstPublicationOperation {
  input = { ...input, startedAt: new Date(input.startedAt), endedAt: new Date(input.endedAt),
    forbiddenOutputPaths: [...input.forbiddenOutputPaths] };
  assertFirstPublicationPrivateInputs(input);
  const bytes = readFileSync(input.manifestPath);
  if (!/^[0-9a-f]{64}$/u.test(input.manifestSha256) || firstPublicationBytesSha256(bytes) !== input.manifestSha256) {
    throw new Error("First publication immutable manifest hash mismatch");
  }
  const assertManifestPinned = () => {
    assertFirstPublicationPrivateInputs(input);
    if (firstPublicationBytesSha256(readFileSync(input.manifestPath)) !== input.manifestSha256) {
      throw new Error("First publication pinned manifest changed");
    }
  };
  return new FirstPublicationOperation({ ...input, assertManifestPinned }, parseFirstPublicationInventory(bytes));
}

export class FirstPublicationOperation implements ReaderSummaryFirstPublicationAuthority {
  readonly guard: ReaderSummaryDayDatasetGuard;
  readonly idempotencyKey: string;
  readonly sourceProvenance: Readonly<{
    kind: "historical-first-publication"; sourceAuthority: "inventory-manifest";
    datasetManifestSha256: string; observationCutoff: string; timestampPolicy: "published_at";
    providerCoverage: "UNPROVEN";
  }>;
  private readonly asofMs: number;
  private reserved = false;
  private consumed = false;
  constructor(private readonly input: {
    client: PrismaTransactionalSummaryClient; clock: Clock; tenantId: string; workspaceId: string;
    startedAt: Date; endedAt: Date; manifestSha256: string; assertManifestPinned?: () => void;
  }, inventory: FirstPublicationInventory) {
    this.input = { ...input, startedAt: new Date(input.startedAt), endedAt: new Date(input.endedAt) };
    // Copy all caller-owned objects once. No clock override, no mutable Date authority.
    const pinned = parseFirstPublicationInventory(Buffer.from(JSON.stringify(inventory)));
    const manifest = pinned.datasetManifest;
    if (manifest.scope.tenantId !== input.tenantId || manifest.scope.workspaceId !== input.workspaceId ||
        manifest.period.startedAt !== input.startedAt.toISOString() || manifest.period.endedAt !== input.endedAt.toISOString() ||
        !/^[0-9a-f]{64}$/u.test(input.manifestSha256)) throw new Error("First publication manifest scope/period mismatch");
    this.asofMs = Date.parse(manifest.generatedAt);
    const admission = createReaderSummaryDayDatasetAdmission({ manifest, manifestFileSha256: input.manifestSha256,
      admittedAt: input.clock.now() });
    this.guard = new ReaderSummaryDayDatasetGuard(input.client, manifest, input.manifestSha256,
      () => input.clock.now(), admission, pinned, input.assertManifestPinned);
    this.idempotencyKey = `${readerSummaryFirstPublicationPrefix}${input.workspaceId}:${manifest.period.startedAt.slice(0, 10)}`;
    this.sourceProvenance = Object.freeze({ kind: "historical-first-publication", sourceAuthority: "inventory-manifest",
      datasetManifestSha256: input.manifestSha256, observationCutoff: manifest.generatedAt,
      timestampPolicy: "published_at", providerCoverage: "UNPROVEN" });
  }
  async reserve(): Promise<void> {
    if (this.reserved) throw new Error("First publication reservation cannot be reclaimed");
    await this.guard.assertCurrentBeforeMutation();
    await reserveFirstPublicationDay(this.input.client, { tenantId: this.input.tenantId, workspaceId: this.input.workspaceId,
      startedAt: this.sourcePeriod().startedAt, endedAt: this.sourcePeriod().endedAt }, this.input.clock.now());
    this.reserved = true;
  }
  private sourcePeriod() {
    return { startedAt: this.input.startedAt.toISOString(), endedAt: this.input.endedAt.toISOString() };
  }
  async claim(job: ReaderSummaryJobProps) {
    if (!this.reserved || this.consumed || job.status !== "requested" || job.scope.type !== "workspace" ||
        job.tenantId !== this.input.tenantId || job.workspaceId !== this.input.workspaceId ||
        job.idempotencyKey !== this.idempotencyKey || job.period.cadence !== "daily" || job.period.timezone !== "UTC" ||
        job.period.startedAt.toISOString() !== this.sourcePeriod().startedAt ||
        job.period.endedAt.toISOString() !== this.sourcePeriod().endedAt || job.userId !== undefined ||
        job.subscriptionId !== undefined || job.selectionStrategy === "jev_primary_v3") {
      throw new Error("First publication requires an unconsumed reserved manifest authority");
    }
    this.consumed = true; // Any uncertainty is consumed; never retry provider effects.
    await this.guard.assertCurrentBeforeMutation();
    return { observedThrough: new Date(this.asofMs), manifestSha256: this.sourceProvenance.datasetManifestSha256,
      sourceIdentity: `inventory-manifest:${this.sourceProvenance.datasetManifestSha256}:${this.sourceProvenance.observationCutoff}`,
      providerCoverage: "UNPROVEN" as const };
  }
  evidence() { return { ...this.sourceProvenance, reserved: this.reserved, consumed: this.consumed, dataset: this.guard.evidence() }; }
}

export function assertFirstPublicationServingAuthority(authority: ReaderSummaryServingAuthority): void {
  if (authority.summaryGenerator.mode !== "agent-runtime" || authority.summaryGenerator.provider !== "codex" ||
      authority.summaryGenerator.physicalModel !== mimoReaderSummaryModel || authority.topicLabeler.mode !== "agent-runtime" ||
      authority.topicLabeler.physicalModel !== mimoReaderSummaryModel ||
      authority.topicRelationVerifier.physicalModel !== mimoReaderSummaryModel ||
      authority.storyRelationVerifier.physicalModel !== mimoReaderSummaryModel ||
      authority.runtime === null) throw new Error("First publication MiMo serving authority diverged");
}

function assertFirstPublicationPrivateInputs(input: {
  privateRoot: string; manifestPath: string; forbiddenOutputPaths: readonly string[];
}): void {
  assertImmutableRecoveryInputs({ recoveryRoot: input.privateRoot, inputPaths: [input.manifestPath],
    forbiddenOutputPaths: input.forbiddenOutputPaths });
  const root = lstatSync(input.privateRoot), file = lstatSync(input.manifestPath);
  if (!root.isDirectory() || root.isSymbolicLink() || (root.mode & 0o777) !== 0o700 ||
      (file.mode & 0o777) !== 0o400) {
    throw new Error("First publication requires a private 0700 input root and immutable 0400 manifest");
  }
}
