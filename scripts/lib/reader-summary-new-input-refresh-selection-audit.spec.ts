import { PROMOTION_ELIGIBLE_ITEM_CEILING } from "@social-monitor/feed/ports";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { ReaderSummaryJob, type SummaryEvidenceSelection, type SummaryEvidenceItem } from "@social-monitor/summary/domain";
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
});

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
