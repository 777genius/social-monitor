import { lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import type { IdGenerator } from "@social-monitor/shared-kernel";
import { refreshBytesHash, refreshDates, refreshHash, refreshKeyPrefix, refreshScope } from
  "./reader-summary-new-input-refresh-manifest";

/** Operator-reviewed statement that one consumed new-input-refresh attempt is
 * accounted for. It asserts consumption, never success: the original job row is
 * never written to. Provider usage is preserved when the reviewed provider
 * response reports it, and otherwise stays explicitly unknown. */
type RefreshReconciliationIdentity = Readonly<{
  format: "reader-summary-new-input-refresh-reconciliation-v1";
  tenantId: string; workspaceId: string; date: string;
  jobId: string; operation: string; manifestSha256: string;
}>;

export type RefreshProviderReconciliationEvidence = RefreshReconciliationIdentity & Readonly<{
  reason: "consumed_provider_invocation_without_summary";
  invocation: Readonly<{
    requestId: string; purpose: string; requestSha256: string;
    attemptSha256: string; consumedAt: string; returnedAt: string;
    outcome: string; providerUsageReported: boolean;
    usage?: Readonly<{ inputTokens: number; outputTokens: number; totalTokens: number }>;
  }>;
}>;

/** Reviewed whole-job capture and journal digests attest zero delegation, not
 * merely failure of one batch. Attempts identify every started failed request.
 * No provider result or consumption timestamp is asserted by this variant. */
export type RefreshPreProviderReconciliationEvidence = RefreshReconciliationIdentity & Readonly<{
  reason: "consumed_job_without_provider_invocation";
  invocation: Readonly<{
    capturePath: string; journalPath: string; manifestPath: string;
    captureSha256: string; journalSha256: string;
    invocationConsumedCount: 0; delegatedInvocationCount: 0;
    providerUsageReported: false;
    attempts: readonly Readonly<{
      requestId: string; purpose: string; requestSha256: string; attemptSha256: string;
      startedAt: string; failedAt: string; outcome: "invocation_failed"; delegated: false;
    }>[];
  }>;
}>;
export type RefreshReconciliationEvidence =
  RefreshProviderReconciliationEvidence | RefreshPreProviderReconciliationEvidence;

export const refreshReconciliationAccounting = Object.freeze({
  summaryGenerations: 0, publications: 0, artifacts: 0,
  providerInvocations: 1, providerUsage: "unknown" as const,
});
export const refreshReconciliationAccountingFor = (evidence: RefreshReconciliationEvidence) =>
  evidence.reason === "consumed_job_without_provider_invocation"
    ? Object.freeze({ summaryGenerations: 0, publications: 0, artifacts: 0,
      providerInvocations: 0, providerUsage: "none" as const })
    : evidence.invocation.providerUsageReported
    ? Object.freeze({ ...refreshReconciliationAccounting, providerUsage: "reported" as const,
      usage: evidence.invocation.usage! })
    : refreshReconciliationAccounting;

const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u;
const sha256 = /^[0-9a-f]{64}$/u;
const isoInstant = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
};

