import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJsonSha256 } from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import { readJson } from "./dataset";
import type { CaptureReceipt, RequestManifest } from "./requests";
import { run } from "./run";
import { evaluationRun, runArguments, runRoot } from "./run-identity";
import { assertSource } from "./source-identity";

/** Mechanical all-false responses test transport/replay only. Never a semantic classifier or live receipt. */
export const regression = async (args: string[] = []): Promise<void> => {
  // Always rematerialize; never reuse an old capture's request manifest.
  const { id } = runArguments(args);
  const execution = evaluationRun(id, assertSource());
  const root = runRoot(execution); const flags = id ? ["--run-id", id] : [];
  await run(["offline", join(root, "offline"), ...flags]);
  const manifest = readJson<RequestManifest>(join(root, "offline", "requests.json"));
  const dir = join(root, "captured-regression"); mkdirSync(dir, { recursive: true });
  const receipt: CaptureReceipt = {
    ...(execution ? { evaluationRun: execution } : {}),
    schemaVersion: 2, captureKind: "offline_fixture", captureSourceRevision: manifest.captureSourceRevision,
    evaluatedSource: manifest.evaluatedSource,
    manifestSha256: canonicalJsonSha256(manifest), labelSealSha256: manifest.labelSealSha256,
    replaySha256: manifest.replaySha256,
    transport: { authentication: "deterministic_fixture", operatorRecord: "Mechanical all-false regression; no model invocation",
      runtimePackageVersion: "0.0.0-fixture", launcherSha256: "a".repeat(64) },
    responses: manifest.requests.map((e) => {
      const prompt = JSON.parse(e.command.prompt) as { pairs: { leftFeedItemId: string; rightFeedItemId: string }[] };
      const structuredOutput = { decisions: prompt.pairs.map((p) => ({
        leftFeedItemId: p.leftFeedItemId, rightFeedItemId: p.rightFeedItemId,
        sameStory: false, confidenceScore: 1, rationale: "OFFLINE FIXTURE: constant false; no semantic judgment.",
      })) };
      return { blockId: e.blockId, commandSha256: e.commandSha256, canonicalRequestSha256: e.canonicalRequestSha256,
        schemaSha256: e.schemaSha256, evidenceSha256: e.evidenceSha256, receivedAt: new Date().toISOString(),
        result: { status: "completed", structuredOutput, warnings: [], executionAttestation: {
          schemaVersion: 1, requestId: e.command.requestId, purpose: e.command.purpose,
          canonicalRequestSha256: e.canonicalRequestSha256, provider: "codex", model: "gpt-5.6-sol",
          reasoningEffort: "high", runtimeEngine: "subscription-runtime-cli", runtimePackageVersion: "0.0.0-fixture",
          launcherSha256: "a".repeat(64), selectedOutputKind: "structured_output",
          selectedOutputSha256: canonicalJsonSha256(structuredOutput),
        } },
      };
    }),
  };
  const path = join(dir, "receipt.json"); writeFileSync(path, JSON.stringify(receipt, null, 2) + "\n");
  await run(["import", dir, path, ...flags]);
};
if (require.main === module) void regression(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error); process.exitCode = 1;
});
