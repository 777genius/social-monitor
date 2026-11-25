import { randomUUID, createHash } from "node:crypto";
import { runWithTenantDatabaseAccess } from "@social-monitor/platform-persistence";
import { reserveFirstPublicationDay } from "./reader-summary-first-publication-reservation";
import { createReaderSummaryPublicationRunningFixture } from "./reader-summary-publication-postgres-running-fixture";
import { pg18FixtureScope, type NativeFirstpubClaimCase, type NativeFirstpubClaimFixture } from "./reader-summary-first-publication-pg18.spec-support";

const start = new Date("2026-09-29T00:00:00.000Z"), end = new Date("2026-09-30T00:00:00.000Z");
const day = { ...pg18FixtureScope, startedAt: start.toISOString(), endedAt: end.toISOString() };
const periodKey = `daily:${day.startedAt}:${day.endedAt}:UTC`;

/** Every case commits its claim in an independent, empty synthetic DB clone.
 * No ledger is deleted, trigger disabled, or impossible FAILED publication
 * status fabricated. Slots/publications have no caller-failure status: both
 * failed and UNKNOWN describe the caller after that durable commit. */
export async function proveNativeFirstpubClaimMatrix(
  withClaimCase: (name: NativeFirstpubClaimCase, operation: (fixture: NativeFirstpubClaimFixture) => Promise<void>) => Promise<void>,
): Promise<void> {
  for (const category of ["jobs", "artifacts", "publications", "slots", "daily_model_jobs"] as const) {
    for (const outcome of ["failed", "unknown"] as const) {
      await withClaimCase(`${category}_${outcome}`, async (f) => {
        const status = outcome === "failed" ? "FAILED" : "RUNNING";
        const params = [randomUUID(), day.tenantId, day.workspaceId, start, end, periodKey, status];
        if (category === "jobs") {
          await f.admin.query(`INSERT INTO reader_summary_jobs(id,tenant_id,workspace_id,scope_type,scope_key,cadence,
            period_started_at,period_ended_at,period_timezone,period_key,status,idempotency_key,requested_at,created_at,updated_at)
            VALUES($1,$2,$3,'workspace','workspace','daily',$4,$5,'UTC',$6,$7,$1::text,$5,$5,$5)`, params);
        } else if (category === "artifacts") {
          await f.admin.query(`INSERT INTO reader_summary_artifacts(id,tenant_id,workspace_id,scope_type,scope_key,cadence,
            period_started_at,period_ended_at,period_timezone,period_key,status,model_version,prompt_version,headline,
            artifact_payload,citations,quality_signals,created_at,updated_at)
            VALUES($1,$2,$3,'workspace','workspace','daily',$4,$5,'UTC',$6,$7,'synthetic','synthetic','synthetic',
              '{}','[]','{}',$5,$5)`, params);
        } else if (category === "slots") {
          await reserveFirstPublicationDay(f.client, day, new Date());
        } else if (category === "publications") {
          const seed = await f.admin.connect();
          const fixture = await (async () => {
            try { return await createReaderSummaryPublicationRunningFixture(seed, "NO_SIGNAL", "2026-09-29", { providerEvidence: "none" }); }
            finally { seed.release(); }
          })();
          const payload = JSON.stringify(fixture.payload);
          const rows = await runWithTenantDatabaseAccess(day, () => f.client.$queryRaw<readonly { outcome: string }[]>`
            SELECT * FROM public.publish_reader_summary(${payload}::jsonb)`);
          expect(rows).toHaveLength(1);
          expect(rows[0]?.outcome).toBe("published");
          // Publication, artifact and job FKs remain real. This scenario does
          // not corrupt parents merely to isolate one OR predicate.
        } else {
          const canonical = Buffer.from("{}", "utf8");
          const digest = createHash("sha256").update(canonical).digest("hex");
          await f.admin.query(`INSERT INTO reader_summary_daily_source_authorities
            (tenant_id,workspace_id,requested_utc_date,ingestion_cutoff,canonical_record,canonical_bytes,canonical_sha256,created_at)
            VALUES($1,$2,'2026-09-29',$3,'{}',$4,$5,$3)`, [day.tenantId, day.workspaceId, end, canonical, digest]);
          await f.admin.query(`INSERT INTO reader_summary_daily_model_jobs
            (tenant_id,workspace_id,requested_utc_date,identity,source_authority_sha256,provider,model,reasoning_effort,
              runtime_engine,state,reserved_at,running_at,failed_ambiguous_at)
            VALUES($1,$2,'2026-09-29',$3,$4,'synthetic','synthetic','synthetic','synthetic',$5,$6,$6,
              CASE WHEN $5='FAILED_AMBIGUOUS' THEN $6::timestamptz ELSE NULL END)`,
          [day.tenantId, day.workspaceId, randomUUID(), digest, outcome === "failed" ? "FAILED_AMBIGUOUS" : "RUNNING", end]);
        }
        // Check committed rows through an independent new finite connection.
        const connection = await f.finite.connect();
        try {
          await connection.query(`SELECT set_config('social_monitor.tenant_id',$1,false),
            set_config('social_monitor.workspace_id',$2,false),set_config('social_monitor.system_access','false',false)`,
          [day.tenantId, day.workspaceId]);
          const table = {
            jobs: "reader_summary_jobs", artifacts: "reader_summary_artifacts", publications: "reader_summary_publications",
            slots: "reader_summary_publication_slots", daily_model_jobs: "reader_summary_daily_model_jobs",
          }[category];
          const rows = await connection.query(`SELECT count(*) FROM public.${table}`);
          expect(Number(rows.rows[0].count)).toBe(1);
        } finally { connection.release(); }
        let providerEffects = 0;
        await expect((async () => {
          await reserveFirstPublicationDay(f.client, day, new Date());
          providerEffects++;
        })()).rejects.toMatchObject({ code: "P0001" });
        expect(providerEffects).toBe(0);
      });
    }
  }
}
