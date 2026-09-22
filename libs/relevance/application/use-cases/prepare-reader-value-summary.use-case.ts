import { tenantId, workspaceId, type IdGenerator } from "@social-monitor/shared-kernel";

import { classifyReaderValueSourceKind } from
  "../../domain/reader-value/reader-value-source-kind";
import { compareReaderValueTimestamps, readerValueTimestampMicros } from
  "../../domain/reader-value/canonical-reader-value-timestamp";
import { READER_VALUE_INPUT_VERSION, READER_VALUE_MODEL_CONFIG,
  READER_VALUE_RUBRIC_SHA256, readerValueSha256 } from
  "../../domain/reader-value/reader-value-config";
import type { ReaderValueAssessmentStore } from
  "../contracts/reader-value-assessment-store";
import { ReaderValueInventoryByteCeilingExceeded,
  type ReaderValueInputBuilder, type ReaderValueInventory } from
  "../contracts/reader-value-inventory";
import type {
  PrepareReaderValueSummaryCommand,
  PrepareReaderValueSummaryResult,
  ReaderValueSummaryPreparationConfig,
  ReaderValueSummaryPreparation,
} from "../contracts/reader-value-summary-preparation";
import type { ConfiguredInterestReaderPort } from "../../ports";
import { READER_VALUE_RUBRIC_VERSION } from
  "../../domain/reader-value/reader-value-rubric";

const physicalRowCeiling = 100_000;
const candidateCeiling = 1_000;
const sourceByteCeiling = 32 * 1024 * 1024;

