import { PROMOTION_ELIGIBLE_ITEM_CEILING, PROMOTION_PHYSICAL_ROW_CEILING } from "@social-monitor/feed/ports";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { READER_SUMMARY_EDITORIAL_SLATE_VERSION, ReaderSummaryJob,
  type SummaryEvidenceSelection, type SummaryEvidenceItem } from "@social-monitor/summary/domain";
import { composeReaderSummaryEditorialSlate, materializeReaderSummaryEditorialSlate } from
  "@social-monitor/summary/adapters/evidence/reader-summary-editorial-slate";
import { selection, xEvidence, redditEvidence, storyCluster } from
  "@social-monitor/summary/adapters/evidence/reader-summary-editorial-slate.spec-support";
import { refreshPeriod } from "./reader-summary-new-input-refresh-capture";
import { NewInputRefreshGuard, reconcileRefresh } from "./reader-summary-new-input-refresh-guard";
import { refreshHash, refreshOperation } from "./reader-summary-new-input-refresh-manifest";
import { refreshManifest, refreshNow } from "./reader-summary-new-input-refresh.spec-support";
import { withRefreshSelectionAudit } from "./reader-summary-new-input-refresh-selection-audit";

const m = refreshManifest();
const query = { tenantId: tenantId(m.tenantId), workspaceId: workspaceId(m.workspaceId),
  scope: { type: "workspace" as const }, period: refreshPeriod(m.date), maxItems: 120,
  observedThrough: new Date(m.observedThrough) };
const job = ReaderSummaryJob.request({ ...query, id: "audit-job", idempotencyKey: m.operation, requestedAt: refreshNow });

