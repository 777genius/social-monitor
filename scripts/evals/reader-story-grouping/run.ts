import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import Ajv from "ajv";
import { canonicalJsonSha256 } from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import { loadDataset, readJson, check, fileSha } from "./dataset";
import { assertSource, verifySourceUnchanged } from "./source-identity";
import { prepareBlock, applyDecisions, caseRows, type CaseRow } from "./replay";
import { captureRequest, makeManifest, verifyManifest, checkReceiptBinding, normalizeCapturedResponse,
  type RequestManifest, type CaptureReceipt, type RequestEnvelope } from "./requests";
import { evaluationRun, runArguments, runRoot } from "./run-identity";
import { writeReport } from "./report";

export const run = async (args: string[]): Promise<void> => {
  const { positional, id } = runArguments(args);
  const source = assertSource(); const execution = evaluationRun(id, source);
  const [mode = "offline", out = join(runRoot(execution), "offline"), receiptPath, trustedReceiptSha] = positional;
  check(positional.length <= 4, "Too many evaluation arguments");
  check(["offline", "import"].includes(mode), "Usage: run.ts offline OUT | import OUT RECEIPT [INDEPENDENT_TRUSTED_RECEIPT_FILE_SHA256]");
  if (execution) check(!existsSync(join(out, "results.json")), "Explicit run output already exists; preserve it and choose a new run/output");
  const data = loadDataset();
  const prepared = await Promise.all(data.blocks.map((b) => prepareBlock(data, b, execution)));
  const requests = (await Promise.all(prepared.map(captureRequest))).filter((r): r is RequestEnvelope => r !== undefined);
  const manifest = makeManifest(data, requests, source, execution);
  const manifestValidator = new Ajv().compile(readJson<object>("scripts/evals/reader-story-grouping/request-manifest.schema.json"));
  check(manifestValidator(manifest), `Invalid request manifest: ${JSON.stringify(manifestValidator.errors)}`);
  let receipt: CaptureReceipt | undefined;
  let reportMode = "OFFLINE_DETERMINISTIC_NO_VERIFIER";
  if (mode === "import") {
    check(receiptPath, "Receipt path is required");
    receipt = readJson<CaptureReceipt>(receiptPath!);
    // Materialized manifest is delivered alongside receipts. Never accept a self-defined request.
    const frozen = readJson<RequestManifest>(join(runRoot(execution), "offline", "requests.json"));
    verifyManifest(data, frozen, manifest);
    const schema = readJson<object>("scripts/evals/reader-story-grouping/receipt.schema.json");
    const validator = new Ajv({ allErrors: true }).compile(schema);
    check(validator(receipt), `Invalid receipt schema: ${JSON.stringify(validator.errors)}`);
    checkReceiptBinding(manifest, receipt);
    if (receipt.captureKind === "live_subscription") {
      check(trustedReceiptSha && fileSha(receiptPath!) === trustedReceiptSha,
        "Live import requires independently supplied trusted receipt file SHA256; a self-asserted live flag is insufficient");
      check(execution, "Live import requires explicit --run-id matching offline preparation");
      reportMode = "LIVE_IMPORTED";
    } else reportMode = "OFFLINE_CAPTURED_REGRESSION";
  }
  const rows: CaseRow[] = []; const clusters = [];
  for (const p of prepared) {
    const envelope = requests.find((r) => r.blockId === p.block.id);
    const response = receipt?.responses.find((r) => r.blockId === p.block.id);
    let decisions: readonly unknown[] | undefined;
    if (response && envelope) {
      const validator = new Ajv({ allErrors: true }).compile(envelope.command.outputSchema);
      check(validator(response.result.structuredOutput), `Invalid production output schema ${p.block.id}`);
      decisions = await normalizeCapturedResponse(p, envelope, response.result);
    }
    const outcome = applyDecisions(p, decisions);
    check(decisions === undefined || outcome.batch?.responseAccepted, `Rejected decision reconciliation ${p.block.id}`);
    rows.push(...await caseRows(data, p, outcome));
    const reverse = p.clusterer.cluster({ ...p.clusterParams, items: [...p.evidence].reverse(),
      verifiedStoryRelationPairs: outcome.batch?.approvedPairs,
      verifiedStrictTitleRelationPairs: new Set(p.strict.filter((c) => outcome.batch?.approvedPairs.has(
        [c.leftFeedItemId, c.rightFeedItemId].sort().join("\u0000"))).map((c) => [c.leftFeedItemId, c.rightFeedItemId].sort().join("\u0000"))),
    });
    clusters.push({ blockId: p.block.id, inputRefs: p.block.postRefs, candidateCount: p.candidates.length,
      initial: p.initial.clusters, afterRelations: outcome.relationSelection.clusters,
      reversedInputAfterRelations: reverse.clusters,
      graduatedRelations: outcome.graduatedRelations, publication: outcome.final.clusters,
      labelledNegativeOvermerges: rows.filter((r) => r.blockId === p.block.id && r.scored &&
        r.semanticRelation !== "same_story" && r.relationTogether).map((r) => r.id) });
  }
  // Write only after complete response validation, so failed imports cannot leave a "live" report.
  verifySourceUnchanged(source);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "requests.json"), JSON.stringify(manifest, null, 2) + "\n");
  writeFileSync(join(out, "request-manifest.sha256"), canonicalJsonSha256(manifest) + "\n");
  writeReport(out, data, rows, reportMode, manifest, clusters);
  console.log(JSON.stringify({ mode: reportMode, cases: rows.length, requests: requests.length,
    shortlistedPairs: requests.reduce((n, r) => n + r.candidateCount, 0), out,
    manifestSha256: canonicalJsonSha256(manifest) }));
};
if (require.main === module) void run(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error); process.exitCode = 1;
});
