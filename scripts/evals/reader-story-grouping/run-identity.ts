import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { canonicalJsonSha256 } from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import { check, RESULTS } from "./dataset";
import type { EvaluatedSource } from "./source-identity";

/** Operator execution label, never an observation timestamp or a runtime budget reset. */
export type EvaluationRun = { id: string; namespaceSha256: string };
export const evaluationRun = (id: string | undefined, source: EvaluatedSource): EvaluationRun | undefined => {
  if (id === undefined) return undefined;
  check(/^[a-z0-9][a-z0-9_-]{0,63}$/.test(id), "Run id must be 1-64 lowercase letters, digits, underscores or hyphens");
  return { id, namespaceSha256: canonicalJsonSha256({ kind: "reader-story-grouping-evaluation-run-v1", id, source }) };
};
/** Fixed length keeps BOTH native IDs below the adapter's 240-character cap, including the original clock. */
export const fixtureInterestId = (blockId: string, run?: EvaluationRun): string => run
  ? `fixture-grouping-${canonicalJsonSha256({ runNamespaceSha256: run.namespaceSha256, blockId })}`
  : `fixture-grouping-${blockId}`;
export const runArguments = (args: string[]): { positional: string[]; id?: string } => {
  const index = args.indexOf("--run-id");
  if (index === -1) {
    check(!args.some((arg) => arg.startsWith("--")), "Unknown evaluation option");
    return { positional: args };
  }
  check(index === args.length - 2 && args[index + 1], "Supply --run-id ID once, after positional arguments");
  const positional = args.slice(0, index);
  check(!positional.some((arg) => arg.startsWith("--")), "Unknown/duplicate evaluation option");
  return { positional, id: args[index + 1] };
};
export const runRoot = (run?: EvaluationRun): string => run
  ? join(RESULTS, "runs", run.namespaceSha256) : RESULTS;

/** Exclusive durable claim independent of output directory. Never remove on failure. */
export const claimLiveRun = (run: EvaluationRun, manifestSha256: string, out: string): void => {
  const root = runRoot(run);
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, "live-started.json"), JSON.stringify({ evaluationRun: run, manifestSha256,
    outputDirectory: resolve(out) }, null, 2) + "\n", { flag: "wx" });
};