describe("private refresh selection receipt", () => {
  it("captures actual ranking, duplicate and capacity exclusions without changing selected/support evidence", async () => {
    const result = canonical([
      ...Array.from({ length: 18 }, (_, i) => xEvidence(`x-${i}`, 1_000 - i)),
      redditEvidence("support", 80, { canonicalIdentity: "story:x-0" }),
      xEvidence("viral-irrelevant", 9_999_999, { relevanceScore: 0.49 }),
    ]);
    const before = refreshHash(result);
    const manifest = { ...m, authority: { ...m.authority, eligibleCount: 20 } };
    manifest.operation = refreshOperation(manifest);
    const select = jest.fn(async () => result), record = jest.fn(), invalidate = jest.fn();
    const audited = withRefreshSelectionAudit({ selector: { select }, manifest, jobId: "audit-job", record, invalidate });
    expect(await audited.select(query)).toBe(result);
    expect(select).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalledWith(query);
    expect(record).toHaveBeenCalledTimes(1);
    expect(invalidate).not.toHaveBeenCalled();
    expect(refreshHash(result)).toBe(before);
    const receipt = record.mock.calls[0]![0];
    expect(receipt).toMatchObject({ status: "selection_audit", tenantId: m.tenantId, workspaceId: m.workspaceId,
      date: m.date, jobId: "audit-job", operation: manifest.operation, observedThrough: m.observedThrough,
      manifestCanonicalSha256: refreshHash(manifest), sourceSha256: m.sourceSha256,
      canonicalInputSha256: m.authority.canonicalInputSha256,
      selectedFeedItemIds: result.selectedEvidence.map((item) => item.feedItemId),
      editorialSlate: { topCandidateIds: result.editorialSlate!.top.map((item) => item.candidateId),
        additionalCandidateIds: result.editorialSlate!.additional.map((item) => item.candidateId),
        excluded: result.editorialSlate!.excluded.map(({ candidateId, reasonCodes }) => ({ candidateId, reasonCodes })) },
    });
    expect(receipt.editorialSlate.excluded).toEqual(expect.arrayContaining([
      { candidateId: "viral-irrelevant", reasonCodes: ["relevance_floor_not_met"] },
      { candidateId: "support", reasonCodes: ["semantic_story_duplicate"] },
      { candidateId: "x-17", reasonCodes: ["editorial_capacity_exhausted"] },
    ]));
    expect(receipt.support).toContainEqual({ representativeFeedItemId: "x-0", supportFeedItemIds: ["support"] });
    expect(Object.isFrozen(receipt.selectedFeedItemIds)).toBe(true);
    expect(Object.isFrozen(receipt.support[0].supportFeedItemIds)).toBe(true);
    expect(Object.isFrozen(receipt.editorialSlate.excluded[0].reasonCodes)).toBe(true);
    expect(JSON.stringify(receipt)).not.toMatch(/DO_NOT_RECORD|canonicalIdentity|digestMaterial|candidateDigestInput|bodyPreview|sourceText|providerMetadata|whyImportant|tokens|secret/u);
  });

  it.each(["absent", "empty", "no_signal"])("distinguishes %s without inventing exclusions", async (kind) => {
    const result = canonical(kind === "no_signal" ? [xEvidence("below-floor", 34)] : []);
    const record = jest.fn();
    await withRefreshSelectionAudit({ selector: { select: async () => kind === "absent"
      ? { ...result, editorialSlate: undefined } : result }, manifest: m, jobId: "audit-job", record,
    invalidate: jest.fn() }).select(query);
    const receipt = record.mock.calls[0]![0];
    expect(receipt.selectedFeedItemIds).toEqual([]);
    expect(receipt.support).toEqual([]);
    expect(receipt.editorialSlate).toEqual(kind === "absent" ? null : {
      policyVersion: result.editorialSlate!.policyVersion, topCandidateIds: [], additionalCandidateIds: [],
      excluded: kind === "empty" ? [] : [{ candidateId: "below-floor", reasonCodes: ["provider_floor_not_met"] }],
    });
  });

  it.each(["success", "precheck", "selector", "cutoff", "postcheck", "journal"])("preserves %s error ordering", async (phase) => {
    const order: string[] = [], failure = new Error("synthetic failure");
    const guard = new NewInputRefreshGuard(m, "audit-job", { now: () => refreshNow, assertFences: jest.fn(),
      assertCurrent: async () => { order.push("check");
        if (phase === "precheck" || (phase === "postcheck" && order.includes("select"))) throw failure;
      } });
    // Claim before enabling the failing execution checks.
    const claimCheck = jest.spyOn(guard, "assertCurrent").mockResolvedValueOnce(undefined);
    await guard.claim(job.toSnapshot()); claimCheck.mockRestore();
    const select = jest.fn(async () => {
      order.push("select"); if (phase === "selector") throw failure;
      const result = canonical([]);
      return phase === "cutoff" ? { ...result, sourceWindow: { ...result.sourceWindow, ingestionCutoff: refreshNow } } : result;
    });
    const record = jest.fn(() => { order.push("record"); if (phase === "journal") throw failure; });
    const audited = withRefreshSelectionAudit({ selector: guard.selector({ select }), manifest: m,
      jobId: "audit-job", record, invalidate: () => guard.invalidate() });
    if (phase === "success") await audited.select(query);
    else await expect(audited.select(query)).rejects.toThrow();
    expect(order).toEqual(phase === "precheck" ? ["check"] : ["success", "journal"].includes(phase)
      ? ["check", "select", "check", "record"] : phase === "postcheck"
        ? ["check", "select", "check"] : ["check", "select"]);
    if (phase === "journal") {
      await expect(audited.select(query)).rejects.toThrow(/reconciliation/u);
      expect(select).toHaveBeenCalledTimes(1);
      expect(record).toHaveBeenCalledTimes(1);
      expect(() => reconcileRefresh(m, [{ jobId: "audit-job", operation: m.operation,
        status: "FAILED", artifactId: null }], m.prior)).toThrow(/consumed/u);
    } else expect(record).toHaveBeenCalledTimes(phase === "success" ? 1 : 0);
  });

  it.each(["at_limit", "over_limit", "unknown_reason"])("bounds canonical counts and reason codes: %s", async (kind) => {
    const result = canonical([]), record = jest.fn(), invalidate = jest.fn();
    const count = PROMOTION_ELIGIBLE_ITEM_CEILING + (kind === "over_limit" ? 1 : 0);
    const excluded = Array.from({ length: count }, (_, i) => ({ candidateId: `excluded-${i}`,
      canonicalIdentity: "DO_NOT_RECORD", reasonCodes: [kind === "unknown_reason" ? "DO_NOT_RECORD" : "quality_floor_not_met"] }));
    const promise = withRefreshSelectionAudit({ selector: { select: async () => ({ ...result,
      editorialSlate: { ...result.editorialSlate!, excluded } }) },
    manifest: { ...m, authority: { ...m.authority, eligibleCount: count } }, jobId: "audit-job", record, invalidate }).select(query);
    if (kind === "at_limit") {
      await promise;
      expect(record.mock.calls[0]![0].editorialSlate.excluded).toHaveLength(count);
      expect(invalidate).not.toHaveBeenCalled();
    } else { await expect(promise).rejects.toThrow(/bounds or reason/u);
      expect(record).not.toHaveBeenCalled(); expect(invalidate).toHaveBeenCalledTimes(1); }
  });

  describe.each(["selected", "representative", "support", "top", "additional", "excluded"])("primitive %s IDs", (field) => {
    it.each(["object", "array", "boxed_string", "number", "boolean", "null", "undefined"])("rejects %s without coercion or recording", async (kind) => {
      const result = canonical([xEvidence("synthetic", 500)]);
      const coerce = jest.fn(() => "DO_NOT_RECORD");
      const payload = { rawContent: "DO_NOT_RECORD", toString: coerce, toJSON: coerce };
      const values: Record<string, unknown> = { object: payload, array: [payload], boxed_string: Object("synthetic"),
        number: 1, boolean: true, null: null, undefined: undefined };
      const value = values[kind];
      if (field === "selected") Object.assign(result.selectedEvidence[0]!, { feedItemId: value });
      if (field === "representative") Object.assign(result.clusters[0]!, { representativeFeedItemId: value });
      if (field === "support") Object.assign(result.clusters[0]!, { duplicateFeedItemIds: [value] });
      // Canonical entries are frozen; inject a malformed copy into the test slate.
      if (field === "top") Object.assign(result.editorialSlate!, { top: [{ ...result.editorialSlate!.top[0]!, candidateId: value }] });
      if (field === "additional") Object.assign(result.editorialSlate!, { additional: [{ candidateId: value }] });
      if (field === "excluded") Object.assign(result.editorialSlate!, {
        excluded: [{ candidateId: value, reasonCodes: ["provider_floor_not_met"] }],
      });
      await expectMalformedSelection(result);
      expect(coerce).not.toHaveBeenCalled();
      expect(Object.isFrozen(payload)).toBe(false);
    });
  });

  it.each(["object", "boxed_string", "wrong_version", "null", "undefined"])("rejects %s policy version", async (kind) => {
    const result = canonical([]), coerce = jest.fn(() => READER_SUMMARY_EDITORIAL_SLATE_VERSION);
    const versions: Record<string, unknown> = { object: { rawContent: "DO_NOT_RECORD", toString: coerce, toJSON: coerce },
      boxed_string: Object(READER_SUMMARY_EDITORIAL_SLATE_VERSION), wrong_version: "unknown-policy", null: null, undefined: undefined };
    Object.assign(result.editorialSlate!, { policyVersion: versions[kind] });
    await expectMalformedSelection(result);
    expect(coerce).not.toHaveBeenCalled();
  });

  describe.each(["selectedEvidence", "clusters", "support", "top", "additional", "excluded", "reasons"])("required %s array", (field) => {
    it.each(["missing", "null", "array_like", "iterable", "string", "sparse"])("rejects %s rather than inventing receipt data", async (kind) => {
      const result = canonical([xEvidence("synthetic", 500)]), iterate = jest.fn(() => [][Symbol.iterator]());
      const arrays: Record<string, unknown> = { missing: undefined, null: null, array_like: { length: 0 },
        iterable: { [Symbol.iterator]: iterate }, string: "", sparse: new Array(1) };
      const value = arrays[kind];
      if (field === "selectedEvidence" || field === "clusters") Object.assign(result, { [field]: value });
      if (field === "support") Object.assign(result.clusters[0]!, { duplicateFeedItemIds: value });
      if (field === "top" || field === "additional" || field === "excluded") Object.assign(result.editorialSlate!, { [field]: value });
      if (field === "reasons") Object.assign(result.editorialSlate!, {
        excluded: [{ candidateId: "excluded", reasonCodes: value }],
      });
      await expectMalformedSelection(result);
      expect(iterate).not.toHaveBeenCalled();
    });
  });

  it("rejects a null slate while preserving undefined as the absent slate", async () => {
    await expectMalformedSelection(Object.assign(canonical([]), { editorialSlate: null }));
  });

  it("keeps reason order and duplicates exactly, copying and freezing all receipt containers", async () => {
    const result = canonical([xEvidence("synthetic", 500)]), record = jest.fn();
    const reasonCodes = ["semantic_story_duplicate", "quality_floor_not_met", "semantic_story_duplicate"];
    Object.assign(result.editorialSlate!, { excluded: [{ candidateId: "excluded", reasonCodes }] });
    await withRefreshSelectionAudit({ selector: { select: async () => result }, manifest: m, jobId: "audit-job",
      record, invalidate: jest.fn() }).select(query);
    const receipt = record.mock.calls[0]![0];
    expect(receipt.editorialSlate.excluded[0].reasonCodes).toEqual(reasonCodes);
    for (const container of [receipt, receipt.support, receipt.support[0], receipt.support[0].supportFeedItemIds,
      receipt.editorialSlate, receipt.editorialSlate.topCandidateIds, receipt.editorialSlate.additionalCandidateIds,
      receipt.editorialSlate.excluded, receipt.editorialSlate.excluded[0], receipt.editorialSlate.excluded[0].reasonCodes]) {
      expect(Object.isFrozen(container)).toBe(true);
    }
    reasonCodes.push("provider_floor_not_met");
    expect(receipt.editorialSlate.excluded[0].reasonCodes).toHaveLength(3);
    expect(Object.isFrozen(result.editorialSlate!.excluded)).toBe(false);
  });

  it.each(["non_string_reason", "reason_ceiling", "manifest_ceiling", "selected_ceiling", "cluster_ceiling", "support_ceiling"])("retains %s rejection", async (kind) => {
    const result = canonical([xEvidence("synthetic", 500)]);
    if (kind === "non_string_reason" || kind === "reason_ceiling") Object.assign(result.editorialSlate!, {
      excluded: [{ candidateId: "excluded", reasonCodes: kind === "non_string_reason"
        ? [{ rawContent: "DO_NOT_RECORD" }] : Array(22).fill("semantic_story_duplicate") }],
    });
    if (kind === "manifest_ceiling") Object.assign(result.editorialSlate!, {
      excluded: Array.from({ length: m.authority.eligibleCount }, (_, i) => ({ candidateId: `excluded-${i}`, reasonCodes: [] })),
    });
    if (kind === "selected_ceiling") Object.assign(result, { selectedEvidence: Array(PROMOTION_PHYSICAL_ROW_CEILING + 1).fill(result.selectedEvidence[0]) });
    if (kind === "cluster_ceiling") Object.assign(result, { clusters: Array(PROMOTION_PHYSICAL_ROW_CEILING + 1).fill(result.clusters[0]) });
    if (kind === "support_ceiling") Object.assign(result.clusters[0]!, { duplicateFeedItemIds: Array(PROMOTION_PHYSICAL_ROW_CEILING + 1).fill("support") });
    await expectMalformedSelection(result);
  });
});

