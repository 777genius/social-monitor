import { createHash } from "node:crypto";

import type { SourceRuntimeConfig } from "@social-monitor/ingestion/ports";

export const recoverySchema = "hn-rss-acquisition.v1";
export type RecoveryProvider = "hacker-news" | "rss";
export type RecoveryRequest = Readonly<{
  tenantId: string;
  workspaceId: string;
  sourceBindingId: string;
  providerKey: RecoveryProvider;
  from: string;
  to: string;
  journalDir: string;
  apply: boolean;
  planSha256?: string;
}>;

// The real CLI uses one durable authority for every plan digest. Operators must
// provision this directory as owned, private, canonical and persistent storage.
// Disposable journal directories are accepted only by parseRecoveryArgs, which
// is used by the synthetic test harness.
export const recoveryCliJournalDir = "/var/lib/social-monitor/hn-rss-recovery-journal";

export function parseRecoveryCliArgs(args: readonly string[], now: Date): RecoveryRequest {
  if (args.includes("--journal-dir")) throw new Error("--journal-dir is not accepted by the recovery CLI");
  return parseRecoveryArgs([...args, "--journal-dir", recoveryCliJournalDir], now);
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function canonicalRecoveryUuid(value: string): string {
  if (!uuid.test(value)) throw new Error("Recovery scope requires UUIDs");
  return value.toLowerCase();
}

export function canonicalRecoveryRequest(request: RecoveryRequest): RecoveryRequest {
  return {
    ...request,
    tenantId: canonicalRecoveryUuid(request.tenantId),
    workspaceId: canonicalRecoveryUuid(request.workspaceId),
    sourceBindingId: canonicalRecoveryUuid(request.sourceBindingId),
  };
}
const instant = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/;
const maxWindowMs = 24 * 60 * 60 * 1000;

export function parseRecoveryArgs(args: readonly string[], now: Date): RecoveryRequest {
  const allowed = new Set(["--tenant-id", "--workspace-id", "--source-binding-id", "--provider", "--from", "--to", "--journal-dir", "--plan-sha256"]);
  const values = new Map<string, string>();
  let apply = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--apply") {
      if (apply) throw new Error("Duplicate --apply");
      apply = true;
      continue;
    }
    if (arg === undefined || !allowed.has(arg) || values.has(arg)) throw new Error("Unknown or duplicate recovery option");
    const value = args[++index];
    if (value === undefined || value.length === 0 || value.startsWith("--")) throw new Error(`Missing ${arg}`);
    values.set(arg, value);
  }
  const required = (name: string): string => {
    const value = values.get(name);
    if (value === undefined) throw new Error(`Missing ${name}`);
    return value;
  };
  const tenantId = canonicalRecoveryUuid(required("--tenant-id"));
  const workspaceId = canonicalRecoveryUuid(required("--workspace-id"));
  const sourceBindingId = canonicalRecoveryUuid(required("--source-binding-id"));
  const provider = required("--provider");
  if (provider !== "hacker-news" && provider !== "rss") throw new Error("Recovery provider is not allowed");
  const from = required("--from");
  const to = required("--to");
  if (![from, to].every((value) => instant.test(value) && Number.isFinite(Date.parse(value)))) throw new Error("Recovery interval requires explicit UTC instants");
  const start = Date.parse(from);
  const end = Date.parse(to);
  if (start >= end || end > now.getTime() || end - start > maxWindowMs) throw new Error("Recovery interval must be closed, past, ordered and at most 24 hours");
  const planSha256 = values.get("--plan-sha256");
  if (planSha256 !== undefined && !/^[a-f0-9]{64}$/.test(planSha256)) throw new Error("Invalid plan digest");
  if (apply && planSha256 === undefined) throw new Error("--apply requires --plan-sha256");
  return { tenantId, workspaceId, sourceBindingId, providerKey: provider, from: new Date(start).toISOString(), to: new Date(end).toISOString(), journalDir: required("--journal-dir"), apply, ...(planSha256 === undefined ? {} : { planSha256 }) };
}

const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

export const sha256 = (value: unknown): string => createHash("sha256").update(canonical(value)).digest("hex");

export function recoveryPlan(request: RecoveryRequest, binding: {
  readonly interestId: string;
  readonly scanPolicyId: string;
  readonly interestQuery: string;
  readonly config: SourceRuntimeConfig;
}): Readonly<{
  schema: string;
  tenantId: string;
  workspaceId: string;
  sourceBindingId: string;
  providerKey: RecoveryProvider;
  from: string;
  to: string;
  interestId: string;
  scanPolicyId: string;
  configSha256: string;
  interestQuerySha256: string;
}> {
  const scope = canonicalRecoveryRequest(request);
  return {
    schema: recoverySchema,
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    sourceBindingId: scope.sourceBindingId,
    providerKey: request.providerKey,
    from: request.from,
    to: request.to,
    interestId: binding.interestId,
    scanPolicyId: binding.scanPolicyId,
    configSha256: sha256(binding.config),
    interestQuerySha256: sha256(binding.interestQuery),
  };
}
