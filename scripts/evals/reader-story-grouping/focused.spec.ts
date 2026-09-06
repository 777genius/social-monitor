import { mkdtempSync, readFileSync, writeFileSync, cpSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Ajv from "ajv";
import { canonicalJsonSha256 } from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import { belongsToVerifiedStoryCluster, verifiedStoryRelationPairKey } from
  "@social-monitor/summary/domain/services/story-cluster-membership";
import { STORY_RANKING_POLICY_V1 } from "@social-monitor/summary/domain/policies/story-ranking-policy";
import { loadDataset, FIXTURES, readJson, type Dataset } from "./dataset";
import { prepareBlock, applyDecisions, together, caseRows, type PreparedBlock } from "./replay";
import { captureRequest, makeManifest, verifyManifest, checkReceiptBinding, normalizeCapturedResponse,
  type RequestEnvelope, type CaptureReceipt, type RequestManifest } from "./requests";
import { confusion } from "./report";

let data: Dataset; let prepared: PreparedBlock[]; let envelopes: RequestEnvelope[]; let manifest: RequestManifest;
beforeAll(async () => {
  data = loadDataset(); prepared = await Promise.all(data.blocks.map((b) => prepareBlock(data, b)));
  envelopes = (await Promise.all(prepared.map(captureRequest))).filter((r): r is RequestEnvelope => r !== undefined);
  // Unit-test identity only; real clean-commit binding is exercised in source-identity.spec.ts.
  manifest = makeManifest(data, envelopes, { revision: "b".repeat(40), treeSha: "c".repeat(40), worktree: "clean" });
});
const decisionsFor = (p: PreparedBlock, confidenceScore = 0.92) => p.candidates.map((c) => ({
  leftFeedItemId: c.leftFeedItemId, rightFeedItemId: c.rightFeedItemId,
  sameStory: true, confidenceScore, rationale: "Deterministic transport/approval test; not a semantic model answer.",
}));
const fixtureReceipt = (): CaptureReceipt => ({
  schemaVersion: 2, captureKind: "offline_fixture", captureSourceRevision: manifest.captureSourceRevision,
  evaluatedSource: manifest.evaluatedSource,
  manifestSha256: canonicalJsonSha256(manifest), labelSealSha256: manifest.labelSealSha256,
  replaySha256: manifest.replaySha256,
  transport: { authentication: "deterministic_fixture", operatorRecord: "unit test, no authenticated transport",
    runtimePackageVersion: "0.0.0-fixture", launcherSha256: "a".repeat(64) },
  responses: envelopes.map((e) => {
    const p = prepared.find((b) => b.block.id === e.blockId)!;
    const structuredOutput = { decisions: decisionsFor(p) };
    return { blockId: e.blockId, commandSha256: e.commandSha256,
      canonicalRequestSha256: e.canonicalRequestSha256, schemaSha256: e.schemaSha256,
      evidenceSha256: e.evidenceSha256, receivedAt: "2026-09-06T00:00:00Z",
      result: { status: "completed", warnings: [], structuredOutput, executionAttestation: {
        schemaVersion: 1, requestId: e.command.requestId, purpose: e.command.purpose,
        canonicalRequestSha256: e.canonicalRequestSha256, provider: "codex", model: "gpt-5.6-sol",
        reasoningEffort: "high", runtimeEngine: "subscription-runtime-cli", runtimePackageVersion: "0.0.0-fixture",
        launcherSha256: "a".repeat(64), selectedOutputKind: "structured_output",
        selectedOutputSha256: canonicalJsonSha256(structuredOutput),
      } },
    };
  }),
});

describe("sealed public real-post grouping replay", () => {
  it("keeps seven-day provenance, 15 cross-provider positives and four visibly ambiguous pairs", () => {
    expect(data.cases).toHaveLength(50); expect(data.posts).toHaveLength(49);
    expect(new Set(data.posts.map((p) => p.publishedAt.slice(0, 10))).size).toBe(7);
    expect(data.cases.filter((c) => c.productAction === "merge_if_admitted")).toHaveLength(15);
    expect(data.cases.filter((c) => !c.scored)).toHaveLength(4);
    expect(data.blocks.filter((b) => b.postRefs.length >= 3).length).toBeGreaterThanOrEqual(3);
  });
  it("rejects any post-seal label edit", () => {
    const dir = mkdtempSync(join(tmpdir(), "rsg-seal-test-"));
    try {
      cpSync(FIXTURES, dir, { recursive: true });
      writeFileSync(join(dir, "cases.json"), readFileSync(join(dir, "cases.json"), "utf8") + " ");
      expect(() => loadDataset(dir)).toThrow("Frozen label/evidence mismatch");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("captures actual Sol/high adapter and admitted canonical envelopes without analyst labels", () => {
    expect(envelopes).toHaveLength(9);
    expect(envelopes.reduce((n, e) => n + e.candidateCount, 0)).toBe(14);
    for (const e of envelopes) {
      expect(e.command.controls).toMatchObject({ model: "gpt-5.6-sol", reasoningEffort: "high", interactive: false });
      expect(e.canonicalRequestSha256).toBe(canonicalJsonSha256(e.canonicalRequest));
      expect(e.command.prompt).not.toMatch(/rationaleRu|semanticRelation|productAction|RSG-\d/);
      expect(String(e.command.workspaceId)).toBe("00000000-0000-4000-8000-00000000e002");
    }
  });
  it("reports the real Fable release retrieval miss even in an isolated real pair", async () => {
    const gold = data.cases.find((c) => c.id === "RSG-001")!;
    const p = prepared.find((b) => b.block.id === gold.blockId)!;
    const row = (await caseRows(data, p, applyDecisions(p))).find((r) => r.id === gold.id)!;
    expect(row.retrieval.candidate).toBe(false); expect(row.retrieval.isolatedRetrieved).toBe(false);
    expect(row.model).toBeNull(); expect(row.relationTogether).toBe(false);
  });
  it("preserves original admission facts: 42 missing authorities, one admitted public post", () => {
    const all = new Map(prepared.flatMap((p) => applyDecisions(p).admission).map((a) => [a.feedItemId, a.result]));
    expect([...all.values()].filter((a) => a?.admitted)).toHaveLength(1);
    expect([...all.values()].filter((a) => a && !a.admitted && a.reasons.includes("engagement_unauthoritative"))).toHaveLength(42);
  });
  it("exercises real confidence boundary via adapter normalizer and reconciliation, not gold answers", async () => {
    const p = prepared.find((b) => b.block.id === "astra-neuralese")!;
    const e = envelopes.find((x) => x.blockId === p.block.id)!;
    const result = fixtureReceipt().responses.find((r) => r.blockId === p.block.id)!.result;
    const normalized = await normalizeCapturedResponse(p, e, result);
    const admitted = applyDecisions(p, normalized);
    expect(admitted.batch?.approvedPairs.size).toBe(1);
    expect(admitted.graduatedRelations).toHaveLength(1);
    const low = applyDecisions(p, decisionsFor(p, 0.919999));
    expect(low.batch?.traces[0]?.disposition).toBe("rejected_below_confidence");
    expect(low.batch?.approvedPairs.size).toBe(0);
  });
  it.each(["duplicate", "missing", "unknown", "nan", "extra"])("fails closed on %s response", (kind) => {
    const p = prepared.find((b) => b.block.id === "astra-neuralese")!;
    const valid = decisionsFor(p); let values: unknown[] = valid;
    if (kind === "duplicate") values = [...valid, valid[0]];
    if (kind === "missing") values = [];
    if (kind === "unknown") values = [{ ...valid[0], leftFeedItemId: "unknown-disposable-fixture" }];
    if (kind === "nan") values = [{ ...valid[0], confidenceScore: Number.NaN }];
    if (kind === "extra") values = [{ ...valid[0], relation: "same_story" }];
    const outcome = applyDecisions(p, values);
    expect(outcome.batch?.responseAccepted).toBe(false);
    expect(outcome.batch?.approvedPairs.size).toBe(0);
  });
  it("does not let a forced A-B/B-C bridge merge three real posts", () => {
    // All supplied approvals are adversarial deterministic test inputs, not model answers.
    const a = data.replayByRef.get("08-30:61")!.evidence;
    const b = data.replayByRef.get("08-31:233")!.evidence;
    const c = data.replayByRef.get("08-31:553")!.evidence;
    const edges = new Set([verifiedStoryRelationPairKey(a.feedItemId, b.feedItemId),
      verifiedStoryRelationPairKey(b.feedItemId, c.feedItemId)]);
    expect(belongsToVerifiedStoryCluster(c, [b], STORY_RANKING_POLICY_V1, edges)).toBe(true);
    expect(belongsToVerifiedStoryCluster(c, [a, b], STORY_RANKING_POLICY_V1, edges)).toBe(false);
    const p = prepared[0]!;
    const selection = p.clusterer.cluster({ ...p.clusterParams, items: [a, b, c], verifiedStoryRelationPairs: edges });
    expect(together(selection, a.feedItemId, c.feedItemId)).toBe(false);
  });
  it("preserves same-provider duplicate controls as separate product posts", () => {
    const p = prepared.find((b) => b.block.id === "anybridge")!;
    expect(p.candidates).toHaveLength(0);
    expect(applyDecisions(p).relationSelection.clusters).toHaveLength(2);
  });
  it("validates receipt schema and full request, fixture and output identity", () => {
    const validator = new Ajv().compile(readJson<object>("scripts/evals/reader-story-grouping/receipt.schema.json"));
    const receipt = fixtureReceipt(); expect(validator(receipt)).toBe(true);
    expect(() => checkReceiptBinding(manifest, receipt)).not.toThrow();
    receipt.responses[0]!.evidenceSha256 = "b".repeat(64);
    expect(() => checkReceiptBinding(manifest, receipt)).toThrow("evidenceSha256 mismatch");
    expect(() => verifyManifest(data, manifest, { ...manifest, replaySha256: "b".repeat(64) })).toThrow("manifest mismatch");
  });
  it.each(["request", "output", "duplicate", "profile"])("rejects captured %s mismatch", async (kind) => {
    const receipt = fixtureReceipt(); const row = receipt.responses[0]!;
    if (kind === "request") row.result = { ...row.result, executionAttestation: { ...row.result.executionAttestation!, canonicalRequestSha256: "b".repeat(64) } };
    if (kind === "output") row.result = { ...row.result, structuredOutput: { decisions: [] } };
    if (kind === "duplicate") receipt.responses[1] = row;
    if (kind === "profile") {
      const result = { ...row.result, executionAttestation: { ...row.result.executionAttestation!, model: "gpt-6-astra" } };
      await expect(normalizeCapturedResponse(prepared[0]!, envelopes[0]!, result)).rejects.toThrow("attestation is invalid");
    } else expect(() => checkReceiptBinding(manifest, receipt)).toThrow();
  });
  it.each(["capture", "revision", "tree"])("rejects receipt %s identity drift independently of the envelope hashes", (kind) => {
    const receipt = fixtureReceipt();
    if (kind === "capture") receipt.captureSourceRevision = "a".repeat(40);
    else receipt.evaluatedSource = { ...receipt.evaluatedSource,
      [kind === "revision" ? "revision" : "treeSha"]: "a".repeat(40) };
    expect(() => checkReceiptBinding(manifest, receipt)).toThrow("Receipt source/fixture mismatch");
  });
  it("rejects legacy schemas instead of relabelling old captures as current", () => {
    const legacy = { ...manifest, schemaVersion: 1 } as unknown as RequestManifest;
    expect(() => verifyManifest(data, legacy, manifest)).toThrow("materialize fresh requests");
    const validator = new Ajv().compile(readJson<object>("scripts/evals/reader-story-grouping/receipt.schema.json"));
    expect(validator({ ...fixtureReceipt(), schemaVersion: 1 })).toBe(false);
  });
  it("leaves model metrics unevaluated offline and excludes ambiguous cases", async () => {
    const p = prepared.find((b) => b.block.id === "session-url")!;
    const rows = await caseRows(data, p, applyDecisions(p));
    const m = confusion(rows, (r) => r.model, (r) => r.semanticRelation === "same_story");
    expect(m.evaluated).toBe(0); expect(m.ambiguous).toBe(2);
    expect(m.precision.value).toBeNull(); expect(m.recall.denominator).toBe(0);
  });
});
