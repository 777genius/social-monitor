import { readFileSync } from 'node:fs';
import type { Pool } from 'pg';
import { canonicalSha256 } from './reader-summary-ready-recovery-manifest';
import type { RecoverySnapshot } from './reader-summary-ready-recovery-evidence';

const baseline = () => readFileSync('prisma/migrations/20260618143000_baseline/migration.sql', 'utf8');
const publication = () => readFileSync('prisma/migrations/20260716170000_reader_summary_fail_closed_publication/migration.sql', 'utf8');
const evidence = () => readFileSync('prisma/migrations/20260724020000_reader_summary_weekly_publication_evidence/migration.sql', 'utf8');
const required = (sql: string, pattern: RegExp): string => {
  const value = sql.match(pattern)?.[0];
  if (!value) throw new Error(`Recovery fixture migration definition missing: ${pattern.source}`);
  return value;
};
export function recoveryFixtureSchema(): readonly string[] {
  const tables = [
    [baseline(), 'reader_summary_artifacts'], [baseline(), 'reader_summary_jobs'],
    [publication(), 'reader_summary_publications'], [publication(), 'reader_summary_publication_slots'],
    [evidence(), 'reader_summary_weekly_publication_evidence'],
  ];
  return [required(baseline(), /CREATE TYPE "SummaryStatus"[^;]+;/), ...tables.flatMap(([sql, table]) => [
    required(sql!, new RegExp(`CREATE TABLE "${table}" \\([\\s\\S]*?\\n\\);`)),
    ...Array.from(sql!.matchAll(new RegExp(`CREATE (?:UNIQUE )?INDEX [^;]+\\sON\\s+"${table}"[^;]+;`, 'g')), match => match[0]),
  ])];
}
export async function seedRecoveryPostgres(database: Pool, snapshots: readonly RecoverySnapshot[]): Promise<void> {
  for (const sql of recoveryFixtureSchema()) await database.query(sql);
  // Only known synthetic fixture objects/columns enter these parameterized inserts.
  const insert = async (table: string, row: object) => {
    const fields = Object.entries(row);
    const columns = fields.map(([key]) => `"${key.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`)}"`);
    await database.query(`INSERT INTO "${table}" (${columns.join(',')}) VALUES (${fields.map((_, i) => `$${i + 1}`).join(',')})`,
      fields.map(([, value]) => value !== null && typeof value === 'object' && !(value instanceof Date) && !Buffer.isBuffer(value)
        ? JSON.stringify(value) : value));
  };
  const slots = new Set<string>();
  for (const s of snapshots) {
    const { rowVersion: _version, ...row } = s.row; void _version;
    const { readerSummaryArtifact: a, readerSummaryJob: j, ...p } = s.publication!;
    const scope = { tenantId: p.tenantId, workspaceId: p.workspaceId, scopeType: p.scopeType, scopeKey: p.scopeKey,
      cadence: p.cadence, periodStartedAt: p.periodStartedAt, periodEndedAt: p.periodEndedAt, periodTimezone: p.periodTimezone };
    const report = { schemaVersion: 'reader_summary.publication_report.v1', semanticStatus: p.semanticStatus,
      modelVersion: a.modelVersion, promptVersion: a.promptVersion, headline: a.headline, summaryText: a.summaryText,
      artifactPayload: a.artifactPayload, citations: a.citations, qualitySignals: a.qualitySignals };
    await insert('outbox_events', row);
    await insert('reader_summary_artifacts', { ...a, updatedAt: p.publishedAt });
    await insert('reader_summary_jobs', { ...j, idempotencyKey: j!.id, requestedAt: p.periodStartedAt, updatedAt: p.publishedAt });
    await insert('reader_summary_publications', { ...p, requestedUtcDate: p.periodStartedAt, requestedAt: p.periodStartedAt,
      publicationKind: 'EXACT', modelVersion: a.modelVersion, modelAuthority: 1 });
    if (!slots.has(canonicalSha256(scope))) {
      await insert('reader_summary_publication_slots', { ...scope, currentPublicationId: p.id, updatedAt: p.publishedAt });
      slots.add(canonicalSha256(scope));
    }
    const providerEvidence = [{ synthetic: true }], canonical = Buffer.from(JSON.stringify({ synthetic: p.id }));
    await insert('reader_summary_weekly_publication_evidence', { ...scope, publicationId: p.id, requestedUtcDate: p.periodStartedAt,
      readerSummaryJobId: j!.id, readerSummaryArtifactId: a.id, reportId: `report:${p.id}`, proofId: `proof:${p.id}`,
      semanticStatus: p.semanticStatus, report, reportSha256: p.reportSha256, exactProof: p.exactProof, proofSha256: p.proofSha256,
      artifactPayloadSha256: canonicalSha256(a.artifactPayload), providerEvidence, providerEvidenceSha256: canonicalSha256(providerEvidence),
      githubEvidence: { mode: 'synthetic' }, canonicalRecord: { synthetic: p.id }, canonicalBytes: canonical,
      canonicalSha256: canonicalSha256({ synthetic: p.id }), identity: `synthetic:${p.id}`, recordedAt: p.publishedAt });
  }
}
export async function protectRecoveryPostgres(database: Pool, runtimeUrl: string): Promise<{ recoveryUrl: string; cleanup: () => Promise<void> }> {
  const url = new URL(runtimeUrl), runtimeRole = decodeURIComponent(url.username);
  if (!/^reader_delivery_fixture_[0-9a-f]{16}_runtime$/.test(runtimeRole)) throw new Error('Expected isolated delivery fixture role');
  const systemRole = runtimeRole.replace(/_runtime$/, '_system'), recoveryRole = runtimeRole.replace(/_runtime$/, '_recovery');
  const password = decodeURIComponent(url.password);
  if (!/^[0-9a-f]{48}$/.test(password)) throw new Error('Expected generated fixture password');
  const rls = readFileSync('prisma/migrations/20260723153000_tenant_row_level_security/migration.sql', 'utf8');
  await database.query(required(rls, /ALTER TABLE "outbox_events" ENABLE[\s\S]*?\n {2}\);/));
  for (const name of ['reject_reader_summary_publication_mutation', 'guard_published_reader_summary_artifact_update', 'guard_reader_summary_weekly_publication_evidence']) {
    const sql = name === 'guard_reader_summary_weekly_publication_evidence' ? evidence() : publication();
    await database.query(required(sql, new RegExp(`CREATE (?:OR REPLACE )?FUNCTION "${name}"\\(\\)[\\s\\S]*?\\$\\$;`))
      .replaceAll('social_monitor_reader_summary_publication_owner', systemRole));
  }
  for (const [sql, name] of [[publication(), 'reader_summary_publications_immutable'],
    [publication(), 'reader_summary_artifacts_published_immutable'], [evidence(), 'reader_summary_weekly_publication_evidence_guarded']]) {
    await database.query(required(sql!, new RegExp(`CREATE TRIGGER "${name}"[\\s\\S]*?;`)));
  }
  for (const table of ['reader_summary_artifacts', 'reader_summary_jobs', 'reader_summary_publications', 'reader_summary_weekly_publication_evidence']) {
    await database.query(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY; ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation ON "${table}" USING (public.social_monitor_rls_workspace_match(tenant_id, workspace_id))
      WITH CHECK (public.social_monitor_rls_workspace_match(tenant_id, workspace_id));`);
  }
  await database.query(`CREATE ROLE "${recoveryRole}" LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS`);
  const cleanup = async () => { await database.query(`DROP OWNED BY "${recoveryRole}"; DROP ROLE "${recoveryRole}"`); };
  try {
    await database.query(`GRANT "${systemRole}" TO "${recoveryRole}";
      GRANT SELECT ON ALL TABLES IN SCHEMA public TO "${runtimeRole}", "${recoveryRole}", "${systemRole}";
      GRANT UPDATE ON outbox_events TO "${recoveryRole}";
      GRANT UPDATE ON reader_summary_artifacts TO "${systemRole}";`);
    url.username = recoveryRole;
    return { recoveryUrl: url.toString(), cleanup };
  } catch (error) { await cleanup(); throw error; }
}
