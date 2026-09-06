import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withTestExecutionAttestation } from
  "@social-monitor/summary/adapters/model/reader-summary-execution-attestation.spec-support";
import type { AgentRuntimeTaskCommand } from "@social-monitor/summary/ports";
import { canonicalJsonSha256 } from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import { loadDataset } from "./dataset";
import { prepareBlock } from "./replay";
import { captureRequest, canonicalRequestFor, makeManifest, type RequestEnvelope, type CaptureReceipt } from "./requests";
import { evaluationRun, runRoot } from "./run-identity";
import { runLiveWithTrustedClient } from "./live";
import { run } from "./run";
import { assertSource, verifySourceUnchanged } from "./source-identity";

jest.mock("./source-identity", () => ({ assertSource: jest.fn(), verifySourceUnchanged: jest.fn() }));
const source = { revision: "b".repeat(40), treeSha: "c".repeat(40), worktree: "clean" as const };

it.each(["missing", "null", "wrongtype", "unknown", "confidence", "id"])(
  "live/import reject %s identically, preserve failed bytes and claim, and never retry/report",
  async (kind) => {
    jest.mocked(assertSource).mockReturnValue(source);
    jest.mocked(verifySourceUnchanged).mockReturnValue(undefined);
    const execution = evaluationRun(`schema-contract-test-${kind}`, source)!;
    const root = runRoot(execution);
    const dir = mkdtempSync(join(tmpdir(), "rsg-response-contract-test-"));
    const data = loadDataset(); const requests: RequestEnvelope[] = [];
    for (const block of data.blocks) {
      const envelope = await captureRequest(await prepareBlock(data, block, execution));
      if (envelope) requests.push(envelope);
    }
    const manifest = makeManifest(data, requests, source, execution);
    const resultFor = (command: AgentRuntimeTaskCommand) => {
      const pairs = (JSON.parse(command.prompt) as {
        pairs: { leftFeedItemId: string; rightFeedItemId: string }[];
      }).pairs;
      const decisions = pairs.map((pair) => {
        const decision: Record<string, unknown> = {
          leftFeedItemId: pair.leftFeedItemId, rightFeedItemId: pair.rightFeedItemId,
          sameStory: false, confidenceScore: 0.5, rationale: "Uncertain TEST fixture.",
        };
        if (kind === "missing") delete decision.rationale;
        if (kind === "null") decision.rationale = null;
        if (kind === "wrongtype") decision.rationale = 123;
        if (kind === "unknown") decision.extra = "never-log-this-payload";
        if (kind === "confidence") decision.confidenceScore = 2;
        if (kind === "id") decision.leftFeedItemId = 123;
        return decision;
      });
      const result = withTestExecutionAttestation(command, {
        status: "completed", warnings: [], structuredOutput: { decisions },
        outputText: JSON.stringify({ decisions }),
      });
      return { ...result, executionAttestation: { ...result.executionAttestation!,
        canonicalRequestSha256: canonicalJsonSha256(canonicalRequestFor(command)),
      } };
    };
    const firstResult = resultFor(requests[0]!.command);
    const originalBytes = JSON.stringify(firstResult);
    const client = {
      checkHealth: jest.fn().mockResolvedValue({ status: "serving", runtimeEngine: "subscription-runtime-cli",
        launcherSha256: firstResult.executionAttestation!.launcherSha256,
        runtimeVersion: firstResult.executionAttestation!.runtimePackageVersion }),
      runTask: jest.fn().mockResolvedValue(firstResult),
    };
    try {
      // Only source identity is mocked; actual manifests, schemas, adapter and IO run locally.
      mkdirSync(join(root, "offline"), { recursive: true });
      const manifestPath = join(root, "offline", "requests.json");
      writeFileSync(manifestPath, JSON.stringify(manifest));
      const liveOut = join(dir, "live");
      const trusted = { client, operatorRecord: "TEST only; no transport", close: jest.fn() };
      const liveError = await runLiveWithTrustedClient(manifestPath, liveOut, trusted, execution.id)
        .catch((error: unknown) => error);
      expect(liveError).toMatchObject({ failure: { kind: "invalid_schema", retryable: false } });
      const saved = JSON.parse(readFileSync(join(liveOut, `response-${requests[0]!.blockId}.json`), "utf8"));
      expect(JSON.stringify(saved.result)).toBe(originalBytes);
      expect(JSON.stringify(firstResult)).toBe(originalBytes);
      expect(existsSync(join(liveOut, "receipt.json"))).toBe(false);
      expect(existsSync(join(liveOut, "results.json"))).toBe(false);
      expect(existsSync(join(root, "live-started.json"))).toBe(true);
      await expect(runLiveWithTrustedClient(manifestPath, join(dir, "retry"), trusted, execution.id)).rejects.toThrow();
      expect(client.runTask).toHaveBeenCalledTimes(1);
      expect(client.checkHealth).toHaveBeenCalledTimes(1);

      const receipt: CaptureReceipt = {
        schemaVersion: 2, captureKind: "offline_fixture", evaluationRun: execution,
        captureSourceRevision: manifest.captureSourceRevision, evaluatedSource: source,
        manifestSha256: canonicalJsonSha256(manifest), labelSealSha256: manifest.labelSealSha256,
        replaySha256: manifest.replaySha256,
        transport: { authentication: "deterministic_fixture", operatorRecord: "TEST only",
          runtimePackageVersion: firstResult.executionAttestation!.runtimePackageVersion,
          launcherSha256: firstResult.executionAttestation!.launcherSha256 },
        responses: requests.map((e) => ({ blockId: e.blockId, commandSha256: e.commandSha256,
          canonicalRequestSha256: e.canonicalRequestSha256, schemaSha256: e.schemaSha256,
          evidenceSha256: e.evidenceSha256, receivedAt: "2026-09-06T00:00:00Z", result: resultFor(e.command) })),
      };
      const receiptPath = join(dir, "invalid-receipt.json");
      const receiptBytes = JSON.stringify(receipt);
      writeFileSync(receiptPath, receiptBytes);
      const importOut = join(dir, "import");
      const importError = await run(["import", importOut, receiptPath, "--run-id", execution.id])
        .catch((error: unknown) => error);
      expect(importError).toMatchObject({ message: (liveError as Error).message });
      expect((importError as Error).message).toContain(".decisions[0]");
      expect((importError as Error).message).not.toContain("never-log-this-payload");
      expect(existsSync(importOut)).toBe(false);
      expect(readFileSync(receiptPath, "utf8")).toBe(receiptBytes);
      expect(client.runTask).toHaveBeenCalledTimes(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(root, { recursive: true, force: true });
    }
  },
);