export function assertRefreshReconciliationEvidence(
  evidence: RefreshReconciliationEvidence, dates: readonly string[],
): void {
  if (evidence?.format !== "reader-summary-new-input-refresh-reconciliation-v1" ||
      evidence.tenantId !== refreshScope.tenantId ||
      evidence.workspaceId !== refreshScope.workspaceId ||
      typeof evidence.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(evidence.date) ||
      !isoInstant(`${evidence.date}T00:00:00.000Z`) ||
      !dates.includes(evidence.date) || !uuid.test(evidence.jobId) ||
      typeof evidence.operation !== "string" ||
      !evidence.operation.startsWith(refreshKeyPrefix(evidence.date)) ||
      !sha256.test(evidence.operation.slice(refreshKeyPrefix(evidence.date).length)) ||
      !sha256.test(evidence.manifestSha256) ||
      (evidence.reason !== "consumed_provider_invocation_without_summary" &&
        evidence.reason !== "consumed_job_without_provider_invocation")) {
    throw new Error("Refresh reconciliation evidence identity is invalid");
  }
  if (evidence.reason === "consumed_job_without_provider_invocation") {
    if (!onlyKeys(evidence, ["format", "tenantId", "workspaceId", "date", "jobId", "operation",
      "manifestSha256", "reason", "invocation"])) {
      throw new Error("Refresh reconciliation pre-provider identity is invalid");
    }
    assertPreProviderInvocation(evidence.invocation);
    assertPreProviderArtifacts(evidence);
    return;
  }
  const invocation = evidence.invocation;
  if (typeof invocation !== "object" || invocation === null ||
      !onlyKeys(invocation, ["requestId", "purpose", "requestSha256", "attemptSha256",
        "consumedAt", "returnedAt", "outcome", "providerUsageReported", "usage"]) ||
      typeof invocation.requestId !== "string" || invocation.requestId.trim().length === 0 ||
      typeof invocation.purpose !== "string" || invocation.purpose.trim().length === 0 ||
      !sha256.test(invocation.requestSha256) || !sha256.test(invocation.attemptSha256) ||
      !isoInstant(invocation.consumedAt) || !isoInstant(invocation.returnedAt) ||
      Date.parse(invocation.returnedAt) < Date.parse(invocation.consumedAt) ||
      typeof invocation.outcome !== "string" || invocation.outcome.trim().length === 0 ||
      typeof invocation.providerUsageReported !== "boolean" ||
      (invocation.providerUsageReported
        ? (typeof invocation.usage !== "object" || invocation.usage === null) || ![invocation.usage.inputTokens, invocation.usage.outputTokens,
          invocation.usage.totalTokens].every((count) => Number.isSafeInteger(count) && count >= 0) ||
          invocation.usage.totalTokens !== invocation.usage.inputTokens + invocation.usage.outputTokens
        : invocation.usage !== undefined)) {
    throw new Error("Refresh reconciliation invocation identity is invalid");
  }
}

const onlyKeys = (value: object, keys: readonly string[]) =>
  !Array.isArray(value) && Object.keys(value).every((key) => keys.includes(key));
