import { createHash, randomUUID } from "node:crypto";
import { closeSync, constants, fsyncSync, linkSync, mkdirSync, openSync, readFileSync,
  realpathSync, statSync, unlinkSync, writeFileSync, writeSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import type { FeedItemReadRepositoryPort, PromotionFeedItemSnapshotRepositoryPort } from "@social-monitor/feed/ports";
import { promotionWireCandidate, promotionReviewInstructions } from "@social-monitor/relevance/adapters/model/promotion-review-wire";
import { parseReviews, promotionResponseSchema } from "@social-monitor/relevance/adapters/model/source-content-quality-review-wire";
import type { SourceContentQualityReviewRequest } from "@social-monitor/relevance/ports";
import type { AgentRuntimeTaskCommand } from "@social-monitor/summary/ports";
import { canCompeteForPromotionAssessment } from "@social-monitor/relevance/features/rank-feed-items/promotion-assessment-eligibility";
import type { ConfiguredInterestReaderPort } from "@social-monitor/relevance/ports";
import type { ReaderSummaryPreparationObserver } from "@social-monitor/summary/adapters/evidence/reader-summary-preparation-observer";
import { buildAgentRuntimeReaderSummaryStoryRelationVerifierPrompt, buildAgentRuntimeReaderSummaryRelatedTopicVerifierPrompt,
  agentRuntimeReaderSummaryStoryRelationVerifierInstructions, agentRuntimeReaderSummaryRelatedTopicVerifierInstructions,
  agentRuntimeReaderSummaryStoryRelationVerifierJsonSchema, agentRuntimeReaderSummaryRelatedTopicVerifierJsonSchema
} from "@social-monitor/summary/adapters/model/agent-runtime-reader-summary-story-relation-verifier-prompt";
import type { ReaderSummaryEvidenceSelectorPort, ReaderSummaryStoryRelationVerifierInput } from "@social-monitor/summary/ports";
import type { ReaderSummaryDailyRelationCapture } from "./reader-summary-daily-story-relation-verifier";
import type { RefreshManifest } from "./reader-summary-new-input-refresh-manifest";
import type { RefreshAssessmentCaptureEvent } from "./reader-summary-new-input-refresh-assessment";
import { sourceContentAssessmentPurpose } from "./reader-summary-new-input-refresh-assessment-runtime";
import { activeReaderSummaryPurposes } from "@social-monitor/summary/adapters/model/active-reader-summary-generation-profile";
import type { RefreshModelCaptureEvent } from "./reader-summary-new-input-refresh-model";

// Private, one-operation capture. No runtime credentials, environment, SQL or error
// objects enter this writer. Failure is sticky and is never publication authority.
const MAX_BYTES = 128 * 1024 * 1024;
const MAX_EVENTS = 4096;
type Snapshot = Awaited<ReturnType<PromotionFeedItemSnapshotRepositoryPort["readPromotionSnapshot"]>>;
type Promotion = Parameters<ReaderSummaryPreparationObserver["promotionSnapshot"]>[0];
type Preparation = Parameters<ReaderSummaryPreparationObserver["beforePolicy"]>[0];
type Scope = Pick<RefreshManifest, "tenantId" | "workspaceId" | "operation" | "observedThrough">;

export class RefreshPairedExport {
  private readonly failures = new Set<string>();
  private readonly files = new Map<string, string>();
  private bytes = 0;
  private sequence = 0;
  private initialized = false;
  private finished = false;
  private finalizationAttempted = false;
  private snapshotCount = 0;
  private promotionCount = 0;
  private preparationCount = 0;
  private selectionCount = 0;
  private selected = false;
  private raw?: Extract<Snapshot, { ok: true }>;
  private promotion?: Promotion;
  private preparation?: Preparation;
  private readonly assessments: RefreshAssessmentCaptureEvent[] = [];
  private readonly models: RefreshModelCaptureEvent[] = [];
  private readonly configuredInterestValues = new Map<string, string>();
  private readonly interestIds = new Set<string>();
  private readonly pendingRelations = new Set<number>();
  private relationSequence = 0;
  private readonly relationQueries = new Map<number, ReaderSummaryStoryRelationVerifierInput>();
  private readonly relationIds = new WeakMap<object, number>();
  private readonly modelContexts = new Map<string, { assessmentBatch?: number; relationId?: number; commandJson: string; terminal: boolean; verified: boolean }>();
  private completion?: () => void;
  private readonly activeAssessmentBatches = new Set<number>();
  private readonly relationModelIds = new Map<number, string[]>();
  private readonly assessmentModelIds = new Map<number, string[]>();

  assessmentCompletion(check: () => void): void { this.completion = check; }
  canonicalBindings(value: unknown): void { this.safe("canonical_bindings_failed", () => this.write("canonical-bindings.json", value)); }

  readonly relations: ReaderSummaryDailyRelationCapture = {
    attempted: (query) => {
      const { signal, ...semantic } = query;
      const id = this.relationStart({ ...semantic, aborted: signal?.aborted ?? false });
      this.relationIds.set(query, id);
      this.relationQueries.set(id, query);
    },
    validated: (query, decisions) => {
      const id = this.relationIds.get(query);
      if (id === undefined) { this.fail("relation_missing_attempt"); return; }
      if (query.candidates.length > 0 && (this.relationModelIds.get(id)?.length !== 1 ||
          !this.modelContexts.get(this.relationModelIds.get(id)![0]!)?.verified)) this.fail("relation_missing_model_binding");
      this.relationEnd(id, { status: "validated", decisions, aborted: query.signal?.aborted ?? false });
    },
    failed: (query) => {
      const id = this.relationIds.get(query);
      if (id === undefined) { this.fail("relation_missing_attempt"); return; }
      this.relationEnd(id, { status: query.signal?.aborted ? "aborted" : "parser_or_runtime_failed" });
    },
    captureFailed: () => this.fail("relation_callback_failed"),
  };

  constructor(private readonly directory: string, private readonly scope: Scope,
    private readonly now: () => number, sourceRoot = process.cwd()) {
    this.scope = Object.freeze({ tenantId: scope.tenantId, workspaceId: scope.workspaceId,
      operation: scope.operation, observedThrough: scope.observedThrough });
    this.safe("initialization_failed", () => {
      const path = resolve(directory);
      const inside = relative(realpathSync(sourceRoot), path);
      if (!isAbsolute(directory) || inside === "" || (!(inside === ".." || inside.startsWith(`..${sep}`)) && !isAbsolute(inside))) {
        throw new Error("Capture must be outside source");
      }
      if (realpathSync(resolve(path, "..")) !== resolve(path, "..")) throw new Error("Symlink parent");
      mkdirSync(path, { mode: 0o700 }); // exclusive reservation, never reuse a consumed path
      this.initialized = true;
      this.write("started.json", { format: "reader-refresh-paired-capture.v1", scope: this.scope, atMs: now(),
        complete: false, limits: { bytes: MAX_BYTES, events: MAX_EVENTS } });
    });
  }

  /** Private sidecars may use only this invocation's exclusive reservation. */
  get reservedDirectory(): string | undefined {
    return this.initialized ? this.directory : undefined;
  }

  fail = (reason: string): void => {
    // Only fixed codes from our concrete closures, never exception messages.
    this.failures.add(reason);
    if (!this.initialized) return;
    if (this.finished) {
      // An unexpected late callback withdraws this operation's own completion.
      try { unlinkSync(join(this.directory, "complete.json")); } catch { /* failure remains explicit */ }
      this.finished = false;
    }
    try { this.append("failures.jsonl", { reason, atMs: this.now() }); } catch { /* retained in result */ }
  };

  private safe(reason: string, action: () => void): void {
    try { action(); } catch { this.fail(reason); }
  }

  rankCommand(value: unknown): void { this.safe("rank_command_capture_failed", () => this.write("rank-command.json", { command: value, presentKeys: Object.keys(value as object) })); }

  controls(value: unknown): void { this.safe("controls_capture_failed", () => this.write("controls.json", value)); }

  feed(delegate: FeedItemReadRepositoryPort & PromotionFeedItemSnapshotRepositoryPort): typeof delegate {
    return new Proxy(delegate, { get: (target, key) => {
      if (key === "readPromotionSnapshot") return async (query: Parameters<typeof delegate.readPromotionSnapshot>[0]) => {
        this.safe("snapshot_query_capture_failed", () => {
          if (++this.snapshotCount !== 1) throw new Error("Multiple selector snapshots");
          this.write("snapshot-query.json", { query, presentKeys: Object.keys(query) });
        });
        let result: Snapshot;
        try { result = await target.readPromotionSnapshot(query); }
        catch (error) { this.fail("snapshot_read_failed"); throw error; }
        this.safe("snapshot_capture_failed", () => {
          this.assertScope(query);
          if (query.observedThrough.toISOString() !== this.scope.observedThrough) throw new Error("Cutoff mismatch");
          if (!result.ok || !result.exhausted) throw new Error("Incomplete raw population");
          const { supplementalItems, ...snapshotFields } = result;
          const raw = { ...snapshotFields, candidates: result.candidates.map(({ item, ...rest }) =>
            ({ ...rest, item: item.toSnapshot() })),
            ...(supplementalItems === undefined ? {} : {
              supplementalItems: supplementalItems.map((item) => item.toSnapshot()),
            }) };
          const items = [...raw.candidates.map(({ item }) => item), ...(raw.supplementalItems ?? [])];
          const ids = items.map((item) => item.id);
          if (new Set(ids).size !== ids.length || new Set(raw.sourceContent.map((s) => s.feedItemId)).size !== raw.sourceContent.length) {
            throw new Error("Duplicate raw identity");
          }
          for (const item of items) {
            this.assertScope(item);
            const source = raw.sourceContent.find((s) => s.feedItemId === item.id);
            if (!source || source.sourceItemId !== item.sourceItemId) throw new Error("Missing source join");
          }
          this.raw = result;
          this.write("inputs.json", { query, queryKeys: Object.keys(query), snapshot: raw,
            primaryIds: raw.candidates.map(({ item }) => item.id),
            supplementalIds: (raw.supplementalItems ?? []).map((item) => item.id) });
        });
        return result;
      };
      const value: unknown = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    } });
  }

  interests(delegate: ConfiguredInterestReaderPort): ConfiguredInterestReaderPort {
    return { readCurrent: async (query) => {
      const result = await delegate.readCurrent(query);
      this.safe("interest_capture_failed", () => {
        this.assertScope(query);
        if (this.interestIds.has(query.interestId)) throw new Error("Duplicate interest read");
        this.interestIds.add(query.interestId);
        if (result.kind === "available") {
          this.assertScope(result.interest);
          if (result.interest.interestId !== query.interestId || !result.interest.query.trim()) throw new Error("Interest mismatch");
          this.configuredInterestValues.set(query.interestId, result.interest.query);
        }
        this.append("interests.jsonl", { query, result });
      });
      return result;
    } };
  }

  readonly observer: ReaderSummaryPreparationObserver = {
    promotionSnapshot: (value) => this.safe("promotion_observer_failed", () => {
      if (++this.promotionCount !== 1 || !this.raw) throw new Error("Missing same-invocation raw");
      const primary = this.raw.candidates.map(({ item }) => item.toSnapshot());
      const supplemental = (this.raw.supplementalItems ?? []).map((item) => item.toSnapshot());
      for (const [raw, mapped, ranked] of [[primary, value.primary, value.ranked.primary],
        [supplemental, value.supplemental, value.ranked.supplemental]] as const) {
        if (raw.length !== mapped.length || raw.length !== ranked.length) throw new Error("Partition size");
        raw.forEach((item, index) => {
          for (const projection of [mapped[index]!, ranked[index]!]) {
            if (item.id !== projection.feedItemId || item.sourceItemId !== projection.sourceItemId ||
                item.sourceBindingId !== projection.sourceBindingId || item.interestId !== projection.interestId ||
                item.providerKey !== projection.providerKey) throw new Error("Partition binding");
          }
        });
      }
      this.promotion = value;
      this.write("promotion.json", value);
    }),
    beforePolicy: (value) => this.safe("preparation_observer_failed", () => {
      if (++this.preparationCount !== 1 || !this.promotion) throw new Error("Missing rank observation");
      const ids = [...this.promotion.primary, ...this.promotion.supplemental].map((item) => item.feedItemId).sort();
      if (JSON.stringify(ids) !== JSON.stringify(value.rankedInventory.map((item) => item.feedItemId).sort())) throw new Error("Inventory mismatch");
      this.preparation = value;
      this.write("preparation.json", value); // actual grouping; never an invented default
    }),
  };

  assessment = (event: RefreshAssessmentCaptureEvent): void => this.safe("assessment_capture_failed", () => {
    if (event.phase === "attempt") this.activeAssessmentBatches.add(event.batch);
    else {
      this.activeAssessmentBatches.delete(event.batch);
      if (event.phase === "completed" && (this.assessmentModelIds.get(event.batch)?.length !== 1 ||
          !this.modelContexts.get(this.assessmentModelIds.get(event.batch)![0]!)?.verified)) this.fail("assessment_missing_model_binding");
    }
    if (event.phase === "completed") this.validateAssessmentParser(event);
    this.assessments.push(JSON.parse(JSON.stringify(event)) as RefreshAssessmentCaptureEvent);
    this.append("assessments.jsonl", event);
  });
  model = (event: RefreshModelCaptureEvent): void => this.safe("model_capture_failed", () => {
    // Only capture the task inputs/outputs needed for selection, not summary generation.
    const context = "command" in event ? this.modelContexts.get(event.command.requestId) : this.modelContexts.get(event.requestId);
    if (event.kind === "invocation_started" || event.kind === "invocation_rejected") {
      if (![sourceContentAssessmentPurpose, activeReaderSummaryPurposes.storyRelations, activeReaderSummaryPurposes.relatedTopicRelations].includes(event.command.purpose)) return;
      this.assertScope(event.command);
      if (context) {
        if (event.kind !== "invocation_rejected" || context.commandJson !== JSON.stringify(event.command)) throw new Error("Duplicate request id");
        this.models.push(JSON.parse(JSON.stringify(event)) as RefreshModelCaptureEvent);
        this.append("models.jsonl", { ...event, assessmentBatch: context.assessmentBatch, relationId: context.relationId });
        return;
      }
      const relationId = [...this.pendingRelations].at(-1);
      const assessmentPurpose = event.command.purpose === sourceContentAssessmentPurpose;
      const matchingAssessmentBatches = assessmentPurpose ? [...this.activeAssessmentBatches].filter((batch) => {
        const attempt = this.assessments.find((entry) => entry.phase === "attempt" && entry.batch === batch);
        if (!attempt) return false;
        const requests = JSON.parse(attempt.requestsJson) as SourceContentQualityReviewRequest[];
        return event.command.prompt === JSON.stringify({ candidates: requests.map(promotionWireCandidate) });
      }) : [];
      const assessmentBatch = matchingAssessmentBatches[0];
      if ((assessmentPurpose && matchingAssessmentBatches.length !== 1) ||
          (!assessmentPurpose && relationId === undefined)) throw new Error("Unbound model request");
      if (!assessmentPurpose) {
        const query = this.relationQueries.get(relationId!);
        if (!query) throw new Error("Missing relation query");
        this.assertScope(query);
        const related = query.verificationLane === "related_topic";
        if (event.command.purpose !== (related ? activeReaderSummaryPurposes.relatedTopicRelations : activeReaderSummaryPurposes.storyRelations) ||
            event.command.prompt !== (related ? buildAgentRuntimeReaderSummaryRelatedTopicVerifierPrompt(query) : buildAgentRuntimeReaderSummaryStoryRelationVerifierPrompt(query)) ||
            event.command.systemPrompt !== (related ? agentRuntimeReaderSummaryRelatedTopicVerifierInstructions : agentRuntimeReaderSummaryStoryRelationVerifierInstructions) ||
            JSON.stringify(event.command.outputSchema) !== JSON.stringify(related ? agentRuntimeReaderSummaryRelatedTopicVerifierJsonSchema : agentRuntimeReaderSummaryStoryRelationVerifierJsonSchema)) {
          throw new Error("Relation command mismatch");
        }
      }
      if (assessmentPurpose) {
        this.validateAssessmentModel(event.command, assessmentBatch!);
        const attempt = this.assessments.find((e) => e.phase === "attempt" && e.batch === assessmentBatch)!;
        const requests = JSON.parse(attempt.requestsJson) as { promotion: { interestId: string; trustedIntent: string } }[];
        for (const request of requests) if (this.configuredInterestValues.get(request.promotion.interestId) !== request.promotion.trustedIntent) {
          throw new Error("Assessment configured interest mismatch");
        }
      }
      const binding = { ...(assessmentPurpose ? { assessmentBatch } : { relationId }),
        commandJson: JSON.stringify(event.command), terminal: event.kind === "invocation_rejected", verified: false };
      this.modelContexts.set(event.command.requestId, binding);
      const ids = assessmentPurpose ? this.assessmentModelIds : this.relationModelIds;
      const id = (assessmentPurpose ? assessmentBatch : relationId)!;
      ids.set(id, [...(ids.get(id) ?? []), event.command.requestId]);
    } else {
      if (!context) return;
      if (event.kind === "envelope_verified" || event.kind === "envelope_not_consumed") {
        this.assertScope(event.command);
        if (context.commandJson !== JSON.stringify(event.command) || context.terminal) throw new Error("Request mismatch");
        context.terminal = true;
        context.verified = event.kind === "envelope_verified";
      } else if (event.kind === "invocation_failed") context.terminal = true;
    }
    const bound = "command" in event ? this.modelContexts.get(event.command.requestId) : context;
    this.models.push(JSON.parse(JSON.stringify(event)) as RefreshModelCaptureEvent);
    this.append("models.jsonl", { ...event, assessmentBatch: bound?.assessmentBatch, relationId: bound?.relationId });
  });

  // Relation parser wrapper calls these around the same concrete verifier call.
  relationStart(query: unknown): number {
    const id = ++this.relationSequence;
    this.pendingRelations.add(id);
    this.safe("relation_capture_failed", () => this.append("relations.jsonl", { phase: "attempt", id, query }));
    return id;
  }
  relationEnd(id: number, outcome: unknown): void {
    this.safe("relation_capture_failed", () => {
      if (!this.pendingRelations.delete(id)) throw new Error("Unknown relation completion");
      this.append("relations.jsonl", { phase: "terminal", id, outcome });
    });
  }

  selector(delegate: ReaderSummaryEvidenceSelectorPort): ReaderSummaryEvidenceSelectorPort {
    return { select: async (query) => {
      this.safe("selection_capture_failed", () => {
        if (++this.selectionCount !== 1) throw new Error("Duplicate selection");
        this.assertScope(query);
        this.write("selection-query.json", { query, presentKeys: Object.keys(query) });
      });
      try {
        const result = await delegate.select(query);
        this.selected = true;
        this.safe("selection_capture_failed", () => this.write("selection.json", result));
        return result;
      } catch (error) { this.fail("selection_failed"); throw error; }
    } };
  }

  async finish(runCompleted: boolean) {
    if (this.finalizationAttempted) this.fail("duplicate_finalization");
    this.finalizationAttempted = true;
    // Allows the existing setImmediate shadow lane to start; never invokes or
    // retries it, never waits for a paid response or changes its timeout.
    await new Promise<void>((done) => setImmediate(done));
    if (!runCompleted) this.fail("refresh_incomplete");
    if (this.snapshotCount !== 1 || this.promotionCount !== 1 || this.preparationCount !== 1 ||
        this.selectionCount !== 1 || !this.selected) this.fail("missing_producer_callback");
    for (const required of ["controls.json", "rank-command.json", "canonical-bindings.json"]) {
      if (!this.files.has(required)) this.fail("missing_" + required);
    }
    if (this.pendingRelations.size) this.fail("relation_in_flight");
    this.safe("assessment_coverage_failed", () => this.validateAssessmentCoverage());
    if (this.activeAssessmentBatches.size) this.fail("assessment_in_flight");
    for (const context of this.modelContexts.values()) if (!context.terminal) this.fail("model_in_flight");
    if (!this.completion) this.fail("assessment_closure_missing");
    else this.safe("assessment_closure_incomplete", this.completion);
    let statuses: ReturnType<RefreshPairedExport["statuses"]> | undefined;
    this.safe("candidate_status_failed", () => {
      statuses = this.statuses();
      this.write("candidate-status.json", statuses);
    });
    this.safe("sidecar_integrity_failed", () => {
      for (const [name, bytes] of this.files) {
        if (readFileSync(join(this.directory, name), "utf8") !== bytes ||
            (statSync(join(this.directory, name)).mode & 0o777) !== 0o600) throw new Error("Changed sidecar");
      }
    });
    const result = { format: "reader-refresh-paired-capture.v1", scope: this.scope,
      complete: this.failures.size === 0, failures: [...this.failures],
      unresolvedCandidateCount: this.raw && this.promotion && this.preparation && statuses ? statuses.filter((s) => s.status === "pending" || s.status === "model_abstained").length : null,
      observationCounts: { snapshots: this.snapshotCount, promotion: this.promotionCount, preparation: this.preparationCount,
        selections: this.selectionCount, relationAttempts: this.relationSequence, modelRequests: this.modelContexts.size },
      candidateCounts: statuses && this.raw && this.promotion && this.preparation ? {
        total: statuses.length, requested: statuses.filter((s) => s.requested).length,
        attempted: statuses.filter((s) => s.attempted).length,
        resolved: statuses.filter((s) => s.status === "model_resolved").length,
        rejected: statuses.filter((s) => s.status === "model_resolved" && s.decision === "reject").length,
        abstained: statuses.filter((s) => s.status === "model_abstained").length,
        hardGate: statuses.filter((s) => s.status === "deterministic_hard_gate").length,
        exempt: statuses.filter((s) => s.status === "deterministic_exempt").length,
      } : null,
      files: [...this.files].map(([name, bytes]) => ({ name, bytes: Buffer.byteLength(bytes),
        sha256: createHash("sha256").update(bytes).digest("hex") })),
      experimentComplete: false, actualReplayVerified: false };
    if (result.complete) this.safe("manifest_write_failed", () => this.write("complete.json", result));
    else this.safe("incomplete_write_failed", () => this.write("incomplete.json", result));
    // Incomplete captures remain appendable for an already consumed late
    // response. They can never be resealed or cause a duplicate invocation.
    this.finished = this.failures.size === 0;
    return { ...result, complete: this.failures.size === 0, failures: [...this.failures], path: this.directory };
  }

  private statuses() {
    if (!this.promotion || !this.raw || !this.preparation) throw new Error("Unknown candidate status population");
    const requested = new Set(this.promotion.ranked.requestedCandidateIds);
    const attempted = new Set(this.assessments.filter((e) => e.phase === "attempt").flatMap((e) =>
      (JSON.parse(e.requestsJson) as { candidateId: string }[]).map((r) => r.candidateId)));
    return [...this.promotion.ranked.primary, ...this.promotion.ranked.supplemental].map((item) => {
      const reason = item.contentQuality?.reason ?? "missing_quality";
      const primary = this.raw!.candidates.find(({ item: raw }) => raw.toSnapshot().id === item.feedItemId);
      const github = primary?.canonical.metrics.kind === "github_repository" ||
        this.promotion!.supplemental.some((s) => s.feedItemId === item.feedItemId && s.promotionFacts?.contentKind === "github_trending");
      if (!requested.has(item.feedItemId) && !github && primary &&
          reason === "promotion_assessment_not_requested:hard_gate" &&
          canCompeteForPromotionAssessment(item, this.scope.observedThrough)) throw new Error("False hard gate");
      const status = requested.has(item.feedItemId)
        ? reason.startsWith("promotion_assessment:") && attempted.has(item.feedItemId) ? "model_resolved"
          : ["promotion_assessment_pending:low_confidence", "promotion_assessment_pending:needs_context"].includes(reason) && attempted.has(item.feedItemId)
            ? "model_abstained" : "pending"
        : github ? "deterministic_exempt"
          : reason === "promotion_assessment_not_requested:hard_gate" ? "deterministic_hard_gate" : "pending";
      return { feedItemId: item.feedItemId, status, reason, requested: requested.has(item.feedItemId),
        attempted: attempted.has(item.feedItemId), decision: item.contentQuality?.decision,
        eligibleForSummary: item.contentQuality?.eligibleForSummary,
        readerHeadline: item.readerHeadline, headlineCaptured: item.readerHeadline !== undefined };
    });
  }

  private validateAssessmentModel(command: AgentRuntimeTaskCommand, batch: number): void {
    const attempt = this.assessments.find((event) => event.phase === "attempt" && event.batch === batch);
    if (!attempt) throw new Error("Missing assessment request");
    const requests = JSON.parse(attempt.requestsJson) as SourceContentQualityReviewRequest[];
    const expectedPrompt = JSON.stringify({ candidates: requests.map(promotionWireCandidate) });
    if (command.prompt !== expectedPrompt || command.systemPrompt !== promotionReviewInstructions ||
        JSON.stringify(command.outputSchema) !== JSON.stringify(promotionResponseSchema) ||
        command.controls?.outputSchemaName !== "social_monitor_source_content_quality_review" ||
        command.controls?.schemaVersion !== "source_content_assessment.v1") {
      throw new Error("Assessment concrete command mismatch");
    }
  }

  private validateAssessmentParser(event: RefreshAssessmentCaptureEvent): void {
    const ids = this.assessmentModelIds.get(event.batch);
    if (ids?.length !== 1) throw new Error("Missing assessment model envelope");
    const envelope = this.models.find((model): model is Extract<RefreshModelCaptureEvent, { kind: "envelope_verified" }> =>
      model.kind === "envelope_verified" && model.command.requestId === ids[0]);
    if (!envelope) throw new Error("Missing verified assessment bytes");
    this.validateAssessmentModel(envelope.command, event.batch);
    const attempt = this.assessments.find((entry) => entry.phase === "attempt" && entry.batch === event.batch);
    if (attempt?.requestsJson !== event.requestsJson) throw new Error("Assessment parsed request mismatch");
    const requests = JSON.parse(event.requestsJson) as SourceContentQualityReviewRequest[];
    const parsed = parseReviews(JSON.stringify(envelope.result.structuredOutput), requests);
    if (JSON.stringify(parsed) !== event.reviewsJson) throw new Error("Assessment concrete parser mismatch");
  }

  private validateAssessmentCoverage(): void {
    if (!this.raw || !this.promotion) throw new Error("Missing assessment inventory");
    const ranked = new Map([...this.promotion.ranked.primary, ...this.promotion.ranked.supplemental]
      .map((item) => [item.feedItemId, item]));
    const eligible = new Set(this.promotion.ranked.requestedCandidateIds);
    const raw = new Map([...this.raw.candidates.map(({ item }) => item.toSnapshot()),
      ...(this.raw.supplementalItems ?? []).map((item) => item.toSnapshot())].map((item) => [item.id, item]));
    const attempts = new Map<number, RefreshAssessmentCaptureEvent>();
    const terminals = new Set<number>();
    const attemptedIds = new Set<string>();
    const completedIds = new Set<string>();
    type Request = { candidateId: string; providerKey: string; title: string; bodyPreview?: string;
      promotion?: { tenantId: string; workspaceId: string; interestId: string;
        sourceItemId: string; sourceBindingId: string } };
    type Verdict = { candidateId: string; verdict: { reason: string; decision: string;
      eligibleForSummary: boolean; eligibleForTopRead: boolean; needsLlmReview: boolean; qualityScore: number } };
    for (const event of this.assessments) {
      const requests = JSON.parse(event.requestsJson) as Request[];
      if (!Array.isArray(requests) || !requests.length || !Number.isSafeInteger(event.batch) || event.batch < 1) {
        throw new Error("Invalid assessment batch");
      }
      if (event.phase === "attempt") {
        if (attempts.has(event.batch)) throw new Error("Duplicate assessment batch");
        attempts.set(event.batch, event);
        for (const request of requests) {
          const item = raw.get(request.candidateId);
          const projection = ranked.get(request.candidateId);
          const binding = request.promotion;
          if (!item || !projection || !binding || !eligible.has(request.candidateId) || attemptedIds.has(request.candidateId)) {
            throw new Error("Unbound or duplicate assessment identity");
          }
          this.assertScope(binding);
          if (binding.sourceItemId !== item.sourceItemId || binding.sourceBindingId !== item.sourceBindingId ||
              binding.interestId !== item.interestId || request.providerKey !== item.providerKey ||
              request.title !== projection.title.slice(0, 2_000) ||
              request.bodyPreview !== (projection.bodyPreview ?? "").slice(0, 12_000)) {
            throw new Error("Assessment source mismatch");
          }
          attemptedIds.add(request.candidateId);
        }
      } else {
        const attempt = attempts.get(event.batch);
        if (!attempt || terminals.has(event.batch) || attempt.requestsJson !== event.requestsJson ||
            event.atMs < attempt.atMs) throw new Error("Assessment terminal mismatch");
        terminals.add(event.batch);
        if (event.phase !== "completed") continue;
        if (!event.consumed || !event.reviewsJson || !event.verdictsJson) throw new Error("Missing parsed assessment");
        const reviews = JSON.parse(event.reviewsJson) as { candidateId: string }[];
        const verdicts = JSON.parse(event.verdictsJson) as Verdict[];
        if (!Array.isArray(reviews) || !Array.isArray(verdicts) || reviews.length !== requests.length ||
            verdicts.length !== requests.length || new Set(reviews.map((r) => r.candidateId)).size !== requests.length ||
            new Set(verdicts.map((v) => v.candidateId)).size !== requests.length) throw new Error("Assessment result coverage");
        for (const request of requests) {
          const verdict = verdicts.find((v) => v.candidateId === request.candidateId)?.verdict;
          const quality = ranked.get(request.candidateId)?.contentQuality;
          if (!verdict || !quality || !reviews.some((r) => r.candidateId === request.candidateId) ||
              verdict.reason !== quality.reason || verdict.decision !== quality.decision ||
              verdict.eligibleForSummary !== quality.eligibleForSummary ||
              verdict.eligibleForTopRead !== quality.eligibleForTopRead ||
              verdict.needsLlmReview !== quality.needsLlmReview || verdict.qualityScore !== quality.qualityScore) {
            throw new Error("Assessment verdict mismatch");
          }
          completedIds.add(request.candidateId);
        }
      }
    }
    if (attempts.size !== terminals.size) throw new Error("Assessment in flight");
    for (const id of eligible) {
      const quality = ranked.get(id)?.contentQuality;
      if (!quality) throw new Error("Unknown eligible assessment identity");
      if ((quality.reason.startsWith("promotion_assessment:") ||
          ["promotion_assessment_pending:low_confidence", "promotion_assessment_pending:needs_context"].includes(quality.reason)) &&
          !completedIds.has(id)) throw new Error("Missing actual assessment completion");
    }
  }

  private assertScope(value: { tenantId: string; workspaceId: string }): void {
    if (value.tenantId !== this.scope.tenantId || value.workspaceId !== this.scope.workspaceId) throw new Error("Cross-scope capture");
  }
  private append(name: string, value: unknown): void {
    const line = JSON.stringify({ sequence: ++this.sequence, atMs: this.now(), event: value }) + "\n";
    if (this.sequence > MAX_EVENTS) throw new Error("Capture event bound");
    this.reserve(line);
    const fd = openSync(join(this.directory, name), constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
    try { writeSync(fd, line); fsyncSync(fd); } finally { closeSync(fd); }
    this.files.set(name, (this.files.get(name) ?? "") + line);
  }
  private reserve(bytes: string): void {
    if (!this.initialized || this.finished || this.bytes + Buffer.byteLength(bytes) > MAX_BYTES) throw new Error("Capture unavailable");
    this.bytes += Buffer.byteLength(bytes);
  }
  private write(name: string, value: unknown): void {
    const bytes = JSON.stringify(value) + "\n";
    this.reserve(bytes);
    const temporary = join(this.directory, `.${name}.${randomUUID()}`);
    writeFileSync(temporary, bytes, { flag: "wx", mode: 0o600 });
    const fd = openSync(temporary, constants.O_RDONLY | constants.O_NOFOLLOW);
    try { fsyncSync(fd); } finally { closeSync(fd); }
    try { linkSync(temporary, join(this.directory, name)); } finally { unlinkSync(temporary); }
    try {
      const dir = openSync(this.directory, constants.O_RDONLY);
      try { fsyncSync(dir); } finally { closeSync(dir); }
    } catch (error) {
      // If durability failed after linking, withdraw our own completion marker.
      if (name === "complete.json") unlinkSync(join(this.directory, name));
      throw error;
    }
    this.files.set(name, bytes);
  }
}