async function expectMalformedSelection(result: SummaryEvidenceSelection): Promise<void> {
  const guard = new NewInputRefreshGuard(m, "audit-job", { now: () => refreshNow,
    assertFences: jest.fn(), assertCurrent: async () => undefined });
  await guard.claim(job.toSnapshot());
  const select = jest.fn(async () => result), record = jest.fn(), invalidate = jest.fn(() => guard.invalidate());
  const audited = withRefreshSelectionAudit({ selector: guard.selector({ select }), manifest: m,
    jobId: "audit-job", record, invalidate });
  await expect(audited.select(query)).rejects.toThrow();
  expect(record).not.toHaveBeenCalled();
  expect(invalidate).toHaveBeenCalledTimes(1);
  await expect(audited.select(query)).rejects.toThrow(/reconciliation/u);
  expect(select).toHaveBeenCalledTimes(1);
}

function canonical(items: readonly SummaryEvidenceItem[]): SummaryEvidenceSelection {
  const publishedAt = new Date(`${m.date}T12:00:00Z`), observedAt = new Date(`${m.date}T13:00:00Z`);
  const evidence = items.map((item) => ({ ...item, publishedAt, observedAt, promotionFacts: { ...item.promotionFacts!,
    engagementAuthority: { observedAt: query.observedThrough, regressionState: "stable" as const },
    freshnessProvenance: { status: "observed" as const, publishedAt, observedAt, ingestionCutoff: query.observedThrough },
  } }));
  const original = selection(evidence, evidence.map((item) => storyCluster(item.feedItemId, [item])));
  const source = { ...original, sourceWindow: { ...original.sourceWindow, startedAt: query.period.startedAt,
    endedAt: query.period.endedAt, periodStartedAt: query.period.startedAt, periodEndedAt: query.period.endedAt,
    ingestionCutoff: query.observedThrough } };
  const result = materializeReaderSummaryEditorialSlate({ selection: source,
    slate: composeReaderSummaryEditorialSlate({ selection: source }) });
  return { ...result, editorialSlate: Object.assign({}, result.editorialSlate!, { hidden: "DO_NOT_RECORD" }),
    selectedEvidence: result.selectedEvidence.map((item) => ({ ...item,
    title: "DO_NOT_RECORD", bodyPreview: "DO_NOT_RECORD", providerMetadata: { secret: "DO_NOT_RECORD" } })),
  };
}