const nonempty = (value: unknown) => typeof value === "string" && value.trim().length > 0;
function assertPreProviderInvocation(value: RefreshPreProviderReconciliationEvidence["invocation"]): void {
  if (typeof value !== "object" || value === null ||
      !onlyKeys(value, ["capturePath", "journalPath", "manifestPath", "captureSha256", "journalSha256", "invocationConsumedCount",
        "delegatedInvocationCount", "providerUsageReported", "attempts"]) ||
      ![value.capturePath, value.journalPath, value.manifestPath].every((path) =>
        typeof path === "string" && path.startsWith("/")) ||
      !sha256.test(value.captureSha256) || !sha256.test(value.journalSha256) ||
      value.invocationConsumedCount !== 0 || value.delegatedInvocationCount !== 0 ||
      value.providerUsageReported !== false || !Array.isArray(value.attempts) ||
      value.attempts.length === 0) {
    throw new Error("Refresh reconciliation pre-provider identity is invalid");
  }
  const requests = new Set<string>();
  for (const attempt of value.attempts) {
    if (typeof attempt !== "object" || attempt === null ||
        !onlyKeys(attempt, ["requestId", "purpose", "requestSha256", "attemptSha256",
          "startedAt", "failedAt", "outcome", "delegated"]) ||
        !nonempty(attempt.requestId) || !nonempty(attempt.purpose) || requests.has(attempt.requestId) ||
        !sha256.test(attempt.requestSha256) || !sha256.test(attempt.attemptSha256) ||
        !isoInstant(attempt.startedAt) || !isoInstant(attempt.failedAt) ||
        Date.parse(attempt.failedAt) < Date.parse(attempt.startedAt) ||
        attempt.outcome !== "invocation_failed" || attempt.delegated !== false) {
      throw new Error("Refresh reconciliation pre-provider attempt identity is invalid");
    }
    requests.add(attempt.requestId);
  }
}
// These are immutable reviewed copies, never live runtime paths. Hash the full
// capture inventory and journal, then derive every zero-delegation claim from
// their contents. An incomplete workflow is allowed; an incomplete tape is not.
function assertPreProviderArtifacts(e: RefreshPreProviderReconciliationEvidence): void {
  const invalid = (): never => { throw new Error("Refresh reconciliation pre-provider capture/journal integrity is invalid"); };
  const object = (value: unknown): Record<string, unknown> => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return invalid();
    return value as Record<string, unknown>;
  };
  const array = (value: unknown): unknown[] => Array.isArray(value) ? value : invalid();
  const immutable = (path: string, hash?: string): Buffer => {
    const absolute = resolve(path), stat = lstatSync(absolute);
    if (realpathSync(absolute) !== absolute || !stat.isFile() || stat.nlink !== 1 ||
        (stat.mode & 0o222) !== 0) return invalid();
    const bytes = readFileSync(absolute);
    if (hash !== undefined && refreshBytesHash(bytes) !== hash) return invalid();
    return bytes;
  };
  const parse = (bytes: Buffer) => object(JSON.parse(bytes.toString("utf8")));
  const lines = (bytes: Buffer) => {
    const text = bytes.toString("utf8");
    if (!text.endsWith("\n")) return invalid();
    return text.slice(0, -1).split("\n").map((line) => object(JSON.parse(line)));
  };
  const v = e.invocation;
  const manifest = parse(immutable(v.manifestPath, e.manifestSha256));
  if (manifest.format !== "reader-summary-seven-day-new-input-v1" ||
      manifest.operation !== e.operation || manifest.date !== e.date ||
      manifest.tenantId !== e.tenantId || manifest.workspaceId !== e.workspaceId) invalid();
  const directory = resolve(v.capturePath);
  if (realpathSync(directory) !== directory || !lstatSync(directory).isDirectory()) invalid();
  const capture = parse(immutable(join(directory, "incomplete.json"), v.captureSha256));
  const scope = object(capture.scope);
  if (capture.format !== "reader-refresh-paired-capture.v1" || capture.complete !== false ||
      scope.tenantId !== e.tenantId || scope.workspaceId !== e.workspaceId ||
      scope.operation !== e.operation || scope.observedThrough !== manifest.observedThrough) invalid();
  const permittedFailures = ["refresh_incomplete", "selection_failed", "missing_producer_callback",
    "assessment_coverage_failed", "assessment_closure_incomplete", "assessment_closure_missing",
    "missing_canonical-bindings.json"];
  if (array(capture.failures).some((failure) => !permittedFailures.includes(String(failure)))) invalid();
  const files = new Map<string, Buffer>();
  for (const item of array(capture.files)) {
    const file = object(item);
    if (typeof file.name !== "string" || !/^[a-z][a-z0-9-]*\.jsonl?$/u.test(file.name) ||
        file.name === "incomplete.json" || file.name === "complete.json" || files.has(file.name) ||
        typeof file.sha256 !== "string" || !sha256.test(file.sha256)) invalid();
    const name = file.name as string;
    const bytes = immutable(join(directory, name), file.sha256 as string);
    if (bytes.length !== file.bytes) invalid();
    files.set(name, bytes);
  }
  if (refreshHash(readdirSync(directory).sort()) !==
      refreshHash([...files.keys(), "incomplete.json"].sort())) invalid();
  const required = (name: string) => files.get(name) ?? invalid();
  const controls = parse(required("controls.json"));
  if (refreshHash(controls.manifest) !== refreshHash(manifest)) invalid();
  const started = parse(required("started.json"));
  if (started.format !== capture.format || refreshHash(started.scope) !== refreshHash(scope)) invalid();
  const models = lines(required("models.jsonl"));
  const requests = new Map<string, { row: Record<string, unknown>; failed?: Record<string, unknown> }>();
  const rejected = new Set<string>();
  let sequence = 0;
  for (const row of models) {
    if (!Number.isSafeInteger(row.sequence) || Number(row.sequence) <= sequence ||
        !Number.isSafeInteger(row.atMs)) invalid();
    sequence = Number(row.sequence);
    const event = object(row.event);
    if (event.kind === "invocation_started" || event.kind === "invocation_rejected") {
      const command = object(event.command), id = command.requestId;
      if (!nonempty(id) || command.tenantId !== e.tenantId || command.workspaceId !== e.workspaceId ||
          requests.has(String(id)) || rejected.has(String(id))) invalid();
      if (event.kind === "invocation_rejected") {
        if (event.delegated !== false) invalid();
        rejected.add(String(id));
      } else requests.set(String(id), { row });
    } else if (event.kind === "invocation_failed") {
      const request = requests.get(String(event.requestId));
      if (!request || request.failed || event.delegated !== false ||
          Number(row.atMs) < Number(request.row.atMs)) invalid();
      request!.failed = row;
    } else invalid(); // returned, envelope, abort or unknown means zero is unproven
  }
  if (requests.size !== v.attempts.length ||
      object(capture.observationCounts).modelRequests !== requests.size + rejected.size) invalid();
  for (const attempt of v.attempts) {
    const request = requests.get(attempt.requestId);
    if (!request?.failed) invalid();
    const start = request!.row, failed = request!.failed!;
    const command = object(object(start.event).command);
    // The journal hashes the original command; JSON capture drops an own
    // providerInstanceId: undefined. Reconstruct only that known lost property,
    // without changing historical hashes or normalizing other command fields.
    const requestMatches = refreshHash(command) === attempt.requestSha256 ||
      (!Object.prototype.hasOwnProperty.call(command, "providerInstanceId") &&
        refreshHash({ ...command, providerInstanceId: undefined }) === attempt.requestSha256);
    if (command.purpose !== attempt.purpose || !requestMatches ||
        refreshHash({ started: start, failed }) !== attempt.attemptSha256 ||
        new Date(Number(start.atMs)).toISOString() !== attempt.startedAt ||
        new Date(Number(failed.atMs)).toISOString() !== attempt.failedAt) invalid();
  }
  const journal = lines(immutable(v.journalPath, v.journalSha256));
  for (const row of journal) {
    const event = object(row.event);
    let requestId = event.requestId;
    if (event.status === "verified_attestation") {
      // Only the runtime's canonical envelope identifies an attestation. Never
      // fall back to a top-level ID or search arbitrary nested payloads.
      requestId = object(object(event.attestation).attestation).requestId;
      if (!nonempty(requestId) ||
          ("requestId" in event && event.requestId !== requestId) ||
          event.delegated === true || "tokens" in event || "usage" in event) invalid();
    }
    // An event for one of these requests cannot escape validation by claiming
    // another operation. Unscoped provider evidence needs a distinct request ID
    // to be unrelated historical evidence; missing IDs still cannot prove zero.
    if (((requests.has(String(requestId)) || rejected.has(String(requestId))) &&
          event.operation !== e.operation) ||
        (event.operation === undefined && !nonempty(requestId) && (event.status === "invocation_consumed" ||
          event.status === "invocation_returned" || event.status === "verified_attestation" ||
          event.delegated === true || "tokens" in event || "usage" in event))) invalid();
  }
  const current = journal.filter((row) => object(row.event).operation === e.operation);
  const consumed = current.filter((row) => object(row.event).status === "operation_consumed");
  const stopped = current.filter((row) => object(row.event).status === "stopped_requires_reconciliation");
  if (consumed.length !== 1 || object(consumed[0]!.event).jobId !== e.jobId || stopped.length !== 1 ||
      object(stopped[0]!.event).manifestSha256 !== e.manifestSha256) invalid();
  const failures = new Set<string>();
  const permitted = ["before", "admission", "preflight", "operation_consumed", "requires_reconciliation",
    "stopped_requires_reconciliation"];
  for (const row of current) {
    const event = object(row.event);
    if (!isoInstant(row.at) || !permitted.includes(String(event.status)) ||
        event.delegated === true || "tokens" in event || "usage" in event || "attestation" in event) invalid();
    if (event.status === "requires_reconciliation") {
      const attempt = v.attempts.find((item) => item.requestId === event.requestId);
      if (!attempt || failures.has(attempt.requestId) || event.requestSha256 !== attempt.requestSha256 ||
          event.purpose !== attempt.purpose || Date.parse(String(row.at)) < Date.parse(attempt.failedAt)) invalid();
      failures.add(attempt!.requestId);
    }
  }
  if (failures.size !== requests.size || v.attempts.some((attempt) =>
    Date.parse(attempt.startedAt) < Date.parse(String(consumed[0]!.at)) ||
    Date.parse(attempt.failedAt) > Date.parse(String(stopped[0]!.at)))) invalid();
}

