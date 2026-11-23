import type { ReaderSummaryPublicationPostgresClient } from "./reader-summary-publication-postgres-fixture-scope";
import { approvedGatewayLlmSdkIdentity } from "../../libs/summary/adapters/model/gateway-llm/gateway-llm-sdk-identity";
import { assertPostgres as assert, assertPostgresRejectsContaining as assertRejects } from "./reader-summary-publication-postgres-assertions";

type Payload = Record<string, unknown>;
type Proof = Record<string, unknown>;

/** The real capability is exercised under its ordinary tenant runtime role. */
export const assertReaderSummaryWeeklyGatewayPostgresContract = async (params: {
  readonly adminClient: ReaderSummaryPublicationPostgresClient;
  readonly runtimeClient: ReaderSummaryPublicationPostgresClient;
  readonly payload: Payload;
  readonly rebuild: (payload: Payload) => Payload;
}): Promise<void> => {
  const catalog = await params.adminClient.query<{ secure: boolean }>(`
    SELECT owner.rolname = 'social_monitor_reader_summary_publication_owner'
      AND NOT has_schema_privilege(owner.oid, 'public', 'CREATE')
      AND NOT p.prosecdef AND p.proisstrict AND p.provolatile = 'i'
      AND p.proconfig = ARRAY['search_path=pg_catalog']::text[]
      AND NOT EXISTS (
        SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
        WHERE acl.grantee <> p.proowner AND acl.privilege_type = 'EXECUTE'
      ) AS secure
    FROM pg_proc p JOIN pg_roles owner ON owner.oid = p.proowner
    WHERE p.oid = 'public.reader_summary_weekly_review_attestation_valid(jsonb,text)'::regprocedure
  `);
  assert(catalog.rows.length === 1 && catalog.rows[0]?.secure === true,
    "gateway attestation validator ownership, search path or execution ACL diverged");

  const base = params.payload.executionAttestation as Proof;
  const gateway = {
    profileId: "openai-codex-oauth-responses-v1",
    taskId: "synthetic-weekly-task-a1",
    attempt: 1,
    executionRef: "synthetic-weekly-execution",
    requestRef: "synthetic-weekly-request",
    accountRef: "synthetic-weekly-account",
    observedModel: "gpt-6.1-sol",
    requestSha256: "d".repeat(64),
  };
  const proof: Proof = { ...base, runtimeEngine: "gateway-llm", model: "gpt-6.1-sol",
    reasoningEffort: "low", runtimePackageVersion: approvedGatewayLlmSdkIdentity.packageVersion,
    launcherSha256: approvedGatewayLlmSdkIdentity.archiveSha256, gateway };
  const payloadFor = (executionAttestation: Proof): Payload =>
    params.rebuild({ ...params.payload, executionAttestation });
  const invoke = async (payload: Payload) => params.runtimeClient.query<{ outcome: string }>(
    "SELECT outcome FROM persist_reader_summary_weekly_review_manifest($1::jsonb)",
    [JSON.stringify(payload)],
  );
  const transaction = async (action: () => Promise<void>) => {
    await params.runtimeClient.query("BEGIN ISOLATION LEVEL SERIALIZABLE READ WRITE");
    try { await action(); }
    finally { await params.runtimeClient.query("ROLLBACK"); }
  };
  // Roll back fixture writes so the existing independent CLI race/replay tests
  // still exercise the same immutable seal from an empty manifest slot.
  for (const valid of [proof,
    { ...proof, model: "gpt-6.1-terra", reasoningEffort: "medium",
      gateway: { ...gateway, observedModel: "gpt-6.1-terra" } },
    { ...proof, gateway: { ...gateway, observedModel: null } },
    { ...proof, gateway: { ...gateway, observedModel: "gpt-6.1-sol-2026-11-02" } },
    { ...proof, model: "gpt-5.6-sol", reasoningEffort: "high",
      gateway: { ...gateway, observedModel: "gpt-5.6-sol" } },
  ]) {
    await transaction(async () => {
      const payload = payloadFor(valid);
      assert((await invoke(payload)).rows[0]?.outcome === "persisted",
        "valid native gateway review must persist");
      assert((await invoke(payload)).rows[0]?.outcome === "replayed",
        "identical gateway review must replay without another write");
    });
  }
  const without = (key: string): Proof => {
    const result = { ...gateway } as Proof;
    delete result[key];
    return { ...proof, gateway: result };
  };
  const missingGateway = { ...proof };
  delete missingGateway.gateway;
  const bad: readonly [string, Proof][] = [
    ["missing gateway", missingGateway],
    ["null gateway", { ...proof, gateway: null }],
    ["missing request binding", without("requestSha256")],
    ["extra outer key", { ...proof, unexpected: true }],
    ["extra gateway key", { ...proof, gateway: { ...gateway, unexpected: true } }],
    ["other profile", { ...proof, gateway: { ...gateway, profileId: "other-profile" } }],
    ["wrong SDK", { ...proof, runtimePackageVersion: "9.9.9" }],
    ["wrong SDK digest", { ...proof, launcherSha256: "e".repeat(64) }],
    ["crossed effort", { ...proof, reasoningEffort: "high" }],
    ["Terra wrong effort", { ...proof, model: "gpt-6.1-terra", reasoningEffort: "low",
      gateway: { ...gateway, observedModel: "gpt-6.1-terra" } }],
    ["wrong model", { ...proof, model: "another-model" }],
    ["retired purpose", { ...proof, purpose: "social_monitor.reader_summary.weekly.review" }],
    ["wrong output kind", { ...proof, selectedOutputKind: "output_text" }],
    ["wrong output hash", { ...proof, selectedOutputSha256: "e".repeat(64) }],
    ["wrong observed model", { ...proof, gateway: { ...gateway, observedModel: "another-model" } }],
    ["wrong dated suffix", { ...proof, gateway: { ...gateway, observedModel: "gpt-6.1-sol-extra" } }],
    ["zero attempt", { ...proof, gateway: { ...gateway, attempt: 0 } }],
    ["fractional attempt", { ...proof, gateway: { ...gateway, attempt: 1.5 } }],
    ["string attempt", { ...proof, gateway: { ...gateway, attempt: "1" } }],
    ["unsafe attempt", { ...proof, gateway: { ...gateway, attempt: 9007199254740992 } }],
    ["invalid request ref", { ...proof, gateway: { ...gateway, requestRef: "bad:ref" } }],
    ["null execution ref", { ...proof, gateway: { ...gateway, executionRef: null } }],
    ["null purpose", { ...proof, purpose: null }],
    ["null output kind", { ...proof, selectedOutputKind: null }],
    ["gateway block on CLI proof", { ...base, gateway }],
  ];
  for (const [label, invalid] of bad) {
    await transaction(async () => assertRejects(() => invoke(payloadFor(invalid)),
      "weekly review manifest execution attestation is invalid",
      `gateway review must reject ${label} even with recomputed canonical bytes/hashes`));
  }
};
