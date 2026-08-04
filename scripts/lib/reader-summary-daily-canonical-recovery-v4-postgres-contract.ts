import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const foundation =
  "prisma/migrations/20260802233000_reader_summary_daily_canonical_recovery_v4/migration.sql";
const security =
  "prisma/migrations/20260802233100_reader_summary_daily_canonical_recovery_v4_security/migration.sql";
const originalCutoffForward =
  "prisma/migrations/20260804110000_reader_summary_daily_v4_original_cutoff_forward_correction/migration.sql";
const artifactRepository =
  "libs/summary/adapters/persistence/prisma/prisma-reader-summary-artifact.repository.ts";
const publicationUseCase =
  "libs/summary/features/execute-reader-summary-job/publish-reader-summary-job.ts";
const tenant = "00000000-0000-7000-8000-000000000901";
const workspace = "00000000-0000-7000-8000-000000000902";
const historicalGithubOmissionReason =
  "Reviewed immutable recovery authority contains no eligible GitHub trending projection for this UTC day.";

type Client = Readonly<{
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    values?: readonly unknown[],
  ): Promise<Readonly<{ rows: readonly T[] }>>;
}>;

/** Static gate used before an ephemeral PostgreSQL contract creates its fixture. */
export const assertReaderSummaryDailyCanonicalRecoveryV4MigrationContract = (): void => {
  const first = readFileSync(resolve(foundation), "utf8");
  const second = readFileSync(resolve(security), "utf8");
  const forward = readFileSync(resolve(originalCutoffForward), "utf8");
  const repository = readFileSync(resolve(artifactRepository), "utf8");
  const publication = readFileSync(resolve(publicationUseCase), "utf8");
  const sql = `${first}\n${second}\n${forward}`;
  const forwardBootstrap = forward.slice(
    forward.indexOf(
      'CREATE OR REPLACE FUNCTION public."bootstrap_reader_summary_daily_canonical_recovery_v4"()',
    ),
    forward.indexOf("DO $bootstrap_daily_v4_original_cutoff_forward$"),
  );
  const v4TransitionLock = `LOCK TABLE public."reader_summary_daily_canonical_recovery_v4_plans",
    public."reader_summary_daily_canonical_recovery_v4_authorities"
    IN ACCESS EXCLUSIVE MODE;`;
  const firstBootstrapRowLock = forwardBootstrap.search(/\bFOR\s+(?:UPDATE|KEY\s+SHARE)\b/iu);
  const firstBootstrapRecount = forwardBootstrap.indexOf("SELECT count(*)::INTEGER");
  const legacy = migrationFunction(
    first,
    "assert_reader_summary_daily_canonical_recovery_v4_legacy",
    "reader_summary_daily_canonical_recovery_v4_source_authority",
  );
  const orderedLegacyPlan = migrationFunction(
    first,
    "reader_summary_daily_canonical_recovery_v4_plan_ordered",
    "reader_summary_daily_canonical_recovery_v4_plan_grouped",
  );
  const groupedLegacyPlan = migrationFunction(
    first,
    "reader_summary_daily_canonical_recovery_v4_plan_grouped",
    "assert_reader_summary_daily_canonical_recovery_v4_binding",
  );
  const recoveryDays = ["23", "24", "25", "26", "27", "28", "29", "30"];
  const datedLiterals = new Set(
    [...sql.matchAll(/2026-07-([0-9]{2})/gu)].map((match) => match[1] ?? ""),
  );
  for (const date of recoveryDays) {
    assert(datedLiterals.has(date), `missing immutable Jul${date}`);
  }
  assert(
    [...datedLiterals].every((date) => recoveryDays.includes(date) || date === "31"),
    "v4 must limit recovery scope to Jul23-Jul30 (with Jul31 only as the cutoff boundary)",
  );
  assertPgCatalogOnlySecurityDefinerSearchPaths(sql);
  assert(
    !/(?:^|[^.A-Za-z0-9_])jsonb_object_length\s*\(/gmu.test(sql),
    "V4 SECURITY DEFINER functions must qualify the public JSON object helper",
  );
  assert(
    second.includes(
      'CREATE FUNCTION public."verify_reader_summary_daily_canonical_recovery_v4_provenance"(',
    ) &&
      second.includes("RETURN NULL;") &&
      second.includes(
        'PERFORM public."verify_reader_summary_daily_canonical_recovery_v4_provenance"(',
      ) &&
      (second.match(/verify_reader_summary_daily_canonical_recovery_v4_provenance/gu)
        ?.length ?? 0) >= 2,
    "stage and prepare must share the role-gated V4 PostgreSQL verifier",
  );
  assert(
    repository.includes("dailyCanonicalRecoveryScope") &&
      repository.includes("storedGithubProjectionAudit") &&
      repository.includes("Daily canonical recovery artifact was not re-verified") &&
      !repository.includes("WeakSet") &&
      !publication.includes("recoveryProvenance") &&
      !publication.includes("verifyPublication"),
    "V4 acceptance must be DB-first and publication must not trust a caller port",
  );
  assert(
    !/\bLOCK\s+TABLE\b/iu.test(`${first}\n${second}`) &&
      (forward.match(/\bLOCK\s+TABLE\b/giu)?.length ?? 0) === 1,
    "only the forward V4 bootstrap may take its transition table lock",
  );
  assert(
    sql.includes("FOR UPDATE") && sql.includes("FOR KEY SHARE"),
    "serializable row locks are required",
  );
  assert(
    sql.includes("pre_model_consumed_at") && sql.includes("FAILED_AMBIGUOUS"),
    "irreversible pre-model consumption is required",
  );
  assert(
    sql.includes("PUBLICATION_PENDING") &&
      sql.includes("public_evidence_sha256") &&
      sql.includes("public_frontend_sha256"),
    "publication hashes must be sealed before finalization",
  );
  assert(
    sql.includes("social_monitor_tenant_system_runtime") &&
      sql.includes("membership.inherit_option"),
    "finalization must require the real system capability member",
  );
  assert(
    sql.includes("'historical_unavailable'") &&
      sql.includes("'verified_existing'") && sql.includes("'missing'") &&
      sql.includes(") <> 342") && sql.includes(") <> 350") &&
      sql.includes(") <> 138") && sql.includes(") <> 98"),
    "Jul23, Jul24, Jul28, and Jul30 immutable evidence assertions are required",
  );
  assert(
      sql.includes("'schemaVersion', 2") && sql.includes("'githubProjection'") &&
      sql.includes("'historical_omission'") &&
      sql.includes("'checked_at_collection_anchor'") &&
      sql.includes("'checkedAtCollectionAnchor'") &&
      sql.includes("'unavailableField', 'fetchStartedAt'") &&
      sql.includes("'allowedRequestedUtcDates'") &&
      sql.includes("'eligibleBindingIds'") && sql.includes("'pageCount'") &&
      sql.includes("'sourceBindingId'") &&
      sql.includes("'interestId'") && sql.includes(historicalGithubOmissionReason) &&
      sql.includes("v_github_mode <> 'verified_existing'") &&
      sql.includes("UUID, UUID, DATE, TIMESTAMPTZ, JSONB, JSONB") &&
      sql.includes("WHEN 'reader_summary.production_recovery_day.v2' THEN\n"),
    "v4 must derive strict immutable source authority v2 from both legacy hashes",
  );
  assert(
    legacy.includes(
      "WHEN 'reader_summary.production_recovery_authority.v2' THEN\n" +
        "            public.\"reader_summary_weekly_canonical_json\"(v_lease.\"canonical_record\")",
    ) &&
      legacy.includes(
        "WHEN 'reader_summary.production_recovery_day.v2' THEN\n" +
          "              public.\"reader_summary_weekly_canonical_json\"(v_day.\"canonical_record\")",
      ) &&
      legacy.includes(
        "public.\"reader_summary_production_recovery_canonical_json\"(\n" +
          "                v_day.\"provider_evidence\"->provider.provider_key\n              )",
      ) &&
      legacy.includes("v_day.\"canonical_record\"->'providerEvidenceDigests' IS DISTINCT FROM\n" +
        "              v_provider_digests") &&
      legacy.includes("v_day.\"canonical_record\"->'providerCoverage' IS DISTINCT FROM\n" +
        "              v_day.\"provider_counts\"") &&
      legacy.includes("v_provider_digests->((coverage.ordinal - 1)::INTEGER)->>'sha256'") &&
      !legacy.includes("v_day.\"canonical_record\"->'providerEvidence' IS DISTINCT FROM") &&
      !legacy.includes(
        "WHEN 'reader_summary.production_recovery_day.v2' THEN\n" +
          "                public.\"reader_summary_weekly_canonical_json\"(v_day.\"provider_evidence\")",
      ),
    "v2/v3 legacy hash semantics must preserve record bytes and reconstruct aggregate provider digests",
  );
  assert(
    first.includes(
      'public."reader_summary_weekly_canonical_json_unbounded"(authority)',
    ) &&
      first.includes(
        'public."reader_summary_weekly_canonical_json_unbounded"(v_authority)',
      ) &&
      first.includes(
        'public."reader_summary_weekly_canonical_json_unbounded"(v_first."canonical_record")',
      ) &&
      first.includes(
        'public."reader_summary_weekly_canonical_json_unbounded"(authority."source_authority_record")',
      ) &&
      first.includes(
        'public."reader_summary_weekly_canonical_json_unbounded"(v_first)',
      ) &&
      !first.includes(
        'public."reader_summary_weekly_canonical_json"(v_authority)',
      ),
    "strictly shaped V4 plans and source authorities must use one unbounded canonical byte contract",
  );
  assert(
    first.includes(
      'public."reader_summary_weekly_canonical_json_unbounded"(v_projection)',
    ) &&
      second.includes(
        'public."reader_summary_weekly_canonical_json_unbounded"(v_projection)',
      ) &&
      first.includes(
        'public."reader_summary_weekly_canonical_json_unbounded"(v_provider)',
      ) &&
      first.includes(
        'public."reader_summary_weekly_canonical_json_unbounded"(v_report)',
      ) &&
      first.includes(
        'public."reader_summary_weekly_canonical_json_unbounded"(v_publication."exact_proof")',
      ) &&
      first.includes(
        'public."reader_summary_weekly_canonical_json_unbounded"(v_artifact."artifact_payload")',
      ) &&
      first.includes(
        'public."reader_summary_weekly_canonical_json_unbounded"(v_body)',
      ),
    "strict V4 publication evidence must preserve exact canonical bytes beyond weekly shape limits",
  );
  assert(
    second.includes(
      'CREATE FUNCTION public."reader_summary_daily_canonical_recovery_v4_report_canonical_json"(',
    ) &&
      second.includes("public.jsonb_object_length(value) <> 9") &&
      second.includes(
        "IS DISTINCT FROM 'reader_summary.daily_canonical_recovery.v4' THEN",
      ) &&
      second.includes("v_nodes > 25000") &&
      second.includes("v_depth > 32") &&
      second.includes("v_bytes > 4194304") &&
      second.includes(
        'v_report_canonical := "reader_summary_daily_canonical_recovery_v4_report_canonical_json"(v_report);',
      ) &&
      second.includes(
        "daily canonical recovery v4 publisher rewrite target diverged",
      ) &&
      second.includes(
        "daily canonical recovery v4 pre-evidence rewrite target diverged",
      ) &&
      second.includes(
        "artifact diverged from output_text",
      ) &&
      second.includes(
        'public."reader_summary_weekly_canonical_json"(value);',
      ),
    "only exact V4 reports may use the finite widened canonicalization profile",
  );
  assert(
    (orderedLegacyPlan.match(
      /WHEN 'reader_summary\.production_recovery_authority\.v2' THEN\s+lease\."issued_at"/gu,
    )?.length ?? 0) === 1 && (groupedLegacyPlan.match(
      /WHEN 'reader_summary\.production_recovery_authority\.v2' THEN\s+lease\."issued_at"/gu,
    )?.length ?? 0) === 1,
    "each legacy V2 plan builder must bind the immutable lease issuance timestamp",
  );
  assert(
    !sql.includes("Legacy immutable authority explicitly marks GitHub evidence") &&
      !sql.includes("Legacy GitHub evidence has no immutable output_text projection"),
    "v4 historical GitHub omission must use one canonical reason",
  );
  assert(
    sql.includes("'codex'") && sql.includes("'gpt-5.6-sol'") &&
      sql.includes("'xhigh'") && sql.includes("'output_text'"),
    "only the admitted subscription output_text route is allowed",
  );
  assert(
    sql.includes('"ordinal" IN (1, 2)') &&
      sql.includes("independently byte-identical"),
    "two independent deterministic plans are required",
  );
  assert(
    sql.includes('"record_reader_summary_daily_canonical_recovery_v4_evidence"') &&
      sql.includes('"record_reader_summary_weekly_publication_evidence_base"') &&
      second.includes('"social_monitor_reader_summary_publication_runtime"') &&
      second.includes('"record_reader_summary_weekly_publication_evidence"(UUID)'),
    "V4 evidence must remain behind the existing publication boundary",
  );
  assert(
    forward.includes(
      "7fa94c8538f55592349e820685dc4d34d84c4f3a4afe9165e18df6271d7816f3",
    ) && forward.includes(
      "c51223e11e4631f3c613aa7708fe92d9c308ce31fd8ee5e626e5cee2972ad3e5",
    ) && !forward.includes("'legacyRssCount':") &&
      forward.includes('"legacyRssCount":78') &&
      forward.includes('"legacyRssCount":68') &&
      forward.includes('"correctedRssCount":75') &&
      forward.includes('"correctedRssCount":67') &&
      forward.includes('"legacyTotal":345') &&
      forward.includes('"legacyTotal":351') &&
      forward.includes("'daily v4 original-cutoff removed RSS intersects an artifact'") &&
      forward.includes("v_claim_count <> 10") &&
      forward.includes("v_job_count <> 10") && forward.includes("v_artifact_count <> 8") &&
      forward.includes("v_publication_count <> 0") &&
      forward.includes("v_receipt_count <> 0"),
    "forward cutoff replay must admit only the reviewed consumed legacy state",
  );
  assert(
    forwardBootstrap.includes('FOR UPDATE OF plan') &&
      forwardBootstrap.includes('FOR UPDATE OF authority') &&
      forwardBootstrap.includes('FOR UPDATE OF lease') &&
      !forwardBootstrap.includes("FOR KEY SHARE") &&
      forwardBootstrap.includes("v_plans = 2 AND v_authorities = 8 AND v_leases = 8") &&
      forwardBootstrap.includes("assert_reader_summary_daily_canonical_recovery_v4_binding_base") &&
      forwardBootstrap.includes("old READY binding diverged") &&
      forwardBootstrap.includes("DISABLE TRIGGER \"reader_summary_daily_canonical_recovery_v4_plans_immutable\"") &&
      forwardBootstrap.includes("DISABLE TRIGGER \"rs_daily_recovery_v4_authorities_immutable\"") &&
      forwardBootstrap.includes("tgenabled = 'O'") &&
      forward.includes("daily v4 original-cutoff correction alias is absent") &&
      forward.includes("daily v4 original-cutoff correction alias diverged") &&
      forward.includes("reader_summary_daily_canonical_recovery_v4_corrected_plan_day") &&
      forward.includes("v_effective_authority_sha := v_projection->>'correctedAuthoritySha256'") &&
      forward.includes("daily v4 bootstrap requires empty or exact READY authority state") &&
      forward.includes("daily v4 bootstrap refuses consumed, modeled, or published state") &&
      forward.includes("v_plans = 2 AND v_authorities = 8 AND v_leases = 8"),
    "forward cutoff replay must preserve immutable legacy rows and guard V4 bootstrap state",
  );
  assert(
    forwardBootstrap.includes(v4TransitionLock) &&
      forwardBootstrap.indexOf(v4TransitionLock) < firstBootstrapRowLock &&
      forwardBootstrap.indexOf(v4TransitionLock) < firstBootstrapRecount &&
      forwardBootstrap.indexOf("FOR UPDATE OF plan") <
        forwardBootstrap.indexOf("FOR UPDATE OF authority") &&
      forwardBootstrap.indexOf("FOR UPDATE OF authority") <
        forwardBootstrap.indexOf("FOR UPDATE OF lease"),
    "forward V4 bootstrap must lock exact trigger tables before ordered V4 row locks and recount",
  );
  assert(
    !/\b(?:UPDATE|DELETE\s+FROM)\s+public\."reader_summary_production_recovery_(?:leases|days|dry_runs)"/u
      .test(forward) &&
      !/\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+public\."reader_summary_production_recovery_authority_corrections"/u
        .test(forward) &&
      !/\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+public\."(?:feed_items|source_items)"/u
        .test(forward),
    "forward cutoff replay must be append-only with respect to legacy authority and source rows",
  );
};

const migrationFunction = (
  sql: string,
  name: string,
  nextName: string,
): string => {
  const start = sql.indexOf(`CREATE FUNCTION public."${name}"()`);
  const end = sql.indexOf(`CREATE FUNCTION public."${nextName}"(`, start);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error(`daily canonical recovery migration function ${name} is missing`);
  }
  return sql.slice(start, end);
};