export function readReviewedRefreshReconciliation(
  path: string, expected: string, dates: readonly string[],
): { evidence: RefreshReconciliationEvidence; evidenceSha256: string } {
  const absolute = resolve(path);
  const stat = lstatSync(absolute);
  if (realpathSync(absolute) !== absolute || !stat.isFile() || stat.nlink !== 1 ||
      (stat.mode & 0o222) !== 0) {
    throw new Error("Refresh reconciliation evidence must be a regular immutable file");
  }
  const bytes = readFileSync(absolute);
  const evidenceSha256 = refreshBytesHash(bytes);
  if (evidenceSha256 !== expected) throw new Error("Reviewed refresh reconciliation hash differs");
  const evidence = JSON.parse(bytes.toString("utf8")) as RefreshReconciliationEvidence;
  assertRefreshReconciliationEvidence(evidence, dates);
  return { evidence, evidenceSha256 };
}

export type RefreshReconciliationRow = Readonly<{
  id: string; tenantId: string; workspaceId: string;
  readerSummaryJobId: string; operation: string; jobStatus: string;
  jobSha256: string; manifestSha256: string; evidenceSha256: string;
  reason: string; invocation: unknown; accounting: unknown; reconciledAt: Date;
}>;

type WriteClient = Readonly<{
  $queryRaw<T>(strings: TemplateStringsArray, ...values: readonly unknown[]): Promise<T>;
}>;