export class PrepareReaderValueSummaryUseCase
implements ReaderValueSummaryPreparation {
  constructor(
    private readonly inventory: ReaderValueInventory,
    private readonly builder: ReaderValueInputBuilder,
    private readonly store: Pick<ReaderValueAssessmentStore, "ensure" | "pin">,
    private readonly ids: IdGenerator,
    private readonly interests: ConfiguredInterestReaderPort,
  ) {}

  async configuration(command: PrepareReaderValueSummaryCommand): Promise<
  | { readonly ok: true; readonly config: ReaderValueSummaryPreparationConfig }
  | { readonly ok: false; readonly code: "config_unavailable" }> {
    if (!validWindow(command) || command.interestId.trim().length === 0) {
      return { ok: false, code: "config_unavailable" };
    }
    const interest = await this.interests.readCurrent({
      tenantId: tenantId(command.tenantId), workspaceId: workspaceId(command.workspaceId),
      interestId: command.interestId,
    });
    if (interest.kind !== "available") return { ok: false, code: "config_unavailable" };
    return { ok: true, config: {
      schemaVersion: "reader_summary_preparation_config.v1",
      interestId: command.interestId,
      interestSha256: readerValueSha256(interest.interest.query),
      rubricVersion: READER_VALUE_RUBRIC_VERSION,
      rubricSha256: READER_VALUE_RUBRIC_SHA256,
      inputBuilderVersion: READER_VALUE_INPUT_VERSION,
      modelConfigVersion: READER_VALUE_MODEL_CONFIG,
    } };
  }

  async prepare(command: PrepareReaderValueSummaryCommand,
    expectedConfig: ReaderValueSummaryPreparationConfig):
  Promise<PrepareReaderValueSummaryResult> {
    const current = await this.configuration(command);
    if (!current.ok || !sameConfig(current.config, expectedConfig)) {
      return { ok: false, code: "config_unavailable" };
    }
    const scope = { tenantId: command.tenantId, workspaceId: command.workspaceId };
    let cursor: { readonly publishedAt: string; readonly feedItemId: string } | undefined;
    let scanned = 0;
    let sourceBytes = 0;
    const candidates: Array<{
      candidateId: string; sourceItemId: string; sourceRevisionKey: string;
      sourceBindingId: string; providerKey: string; observedAt: string;
      sourceSnapshotSha256: string; assessmentId: string; inputSha256: string;
      publishedAt: string; sourceKind: string; canonicalIdentity: string;
      storyId?: string;
    }> = [];
    let config = expectedConfig;
    do {
      let page;
      try {
        page = await this.inventory.page({ ...scope, interestId: command.interestId },
          command.periodStartedAt, cursor, 25, sourceByteCeiling - sourceBytes,
          command.periodEndedAt);
      } catch (error) {
        if (error instanceof ReaderValueInventoryByteCeilingExceeded) return overBudget();
        throw error;
      }
      if (page.length === 0) break;
      // The inventory has already enforced [periodStartedAt, periodEndedAt), so
      // every materialized row belongs to this frozen window. Charge the page
      // before any later cutoff/source-kind skip can discard it.
      sourceBytes += page.reduce((sum, item) => sum +
        Buffer.byteLength(item.source.title, "utf8") +
        Buffer.byteLength(item.source.body, "utf8"), 0);
      if (!Number.isSafeInteger(sourceBytes) || sourceBytes > sourceByteCeiling) {
        return overBudget();
      }
      scanned += page.length;
      if (scanned > physicalRowCeiling) return overBudget();
      for (const item of page) {
        cursor = item.cursor;
        if (item.source.interestId !== command.interestId) continue;
        // A SourceItem may predate the cutoff while its FeedItem projection does not.
        // The frozen inventory admits observations exactly on, but never after, cutoff.
        if (compareTimestamp(item.observedAt, command.cutoffAt) > 0) continue;
        const sourceKind = classifyReaderValueSourceKind(item.source.providerKey, item.metadata);
        if (!sourceKind.supported || sourceKind.appendixOnly) continue;
        // A supported empty source is a durable diagnostic, not a missing
        // historical snapshot. Classify it before availability checks while
        // preserving the historical-snapshot guard for all non-empty inputs.
        const emptyPrepared = item.source.title.trim().length === 0 &&
          item.source.body.trim().length === 0
          ? this.builder.prepare(item.source, item.sourceRevisionKey)
          : undefined;
        if (emptyPrepared !== undefined) {
          if (!emptyPrepared.ok) continue;
          if (emptyPrepared.value.terminalFailure === "empty_input") {
            if (await this.store.ensure(this.ids.generate(), emptyPrepared.value) === null) {
              return { ok: false, code: "assessment_snapshot_unavailable" };
            }
            continue;
          }
          if (emptyPrepared.value.terminalFailure === "configuration_invalid") {
            return { ok: false, code: "config_unavailable" };
          }
        }
        if (item.source.availableAt === null ||
            compareTimestamp(item.source.availableAt, command.cutoffAt) > 0 ||
            compareTimestamp(item.sourceUpdatedAt, command.cutoffAt) > 0) {
          return { ok: false, code: "assessment_snapshot_unavailable" };
        }
        if (candidates.length >= candidateCeiling) {
          return overBudget();
        }
        const prepared = emptyPrepared ??
          this.builder.prepare(item.source, item.sourceRevisionKey);
        if (!prepared.ok) continue;
        if (prepared.value.terminalFailure === "configuration_invalid") {
          return { ok: false, code: "config_unavailable" };
        }
        const assessment = await this.store.ensure(this.ids.generate(), prepared.value);
        if (assessment === null) {
          return { ok: false, code: "assessment_snapshot_unavailable" };
        }
        if (prepared.value.terminalFailure === "empty_input") continue;
        const nextConfig = {
          schemaVersion: "reader_summary_preparation_config.v1" as const,
          interestId: prepared.value.interestId,
          interestSha256: prepared.value.interestSha256,
          rubricVersion: prepared.value.rubricVersion,
          rubricSha256: prepared.value.rubricSha256,
          inputBuilderVersion: prepared.value.inputBuilderVersion,
          modelConfigVersion: prepared.value.modelConfigVersion,
        };
        if (!sameConfig(config, nextConfig)) {
          return { ok: false, code: "config_unavailable" };
        }
        config = nextConfig;
        const storyId = typeof item.metadata.storyClusterId === "string"
          ? item.metadata.storyClusterId : undefined;
        candidates.push({
          candidateId: item.cursor.feedItemId,
          sourceBindingId: item.sourceBindingId,
          providerKey: item.source.providerKey,
          observedAt: item.observedAt,
          sourceItemId: prepared.value.sourceItemId,
          sourceRevisionKey: prepared.value.sourceRevisionKey,
          sourceSnapshotSha256: prepared.value.sourceSnapshotSha256,
          assessmentId: assessment.id,
          inputSha256: prepared.value.inputSha256,
          publishedAt: item.cursor.publishedAt,
          sourceKind: sourceKind.kind,
          canonicalIdentity: item.source.canonicalUrl,
          ...(storyId === undefined ? {} : { storyId }),
        });
      }
      if (page.length < 25) break;
    } while (cursor !== undefined);

    candidates.sort((left, right) => Buffer.compare(
      Buffer.from(left.candidateId, "utf8"), Buffer.from(right.candidateId, "utf8")));
    const references = candidates.map((candidate) => ({
      assessmentId: candidate.assessmentId,
      feedItemId: candidate.candidateId,
      sourceSnapshotSha256: candidate.sourceSnapshotSha256,
      inputSha256: candidate.inputSha256,
    }));
    if (!(await this.store.pin(scope, command.interestId, command.jobId, references))) {
      return { ok: false, code: "assessment_snapshot_unavailable" };
    }
    const manifest = {
      schemaVersion: "reader_summary_preparation_manifest.v1" as const,
      cutoffAt: command.cutoffAt,
      interestSha256: config.interestSha256,
      rubricSha256: config.rubricSha256,
      inputBuilderVersion: config.inputBuilderVersion,
      modelConfigVersion: config.modelConfigVersion,
      candidates,
    };
    if (Buffer.byteLength(JSON.stringify(manifest), "utf8") > 4 * 1024 * 1024) {
      return overBudget();
    }
    return { ok: true, config, manifest,
      manifestSha256: readerValueSha256(JSON.stringify(manifest)) };
  }
}

const validWindow = (command: PrepareReaderValueSummaryCommand): boolean =>
  [command.periodStartedAt, command.periodEndedAt, command.cutoffAt]
    .every((value) => readerValueTimestampMicros(value) !== undefined) &&
  compareTimestamp(command.periodStartedAt, command.periodEndedAt) < 0 &&
  compareTimestamp(command.periodEndedAt, command.cutoffAt) <= 0;

const compareTimestamp = (left: string, right: string): number => {
  return compareReaderValueTimestamps(left, right);
};

const overBudget = (): PrepareReaderValueSummaryResult =>
  ({ ok: false, code: "assessment_inventory_over_budget" });

const sameConfig = (left: ReaderValueSummaryPreparationConfig,
  right: ReaderValueSummaryPreparationConfig): boolean =>
  left.schemaVersion === right.schemaVersion && left.interestId === right.interestId &&
  left.interestSha256 === right.interestSha256 &&
  left.rubricVersion === right.rubricVersion && left.rubricSha256 === right.rubricSha256 &&
  left.inputBuilderVersion === right.inputBuilderVersion &&
  left.modelConfigVersion === right.modelConfigVersion;