export const assertPgCatalogOnlySecurityDefinerSearchPaths = (
  sql: string,
): void => {
  const declarations = [...sql.matchAll(
    /SET\s+search_path\s*=\s*([^\n]*?)\s+AS\s+\$[a-z_][a-z0-9_]*\$/giu,
  )];
  assert(declarations.length > 0, "SECURITY DEFINER search_path declarations are missing");
  for (const declaration of declarations) {
    if (declaration[1]?.replace(/\s+/gu, "").toLowerCase() !== "pg_catalog") {
      throw new Error("unsafe SECURITY DEFINER search_path");
    }
  }
};

/**
 * PostgreSQL 18 contract for the real recovery pipeline. `executeAll` is the
 * production authority + Prisma + use-case + prepublication + publication +
 * fenced-finalization chain, with only the subscription response deterministic.
 */
export const assertReaderSummaryDailyCanonicalRecoveryV4PostgresContract = async (
  input: Readonly<{
    auditor: Client;
    firstTerminal: Client;
    executeAll(): Promise<Readonly<{
      kind: string;
      publications?: readonly Readonly<{ requestedUtcDate: string }>[];
    }>>;
    runtimeCallCount(): number;
  }>,
): Promise<void> => {
  const protectedBefore = await protectedDayDigest(input.auditor);
  const counts = await input.auditor.query<{
    plans: string;
    authorities: string;
    leases: string;
    matchingPlanHashes: string;
    forcedRls: string;
    unsafeFunctions: string;
  }>(`
    SELECT
      (SELECT count(*) FROM public.reader_summary_daily_canonical_recovery_v4_plans)::TEXT plans,
      (SELECT count(*) FROM public.reader_summary_daily_canonical_recovery_v4_authorities)::TEXT authorities,
      (SELECT count(*) FROM public.reader_summary_daily_canonical_recovery_v4_leases)::TEXT leases,
      (SELECT count(DISTINCT btrim(canonical_sha256)) FROM public.reader_summary_daily_canonical_recovery_v4_plans)::TEXT "matchingPlanHashes",
      (SELECT count(*) FROM pg_catalog.pg_class
       WHERE relname LIKE 'reader_summary_daily_canonical_recovery_v4_%'
         AND relrowsecurity AND relforcerowsecurity)::TEXT "forcedRls",
      (SELECT count(*) FROM pg_catalog.pg_proc procedure
       JOIN pg_catalog.pg_namespace namespace ON namespace.oid = procedure.pronamespace
       WHERE namespace.nspname = 'public'
         AND procedure.proname LIKE '%reader_summary_daily_canonical_recovery_v4%'
         AND (procedure.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog']::TEXT[]
          OR (NOT procedure.prosecdef AND procedure.proname NOT IN (
            'reader_summary_daily_canonical_recovery_v4_model_identity',
            'reader_summary_daily_canonical_recovery_v4_report_canonical_json',
            'record_reader_summary_daily_canonical_recovery_v4_evidence'
          ))))::TEXT "unsafeFunctions"
  `);
  const count = counts.rows[0];
  assert(
    count?.plans === "2" && count.matchingPlanHashes === "1" &&
      count.authorities === "8" && count.leases === "8",
    `v4 did not persist exactly two matching plans and eight immutable rows: ${JSON.stringify(count)}`,
  );
  assert(
    count.forcedRls === "3" && count.unsafeFunctions === "0",
    `v4 RLS or SECURITY DEFINER hardening diverged: ${JSON.stringify(count)}`,
  );

  await assertJul23Jul28Jul30Authority(input.auditor);
  await assertLeastPrivilege(input.auditor);
  await assertRejected(
    input.auditor,
    `BEGIN;
       ALTER TABLE public.reader_summary_production_recovery_days
         DISABLE TRIGGER reader_summary_production_recovery_days_immutable;
       UPDATE public.reader_summary_production_recovery_days
       SET provider_evidence = jsonb_set(
         provider_evidence, '{rss,0,title}', '"tampered legacy evidence"'::JSONB, false
       )
       WHERE tenant_id = '${tenant}' AND workspace_id = '${workspace}'
         AND requested_utc_date = DATE '2026-07-24';
       SELECT public.assert_reader_summary_daily_canonical_recovery_v4_legacy();
       COMMIT`,
    "legacy provider evidence tampering",
  );
  await assertRejected(
    input.auditor,
    `BEGIN; SET LOCAL ROLE social_monitor_reader_summary_publication_owner;
       UPDATE public.reader_summary_daily_canonical_recovery_v4_authorities
       SET source_authority_record = '{}'::JSONB
       WHERE requested_utc_date = DATE '2026-07-23'; COMMIT`,
    "immutable source authority tampering",
  );
  await assertRejected(
    input.firstTerminal,
    `INSERT INTO public.reader_summary_daily_canonical_recovery_v4_leases
      (tenant_id, workspace_id, requested_utc_date, source_authority_sha256, model_job_identity, state)
     VALUES ('${tenant}', '${workspace}', DATE '2026-07-21', repeat('a',64), repeat('b',64), 'READY')`,
    "direct v4 row forgery",
  );
  await assertRejected(
    input.firstTerminal,
    `BEGIN ISOLATION LEVEL SERIALIZABLE;
       SELECT * FROM public.claim_reader_summary_daily_canonical_recovery_v4(
        '00000000-0000-7000-8000-000000000999', '${workspace}', 'forger', transaction_timestamp());
     COMMIT`,
    "cross-workspace claim",
  );
  await assertRejected(
    input.firstTerminal,
    `BEGIN ISOLATION LEVEL SERIALIZABLE;
       SELECT public.verify_reader_summary_daily_canonical_recovery_v4_provenance(
         '${tenant}', '${workspace}', DATE '2026-07-23', NULL, NULL
       );
     COMMIT`,
    "terminal provenance re-verification",
  );

  const firstRun = await input.executeAll();
  const expectedDates = [
    "2026-07-23", "2026-07-24", "2026-07-25", "2026-07-26",
    "2026-07-27", "2026-07-28", "2026-07-29", "2026-07-30",
  ];
  assert(
    firstRun.kind === "caught_up" &&
      firstRun.publications?.map((item) => item.requestedUtcDate).join(",") ===
        expectedDates.join(",") &&
      input.runtimeCallCount() === expectedDates.length,
    "real V4 pipeline did not publish exactly the eight immutable UTC dates",
  );
  const replay = await input.executeAll();
  assert(
    replay.kind === "caught_up" && input.runtimeCallCount() === expectedDates.length,
    "fenced canonical recovery replay invoked the subscription runtime again",
  );
  const finalized = await input.auditor.query<{
    finalizedLeases: string;
    linkedLeases: string;
    finalizedArtifacts: string;
    finalizedJobs: string;
    finalizedPublications: string;
    finalizedEvidence: string;
    v2Audits: string;
    outside: string;
  }>(`
    SELECT
      (SELECT count(*) FROM public.reader_summary_daily_canonical_recovery_v4_leases
       WHERE state = 'FINALIZED' AND finalized_at IS NOT NULL)::TEXT AS "finalizedLeases",
      (SELECT count(*) FROM public.reader_summary_daily_canonical_recovery_v4_leases
       WHERE reader_summary_job_id IS NOT NULL
         AND reader_summary_artifact_id IS NOT NULL
         AND publication_id IS NOT NULL
         AND publication_prepared_at IS NOT NULL)::TEXT AS "linkedLeases",
      (SELECT count(*) FROM public.reader_summary_artifacts artifact
       JOIN public.reader_summary_daily_canonical_recovery_v4_leases lease
         ON lease.reader_summary_artifact_id = artifact.id
       WHERE artifact.status = 'NO_SIGNAL')::TEXT AS "finalizedArtifacts",
      (SELECT count(*) FROM public.reader_summary_jobs job
       JOIN public.reader_summary_daily_canonical_recovery_v4_leases lease
         ON lease.reader_summary_job_id = job.id
       WHERE job.status = 'NO_SIGNAL')::TEXT AS "finalizedJobs",
      (SELECT count(*) FROM public.reader_summary_publications publication
       JOIN public.reader_summary_daily_canonical_recovery_v4_leases lease
         ON lease.publication_id = publication.id
       WHERE publication.semantic_status = 'NO_SIGNAL'
         AND publication.cadence = 'daily')::TEXT AS "finalizedPublications",
      (SELECT count(*) FROM public.reader_summary_weekly_publication_evidence evidence
       JOIN public.reader_summary_daily_canonical_recovery_v4_leases lease
         ON lease.publication_id = evidence.publication_id)::TEXT AS "finalizedEvidence",
      (SELECT count(*) FROM public.reader_summary_artifacts artifact
       JOIN public.reader_summary_daily_canonical_recovery_v4_leases lease
         ON lease.reader_summary_artifact_id = artifact.id
       WHERE artifact.quality_signals->'githubProjectionAudit'->'recoveryV4'
         ->>'schemaVersion' = 'reader_summary.daily_canonical_recovery_provenance.v2')::TEXT AS "v2Audits",
      (SELECT count(*) FROM public.reader_summary_daily_canonical_recovery_v4_authorities
       WHERE requested_utc_date NOT BETWEEN DATE '2026-07-23' AND DATE '2026-07-30')::TEXT outside
  `);
  assert(
    finalized.rows[0]?.finalizedLeases === "8" &&
      finalized.rows[0]?.linkedLeases === "8" &&
      finalized.rows[0]?.finalizedArtifacts === "8" &&
      finalized.rows[0]?.finalizedJobs === "8" &&
      finalized.rows[0]?.finalizedPublications === "8" &&
      finalized.rows[0]?.finalizedEvidence === "8" &&
      finalized.rows[0]?.v2Audits === "8" &&
      finalized.rows[0]?.outside === "0",
    "real V4 Prisma publication or fenced finalization did not cover all eight dates",
  );
  assert(
    await protectedDayDigest(input.auditor) === protectedBefore,
    "v4 changed an excluded Jul21 or Jul22 authority",
  );
};

