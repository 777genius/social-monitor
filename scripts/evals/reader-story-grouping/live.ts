import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { canonicalJsonSha256 } from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import type { AgentRuntimeClientPort } from "@social-monitor/summary/ports";
import { assertSource, check, fileSha, loadDataset, readJson } from "./dataset";
import { prepareBlock, applyDecisions } from "./replay";
import { captureRequest, makeManifest, verifyManifest, normalizeCapturedResponse,
  checkReceiptBinding, type RequestManifest, type RequestEnvelope, type CaptureReceipt } from "./requests";

/** Parent supplies an already authenticated, disposable-scope client. No auth loading or provisioning here. */
export type TrustedComposition = {
  client: AgentRuntimeClientPort;
  operatorRecord: string;
  close: () => void | Promise<void>;
};
export const runLiveWithTrustedClient = async (manifestPath: string, out: string,
  trusted: TrustedComposition): Promise<string> => {
  assertSource();
  const data = loadDataset(); const frozen = readJson<RequestManifest>(manifestPath);
  const prepared = await Promise.all(data.blocks.map((b) => prepareBlock(data, b)));
  const requests = (await Promise.all(prepared.map(captureRequest))).filter((r): r is RequestEnvelope => r !== undefined);
  verifyManifest(data, frozen, makeManifest(data, requests));
  check(!existsSync(out), "Live output directory already exists; no automatic rerun/resume");
  check(trusted.operatorRecord.trim().length > 0, "Missing operator transport provenance");
  mkdirSync(out, { recursive: true });
  // One bounded read-only health RPC, no launch/provision/smoke and no real tenant.
  const health = await trusted.client.checkHealth("reader-story-grouping-eval");
  check(health.status === "serving" && health.runtimeEngine === "subscription-runtime-cli" &&
    health.launcherSha256, "Existing trusted subscription runtime has no serving attested identity");
  const receipt: CaptureReceipt = {
    schemaVersion: 1, captureKind: "live_subscription", manifestSha256: canonicalJsonSha256(frozen),
    sourceRevision: frozen.sourceRevision, labelSealSha256: frozen.labelSealSha256, replaySha256: frozen.replaySha256,
    transport: { authentication: "existing_authenticated_composition", operatorRecord: trusted.operatorRecord,
      runtimePackageVersion: health.runtimeVersion, launcherSha256: health.launcherSha256! }, responses: [],
  };
  for (const envelope of requests) {
    // This marker makes interrupted attempts visible; the harness never retries this RPC.
    writeFileSync(join(out, `started-${envelope.blockId}.json`), JSON.stringify({
      requestId: envelope.command.requestId, commandSha256: envelope.commandSha256,
      startedAt: new Date().toISOString(),
    }, null, 2) + "\n", { flag: "wx" });
    const result = await trusted.client.runTask(envelope.command);
    const row = { blockId: envelope.blockId, commandSha256: envelope.commandSha256,
      canonicalRequestSha256: envelope.canonicalRequestSha256, schemaSha256: envelope.schemaSha256,
      evidenceSha256: envelope.evidenceSha256, receivedAt: new Date().toISOString(), result };
    writeFileSync(join(out, `response-${envelope.blockId}.json`), JSON.stringify(row, null, 2) + "\n", { flag: "wx" });
    receipt.responses.push(row);
    const p = prepared.find((b) => b.block.id === envelope.blockId)!;
    const decisions = await normalizeCapturedResponse(p, envelope, result);
    check(applyDecisions(p, decisions).batch?.responseAccepted, "Live decision batch failed closed; raw receipt preserved");
  }
  checkReceiptBinding(frozen, receipt);
  const path = join(out, "receipt.json");
  writeFileSync(path, JSON.stringify(receipt, null, 2) + "\n", { flag: "wx" });
  return path;
};
const main = async (): Promise<void> => {
  const [manifestPath, out] = process.argv.slice(2);
  const modulePath = process.env.RSG_TRUSTED_CLIENT_MODULE;
  check(manifestPath && out && modulePath,
    "Parent only: RSG_TRUSTED_CLIENT_MODULE=<reviewed existing composition shim> live.ts MANIFEST NEW_OUTPUT_DIR");
  // Explicit operator-owned module; the worker never supplies transport credentials.
  const shim = await import(resolve(modulePath!)) as { createTrustedComposition: () => Promise<TrustedComposition> };
  const trusted = await shim.createTrustedComposition();
  try {
    const path = await runLiveWithTrustedClient(manifestPath!, out!, trusted);
    console.log(JSON.stringify({ receipt: path, sha256: fileSha(path) }));
  } finally { await trusted.close(); }
};
if (require.main === module) void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error); process.exitCode = 1;
});