const selectReconciliation = (client: WriteClient, jobId: string) =>
  client.$queryRaw<readonly RefreshReconciliationRow[]>`
    select id::text as id, tenant_id::text as "tenantId", workspace_id::text as "workspaceId",
      reader_summary_job_id::text as "readerSummaryJobId", operation,
      job_status as "jobStatus", btrim(job_sha256) as "jobSha256",
      btrim(manifest_sha256) as "manifestSha256", btrim(evidence_sha256) as "evidenceSha256",
      reason, invocation, accounting, reconciled_at as "reconciledAt"
    from reader_summary_new_input_refresh_reconciliations
    where tenant_id = ${refreshScope.tenantId}::uuid
      and workspace_id = ${refreshScope.workspaceId}::uuid
      and reader_summary_job_id = ${jobId}::uuid
  `;

/** One statement decides everything: the row is inserted only if the original
 * job is still exactly the consumed, unpublished FAILED attempt named by the
 * reviewed evidence, and its own digest is captured from that same row. */
const insertReconciliation = (client: WriteClient, input: {
  id: string; evidence: RefreshReconciliationEvidence; evidenceSha256: string; now: Date;
}) => {
  const { evidence: e } = input;
  return client.$queryRaw<readonly { id: string }[]>`
    insert into reader_summary_new_input_refresh_reconciliations (
      id, tenant_id, workspace_id, period_started_at, period_ended_at,
      reader_summary_job_id, operation, job_status, job_sha256, manifest_sha256,
      evidence_sha256, reason, invocation, accounting, reconciled_at)
    select ${input.id}::uuid, j.tenant_id, j.workspace_id, j.period_started_at, j.period_ended_at,
      j.id, j.idempotency_key, j.status::text,
      encode(sha256(convert_to(to_jsonb(j)::text, 'UTF8')), 'hex'),
      ${e.manifestSha256}, ${input.evidenceSha256}, ${e.reason},
      ${JSON.stringify(e.invocation)}::jsonb,
      ${JSON.stringify(refreshReconciliationAccountingFor(e))}::jsonb,
      ${input.now}::timestamptz
    from reader_summary_jobs j
    where j.id = ${e.jobId}::uuid
      and j.tenant_id = ${refreshScope.tenantId}::uuid
      and j.workspace_id = ${refreshScope.workspaceId}::uuid
      and j.idempotency_key = ${e.operation}
      and j.status::text = 'FAILED'
      and j.reader_summary_artifact_id is null
      and j.cadence = 'daily' and j.scope_type = 'workspace' and j.scope_key = 'workspace'
      and j.period_timezone = 'UTC'
      and j.period_started_at = ${e.date}::date::timestamp at time zone 'UTC'
      and j.period_ended_at = (${e.date}::date + 1)::timestamp at time zone 'UTC'
      and j.interest_id is null and j.user_id is null and j.subscription_id is null
      and not exists (select 1 from reader_summary_publications p
        where p.reader_summary_job_id = j.id)
      and not exists (select 1 from reader_summary_artifacts a
        where a.id = j.reader_summary_artifact_id)
    on conflict do nothing
    returning id::text as id
  `;
};