const assertJul23Jul28Jul30Authority = async (client: Client): Promise<void> => {
  const result = await client.query<{
    jul23: string;
    jul23Counts: string;
    jul23Total: string;
    jul24: string;
    jul24Counts: string;
    jul24Total: string;
    jul23V4Rss: string;
    jul24V4Rss: string;
    jul28: string;
    jul28Counts: string;
    jul28Total: string;
    jul29: string;
    jul29Counts: string;
    jul29RawGithub: string;
    jul30: string;
    jul30Counts: string;
    jul30Total: string;
    v2Authorities: string;
    invalidAuthority: string;
    targetOmissions: string;
    nonTargetOmissions: string;
    anchoredAuthorities: string;
    githubAuthorityItems: string;
    invalidAuthorityIds: string;
    invalidCheckedAtProjection: string;
    observedBeyondCutoff: string;
  }>(`
    SELECT
      (SELECT (github_evidence->>'mode') || ':' || (github_evidence->>'evidenceCount')
       FROM public.reader_summary_production_recovery_days
       WHERE tenant_id = '${tenant}' AND workspace_id = '${workspace}'
         AND requested_utc_date = DATE '2026-07-23' LIMIT 1) AS "jul23",
      (SELECT jsonb_build_array(
        jsonb_array_length(provider_evidence->'github-trending-page'),
        jsonb_array_length(provider_evidence->'hacker-news'),
        jsonb_array_length(provider_evidence->'reddit'),
        jsonb_array_length(provider_evidence->'rss'),
        jsonb_array_length(provider_evidence->'x-twitter'))::TEXT
       FROM public.reader_summary_production_recovery_days
       WHERE tenant_id = '${tenant}' AND workspace_id = '${workspace}'
         AND requested_utc_date = DATE '2026-07-23' LIMIT 1) AS "jul23Counts",
      (SELECT sum(jsonb_array_length(entry.value))::TEXT
       FROM public.reader_summary_production_recovery_days day,
       LATERAL jsonb_each(day.provider_evidence) entry(key, value)
       WHERE day.tenant_id = '${tenant}' AND day.workspace_id = '${workspace}'
         AND requested_utc_date = DATE '2026-07-23') AS "jul23Total",
      (SELECT (github_evidence->>'mode') || ':' || (github_evidence->>'evidenceCount')
       FROM public.reader_summary_production_recovery_days
       WHERE tenant_id = '${tenant}' AND workspace_id = '${workspace}'
         AND requested_utc_date = DATE '2026-07-24' LIMIT 1) AS "jul24",
      (SELECT jsonb_build_array(
        jsonb_array_length(provider_evidence->'github-trending-page'),
        jsonb_array_length(provider_evidence->'hacker-news'),
        jsonb_array_length(provider_evidence->'reddit'),
        jsonb_array_length(provider_evidence->'rss'),
        jsonb_array_length(provider_evidence->'x-twitter'))::TEXT
       FROM public.reader_summary_production_recovery_days
       WHERE tenant_id = '${tenant}' AND workspace_id = '${workspace}'
         AND requested_utc_date = DATE '2026-07-24' LIMIT 1) AS "jul24Counts",
      (SELECT sum(jsonb_array_length(entry.value))::TEXT
       FROM public.reader_summary_production_recovery_days day,
       LATERAL jsonb_each(day.provider_evidence) entry(key, value)
       WHERE day.tenant_id = '${tenant}' AND day.workspace_id = '${workspace}'
         AND requested_utc_date = DATE '2026-07-24') AS "jul24Total",
      (SELECT count(*)::TEXT
       FROM public.reader_summary_daily_canonical_recovery_v4_authorities authority,
       LATERAL jsonb_array_elements(authority.source_authority_record->'items') item(value)
       WHERE authority.tenant_id = '${tenant}' AND authority.workspace_id = '${workspace}'
         AND authority.requested_utc_date = DATE '2026-07-23'
         AND item.value->>'providerKey' = 'rss') AS "jul23V4Rss",
      (SELECT count(*)::TEXT
       FROM public.reader_summary_daily_canonical_recovery_v4_authorities authority,
       LATERAL jsonb_array_elements(authority.source_authority_record->'items') item(value)
       WHERE authority.tenant_id = '${tenant}' AND authority.workspace_id = '${workspace}'
         AND authority.requested_utc_date = DATE '2026-07-24'
         AND item.value->>'providerKey' = 'rss') AS "jul24V4Rss",
      (SELECT (github_evidence->>'mode') || ':' || (github_evidence->>'evidenceCount')
       FROM public.reader_summary_production_recovery_days
       WHERE requested_utc_date = DATE '2026-07-28' LIMIT 1) AS "jul28",
      (SELECT jsonb_build_array(
        jsonb_array_length(provider_evidence->'github-trending-page'),
        jsonb_array_length(provider_evidence->'hacker-news'),
        jsonb_array_length(provider_evidence->'reddit'),
        jsonb_array_length(provider_evidence->'rss'),
        jsonb_array_length(provider_evidence->'x-twitter'))::TEXT
       FROM public.reader_summary_production_recovery_days
       WHERE requested_utc_date = DATE '2026-07-28' LIMIT 1) AS "jul28Counts",
      (SELECT sum(jsonb_array_length(entry.value))::TEXT
       FROM public.reader_summary_production_recovery_days day,
       LATERAL jsonb_each(day.provider_evidence) entry(key, value)
       WHERE requested_utc_date = DATE '2026-07-28') AS "jul28Total",
      (SELECT (github_evidence->>'mode') || ':' || (github_evidence->>'evidenceCount')
       FROM public.reader_summary_production_recovery_days
       WHERE requested_utc_date = DATE '2026-07-29' LIMIT 1) AS "jul29",
      (SELECT jsonb_build_array(
        jsonb_array_length(provider_evidence->'github-trending-page'),
        jsonb_array_length(provider_evidence->'hacker-news'),
        jsonb_array_length(provider_evidence->'reddit'),
        jsonb_array_length(provider_evidence->'rss'),
        jsonb_array_length(provider_evidence->'x-twitter'))::TEXT
       FROM public.reader_summary_production_recovery_days
       WHERE requested_utc_date = DATE '2026-07-29' LIMIT 1) AS "jul29Counts",
      (SELECT count(*)::TEXT
       FROM public.feed_items AS feed
       WHERE feed.tenant_id = '${tenant}' AND feed.workspace_id = '${workspace}'
         AND feed.provider_key = 'github-trending-page'
         AND feed.published_at >= TIMESTAMPTZ '2026-07-29T00:00:00Z'
         AND feed.published_at < TIMESTAMPTZ '2026-07-30T00:00:00Z') AS "jul29RawGithub",
      (SELECT (github_evidence->>'mode') || ':' || (github_evidence->>'evidenceCount')
       FROM public.reader_summary_production_recovery_days
       WHERE requested_utc_date = DATE '2026-07-30' LIMIT 1) AS "jul30",
      (SELECT jsonb_build_array(
        jsonb_array_length(provider_evidence->'github-trending-page'),
        jsonb_array_length(provider_evidence->'hacker-news'),
        jsonb_array_length(provider_evidence->'reddit'),
        jsonb_array_length(provider_evidence->'rss'),
        jsonb_array_length(provider_evidence->'x-twitter'))::TEXT
       FROM public.reader_summary_production_recovery_days
       WHERE requested_utc_date = DATE '2026-07-30' LIMIT 1) AS "jul30Counts",
      (SELECT sum(jsonb_array_length(entry.value))::TEXT
       FROM public.reader_summary_production_recovery_days day,
       LATERAL jsonb_each(day.provider_evidence) entry(key, value)
       WHERE requested_utc_date = DATE '2026-07-30') AS "jul30Total",
      (SELECT count(*)::TEXT
       FROM public.reader_summary_daily_canonical_recovery_v4_authorities
       WHERE source_authority_record->>'schemaVersion' = '2') AS "v2Authorities",
      (SELECT count(*)::TEXT
       FROM public.reader_summary_daily_canonical_recovery_v4_authorities authority
       WHERE authority.source_authority_record->>'schemaVersion' IS DISTINCT FROM '2'
         OR jsonb_typeof(authority.source_authority_record->'githubProjection')
           IS DISTINCT FROM 'object'
         OR (
           authority.requested_utc_date IN (
             DATE '2026-07-23', DATE '2026-07-28', DATE '2026-07-29', DATE '2026-07-30'
           ) AND (
             jsonb_object_length(authority.source_authority_record->'githubProjection')
               IS DISTINCT FROM 3
             OR NOT COALESCE(authority.source_authority_record->'githubProjection' ?& ARRAY[
               'mode', 'reason', 'authorizedAt'
             ], FALSE)
             OR authority.source_authority_record->'githubProjection'->>'mode'
               IS DISTINCT FROM 'historical_omission'
             OR authority.source_authority_record->'githubProjection'->>'reason'
               IS DISTINCT FROM '${historicalGithubOmissionReason}'
             OR authority.source_authority_record->'githubProjection'->>'authorizedAt'
               IS DISTINCT FROM authority.source_authority_record->>'ingestionCutoff'
             OR EXISTS (
               SELECT 1
               FROM jsonb_array_elements(authority.source_authority_record->'items')
                 source(value)
               WHERE source.value->>'providerKey' = 'github-trending-page'
             )
           )
         )
         OR (
           authority.requested_utc_date NOT IN (
             DATE '2026-07-23', DATE '2026-07-28', DATE '2026-07-29', DATE '2026-07-30'
           ) AND (
             jsonb_object_length(authority.source_authority_record->'githubProjection')
               IS DISTINCT FROM 7
             OR NOT COALESCE(authority.source_authority_record->'githubProjection' ?& ARRAY[
               'mode', 'unavailableField', 'anchorField', 'allowedRequestedUtcDates',
               'eligibleBindingIds', 'items', 'pageCount'
             ], FALSE)
             OR authority.source_authority_record->'githubProjection'->>'mode'
               IS DISTINCT FROM 'checked_at_collection_anchor'
             OR authority.source_authority_record->'githubProjection'->>'unavailableField'
               IS DISTINCT FROM 'fetchStartedAt'
             OR authority.source_authority_record->'githubProjection'->>'anchorField'
               IS DISTINCT FROM 'checkedAtCollectionAnchor'
             OR authority.source_authority_record->'githubProjection'->'allowedRequestedUtcDates'
               IS DISTINCT FROM jsonb_build_array(
                 '2026-07-24', '2026-07-25', '2026-07-26', '2026-07-27', '2026-07-29'
               )
             OR jsonb_typeof(
               authority.source_authority_record->'githubProjection'->'eligibleBindingIds'
             ) IS DISTINCT FROM 'array'
             OR jsonb_typeof(
               authority.source_authority_record->'githubProjection'->'items'
             ) IS DISTINCT FROM 'array'
           )
         )) AS "invalidAuthority",
      (SELECT count(*)::TEXT
       FROM public.reader_summary_daily_canonical_recovery_v4_authorities authority
       WHERE authority.requested_utc_date IN (
         DATE '2026-07-23', DATE '2026-07-28', DATE '2026-07-29', DATE '2026-07-30'
       )
         AND authority.source_authority_record->'githubProjection'->>'mode'
           = 'historical_omission') AS "targetOmissions",
      (SELECT count(*)::TEXT
       FROM public.reader_summary_daily_canonical_recovery_v4_authorities authority
       WHERE authority.requested_utc_date NOT IN (
         DATE '2026-07-23', DATE '2026-07-28', DATE '2026-07-29', DATE '2026-07-30'
       )
         AND authority.source_authority_record->'githubProjection'->>'mode'
           = 'historical_omission') AS "nonTargetOmissions",
      (SELECT count(*)::TEXT
       FROM public.reader_summary_daily_canonical_recovery_v4_authorities authority
       WHERE authority.source_authority_record->'githubProjection'->>'mode'
         = 'checked_at_collection_anchor') AS "anchoredAuthorities",
      (SELECT count(*)::TEXT
       FROM public.reader_summary_daily_canonical_recovery_v4_authorities authority
       CROSS JOIN LATERAL jsonb_array_elements(
         authority.source_authority_record->'items'
       ) item(value)
       WHERE item.value->>'providerKey' = 'github-trending-page') AS "githubAuthorityItems",
      (SELECT count(*)::TEXT
       FROM public.reader_summary_daily_canonical_recovery_v4_authorities authority
       CROSS JOIN LATERAL jsonb_array_elements(
         authority.source_authority_record->'items'
       ) item(value)
       WHERE COALESCE(item.value->>'feedItemId', '') !~
           '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         OR COALESCE(item.value->>'sourceItemId', '') !~
           '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         OR COALESCE(item.value->>'sourceBindingId', '') !~
           '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         OR COALESCE(item.value->>'interestId', '') !~
           '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      ) AS "invalidAuthorityIds",
      (SELECT count(*)::TEXT
       FROM public.reader_summary_daily_canonical_recovery_v4_authorities authority
       WHERE authority.requested_utc_date NOT IN (
         DATE '2026-07-23', DATE '2026-07-28', DATE '2026-07-29', DATE '2026-07-30'
       ) AND (
         authority.source_authority_record->'githubProjection'->'eligibleBindingIds'
           IS DISTINCT FROM (
             SELECT COALESCE(jsonb_agg(binding_id ORDER BY binding_id), '[]'::JSONB)
             FROM (
               SELECT DISTINCT source.value->>'sourceBindingId' AS binding_id
               FROM jsonb_array_elements(authority.source_authority_record->'items')
                 source(value)
               WHERE source.value->>'providerKey' = 'github-trending-page'
             ) expected_binding
           )
         OR (
           SELECT count(*)
           FROM jsonb_array_elements(
             authority.source_authority_record->'githubProjection'->'items'
           ) projection(value)
         ) IS DISTINCT FROM (
           SELECT count(*)
           FROM jsonb_array_elements(authority.source_authority_record->'items')
             source(value)
           WHERE source.value->>'providerKey' = 'github-trending-page'
         )
         OR EXISTS (
           SELECT 1
           FROM jsonb_array_elements(
             authority.source_authority_record->'githubProjection'->'items'
           ) projection(value)
           WHERE jsonb_typeof(projection.value) IS DISTINCT FROM 'object'
             OR jsonb_object_length(projection.value) <> 13
             OR projection.value - ARRAY[
               'feedItemId', 'sourceItemId', 'sourceBindingId', 'providerKey',
               'canonicalUrl', 'publishedAt', 'observedAt', 'sourceContentHash',
               'sourceProviderContentHash', 'scanJobId', 'repositoryFullName',
               'rank', 'checkedAtCollectionAnchor'
             ]::TEXT[] <> '{}'::JSONB
             OR projection.value->>'providerKey' IS DISTINCT FROM 'github-trending-page'
             OR projection.value->>'checkedAtCollectionAnchor' !~
               '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$'
             OR left(projection.value->>'checkedAtCollectionAnchor', 10) <>
               authority.source_authority_record->>'requestedUtcDate'
             OR projection.value->>'checkedAtCollectionAnchor' >
               authority.source_authority_record->>'ingestionCutoff'
             OR NOT EXISTS (
               SELECT 1
               FROM jsonb_array_elements(authority.source_authority_record->'items')
                 source(value)
               WHERE source.value->>'providerKey' = 'github-trending-page'
                 AND source.value->>'feedItemId' = projection.value->>'feedItemId'
                 AND source.value->>'sourceItemId' = projection.value->>'sourceItemId'
                 AND source.value->>'sourceBindingId' = projection.value->>'sourceBindingId'
                 AND source.value->>'canonicalUrl' = projection.value->>'canonicalUrl'
                 AND source.value->>'publishedAt' = projection.value->>'publishedAt'
                 AND source.value->>'observedAt' = projection.value->>'observedAt'
                 AND source.value->>'contentHash' = projection.value->>'sourceContentHash'
                 AND source.value->'providerContentHash' IS NOT DISTINCT FROM
                   projection.value->'sourceProviderContentHash'
                 AND source.value->>'publishedAt' <=
                   projection.value->>'checkedAtCollectionAnchor'
                 AND projection.value->>'checkedAtCollectionAnchor' <=
                   source.value->>'observedAt'
             )
         )
         OR (
           SELECT count(*) <> count(DISTINCT projection.value->>'feedItemId')
             OR count(*) <> count(DISTINCT projection.value->>'sourceItemId')
           FROM jsonb_array_elements(
             authority.source_authority_record->'githubProjection'->'items'
           ) projection(value)
         )
         OR EXISTS (
           SELECT 1
           FROM (
             SELECT concat_ws('|', projection.value->>'sourceBindingId',
                 projection.value->>'observedAt', projection.value->>'feedItemId'
               ) AS projection_order,
               lag(concat_ws('|', projection.value->>'sourceBindingId',
                 projection.value->>'observedAt', projection.value->>'feedItemId'
               )) OVER (ORDER BY projection.ordinality) AS previous_order
             FROM jsonb_array_elements(
               authority.source_authority_record->'githubProjection'->'items'
             ) WITH ORDINALITY projection(value, ordinality)
           ) ordered_projection
           WHERE ordered_projection.previous_order IS NOT NULL
             AND ordered_projection.projection_order <= ordered_projection.previous_order
         )
         OR (authority.source_authority_record->'githubProjection'->>'pageCount')::INTEGER
           IS DISTINCT FROM (
             (jsonb_array_length(
               authority.source_authority_record->'githubProjection'->'eligibleBindingIds'
             ) / 1000) + 1 + CASE WHEN jsonb_array_length(
               authority.source_authority_record->'githubProjection'->'eligibleBindingIds'
             ) = 0 THEN 0 ELSE (jsonb_array_length(
               authority.source_authority_record->'githubProjection'->'items'
             ) / 1000) + 1 END
           )
       )) AS "invalidCheckedAtProjection",
      (SELECT count(*)::TEXT
       FROM public.reader_summary_daily_canonical_recovery_v4_authorities authority
       CROSS JOIN LATERAL jsonb_array_elements(authority.source_authority_record->'items')
         item(value)
       WHERE item.value->>'observedAt' > authority.source_authority_record->>'ingestionCutoff'
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements(
              authority.source_authority_record->'githubProjection'->'items'
            ) projection(value)
            WHERE projection.value->>'observedAt' >
              authority.source_authority_record->>'ingestionCutoff'
               OR projection.value->>'checkedAtCollectionAnchor' >
                 authority.source_authority_record->>'ingestionCutoff'
          )) AS "observedBeyondCutoff"
  `);
  const row = result.rows[0];
  assert(
    row?.jul23 === "historical_unavailable:0" &&
      row.jul23Counts === "[0, 100, 100, 75, 67]" && row.jul23Total === "342" &&
      row.jul24 === "verified_existing:10" &&
      row.jul24Counts === "[10, 100, 100, 67, 73]" && row.jul24Total === "350" &&
      row.jul23V4Rss === "75" && row.jul24V4Rss === "67" &&
      row.jul28 === "historical_unavailable:0" &&
      row.jul28Counts === "[0, 0, 0, 31, 107]" && row.jul28Total === "138" &&
      row.jul29 === "unavailable:0" &&
      row.jul29Counts === "[0, 0, 0, 32, 17]" && row.jul29RawGithub === "10" &&
      row.jul30 === "missing:0" &&
      row.jul30Counts === "[0, 0, 0, 34, 64]" && row.jul30Total === "98" &&
      row.v2Authorities === "8" && row.invalidAuthority === "0" &&
      row.targetOmissions === "4" && row.nonTargetOmissions === "0" &&
      row.anchoredAuthorities === "4" && row.githubAuthorityItems === "40" &&
      row.invalidAuthorityIds === "0" && row.invalidCheckedAtProjection === "0" &&
      row.observedBeyondCutoff === "0",
    "immutable source authority v2 projection, real IDs, cutoff, or exact omissions diverged",
  );
};