/** Why the reviewed job could not be accounted for. Read-only diagnosis; it
 * never relaxes the insert conditions. */
const diagnoseJob = async (client: WriteClient, evidence: RefreshReconciliationEvidence) => {
  const rows = await client.$queryRaw<readonly {
    status: string; operation: string; artifactId: string | null; publications: number;
  }[]>`
    select j.status::text as status, j.idempotency_key as operation,
      j.reader_summary_artifact_id::text as "artifactId",
      (select count(*)::int from reader_summary_publications p
        where p.reader_summary_job_id = j.id) as publications
    from reader_summary_jobs j
    where j.id = ${evidence.jobId}::uuid
      and j.tenant_id = ${refreshScope.tenantId}::uuid
      and j.workspace_id = ${refreshScope.workspaceId}::uuid
  `;
  return rows[0];
};

export type RefreshReconciliationReceipt = Readonly<{
  status: "reconciled" | "already_reconciled";
  reconciliationId: string; jobId: string; operation: string;
  jobSha256: string; evidenceSha256: string; reconciledAt: string;
  accounting: ReturnType<typeof refreshReconciliationAccountingFor>;
}>;

/** Idempotent: an exact replay returns the committed record; anything that
 * differs is a conflict, never a second record and never a reset. */
export async function reconcileConsumedRefreshJob(input: {
  client: WriteClient; evidence: RefreshReconciliationEvidence;
  evidenceSha256: string; now: Date; ids: IdGenerator;
}): Promise<RefreshReconciliationReceipt> {
  const { client, evidence, evidenceSha256 } = input;
  assertRefreshReconciliationEvidence(evidence, refreshDates);
  const accounting = refreshReconciliationAccountingFor(evidence);
  const inserted = await insertReconciliation(client,
    { id: input.ids.generate(), evidence, evidenceSha256, now: input.now });
  const rows = await selectReconciliation(client, evidence.jobId);
  const row = rows[0];
  if (rows.length !== 1 || row === undefined) {
    const observed = await diagnoseJob(client, evidence);
    throw new Error(observed === undefined
      ? "Refresh reconciliation target job does not exist in this workspace"
      : `Refresh reconciliation target job is not a consumed unpublished failure (status=${observed.status}, publications=${observed.publications})`);
  }
  if (row.operation !== evidence.operation || row.jobStatus !== "FAILED" ||
      row.manifestSha256 !== evidence.manifestSha256 ||
      row.evidenceSha256 !== evidenceSha256 || row.reason !== evidence.reason ||
      refreshHash(row.invocation) !== refreshHash(evidence.invocation) ||
      refreshHash(row.accounting) !== refreshHash(accounting)) {
    throw new Error("Refresh reconciliation conflicts with the committed record for this job");
  }
  return { status: inserted.length === 1 ? "reconciled" : "already_reconciled",
    reconciliationId: row.id, jobId: row.readerSummaryJobId, operation: row.operation,
    jobSha256: row.jobSha256, evidenceSha256: row.evidenceSha256,
    reconciledAt: row.reconciledAt.toISOString(), accounting };
}