const assertLeastPrivilege = async (client: Client): Promise<void> => {
  const result = await client.query<{
    directTable: boolean;
    publicClaim: boolean;
    terminalClaim: boolean;
    terminalFinalize: boolean;
    publicationFinalize: boolean;
    publicVerifier: boolean;
    terminalVerifier: boolean;
    systemVerifier: boolean;
    systemPrepare: boolean;
    systemFinalize: boolean;
    publicRecoveryEvidence: boolean;
    terminalRecoveryEvidence: boolean;
    runtimeRecoveryEvidence: boolean;
  }>(`
    SELECT
      has_table_privilege('social_monitor_reader_summary_daily_terminal',
        'public.reader_summary_daily_canonical_recovery_v4_leases',
        'SELECT,INSERT,UPDATE,DELETE') AS "directTable",
      has_function_privilege('public',
        'public.claim_reader_summary_daily_canonical_recovery_v4(UUID,UUID,TEXT,TIMESTAMPTZ)',
        'EXECUTE') AS "publicClaim",
      has_function_privilege('social_monitor_reader_summary_daily_terminal',
        'public.claim_reader_summary_daily_canonical_recovery_v4(UUID,UUID,TEXT,TIMESTAMPTZ)',
        'EXECUTE') AS "terminalClaim",
      has_function_privilege('social_monitor_reader_summary_daily_terminal',
        'public.finalize_reader_summary_daily_canonical_recovery_v4(UUID,UUID,DATE,TEXT,BIGINT,UUID,UUID,UUID,CHAR,CHAR,CHAR,CHAR,CHAR)',
        'EXECUTE') AS "terminalFinalize",
      has_function_privilege('social_monitor_reader_summary_publication_runtime',
        'public.finalize_reader_summary_daily_canonical_recovery_v4(UUID,UUID,DATE,TEXT,BIGINT,UUID,UUID,UUID,CHAR,CHAR,CHAR,CHAR,CHAR)',
        'EXECUTE') AS "publicationFinalize",
      has_function_privilege('public',
        'public.verify_reader_summary_daily_canonical_recovery_v4_provenance(UUID,UUID,DATE,JSONB,UUID)',
        'EXECUTE') AS "publicVerifier",
      has_function_privilege('social_monitor_reader_summary_daily_terminal',
        'public.verify_reader_summary_daily_canonical_recovery_v4_provenance(UUID,UUID,DATE,JSONB,UUID)',
        'EXECUTE') AS "terminalVerifier",
      has_function_privilege('social_monitor_tenant_system_runtime',
        'public.verify_reader_summary_daily_canonical_recovery_v4_provenance(UUID,UUID,DATE,JSONB,UUID)',
        'EXECUTE') AS "systemVerifier",
      has_function_privilege('social_monitor_tenant_system_runtime',
        'public.prepare_reader_summary_daily_canonical_recovery_v4_publication(UUID,UUID,DATE,TEXT,BIGINT,UUID,UUID,UUID,CHAR,CHAR,CHAR,CHAR,CHAR)',
        'EXECUTE') AS "systemPrepare",
      has_function_privilege('social_monitor_tenant_system_runtime',
        'public.finalize_reader_summary_daily_canonical_recovery_v4(UUID,UUID,DATE,TEXT,BIGINT,UUID,UUID,UUID,CHAR,CHAR,CHAR,CHAR,CHAR)',
        'EXECUTE') AS "systemFinalize",
      has_function_privilege('public',
        'public.record_reader_summary_daily_canonical_recovery_v4_evidence(UUID)',
        'EXECUTE') AS "publicRecoveryEvidence",
      has_function_privilege('social_monitor_reader_summary_daily_terminal',
        'public.record_reader_summary_daily_canonical_recovery_v4_evidence(UUID)',
        'EXECUTE') AS "terminalRecoveryEvidence",
      has_function_privilege('social_monitor_reader_summary_publication_runtime',
        'public.record_reader_summary_daily_canonical_recovery_v4_evidence(UUID)',
        'EXECUTE') AS "runtimeRecoveryEvidence"
  `);
  const row = result.rows[0];
  assert(
    row?.directTable === false && row.publicClaim === false &&
      row.terminalClaim === true && row.terminalFinalize === false &&
      row.publicationFinalize === false && row.publicVerifier === false &&
      row.terminalVerifier === false && row.systemVerifier === true &&
      row.systemPrepare === true &&
      row.systemFinalize === true && row.publicRecoveryEvidence === false &&
      row.terminalRecoveryEvidence === false && row.runtimeRecoveryEvidence === false,
    "v4 least-privilege function ACLs diverged",
  );
};

const protectedDayDigest = async (client: Client): Promise<string> => {
  const result = await client.query<{ digest: string }>(`
    SELECT encode(sha256(convert_to(COALESCE(jsonb_agg(jsonb_build_array(
      requested_utc_date, btrim(canonical_sha256)) ORDER BY requested_utc_date,
      recovery_id), '[]'::JSONB)::TEXT, 'UTF8')), 'hex') AS digest
    FROM public.reader_summary_production_recovery_days
    WHERE requested_utc_date IN (DATE '2026-07-21', DATE '2026-07-22')
  `);
  return result.rows[0]?.digest ?? "";
};

const assertRejected = async (
  client: Client,
  sql: string,
  label: string,
): Promise<void> => {
  try {
    await client.query(sql);
  } catch {
    if (/^BEGIN/iu.test(sql.trim())) await client.query("ROLLBACK");
    return;
  }
  throw new Error(`daily canonical recovery admitted ${label}`);
};

const assert: (condition: unknown, message: string) => asserts condition =
  (condition, message) => {
    if (!condition) throw new Error(message);
  };
