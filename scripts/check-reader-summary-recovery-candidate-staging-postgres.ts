import { randomBytes } from "node:crypto";

import { Pool, type PoolClient } from "pg";

import { PrismaReaderSummaryRecoveryFinalization } from "../libs/summary/adapters/persistence/prisma/prisma-reader-summary-recovery-finalization";
import type { PrismaReaderSummaryClient } from "../libs/summary/adapters/persistence/prisma/prisma-reader-summary-client";
import type { PrismaSummaryClient } from "../libs/summary/adapters/persistence/prisma/prisma-summary-client";
import { buildReaderSummaryPublicationPayload } from "../libs/summary/adapters/persistence/reader-summary-publication-proof";
import type { ReaderSummaryJob } from "../libs/summary/domain";
import type {
  ReaderSummaryPublicationCommand,
  ReaderSummaryRecoveryFinalizationCommand,
  ReaderSummaryRecoveryProvenance,
} from "../libs/summary/ports";

const suffix = randomBytes(10).toString("hex");
const databaseName = `reader_summary_candidate_stage_${suffix}`;
const serverUrl = requiredAdminUrl(process.env);
const databaseUrl = withDatabase(serverUrl, databaseName);
const server = new Pool({ connectionString: serverUrl, max: 1 });
let databaseCreated = false;

const main = async (): Promise<void> => {
  assert(
    /^reader_summary_candidate_stage_[0-9a-f]{20}$/.test(databaseName),
    "candidate staging database name must be bounded",
  );
  await server.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
  databaseCreated = true;
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  try {
    await pool.query(schemaSql);
    await assertFreshFirstRunAndExactReplay(pool);
    await assertDivergentCandidateRejected(pool);
    await assertFinalizationFailureRollsBackCandidate(pool);
  } finally {
    await pool.end();
  }
  console.log(
    "Reader summary recovery candidate staging real-PostgreSQL gate OK",
  );
};

const assertFreshFirstRunAndExactReplay = async (pool: Pool): Promise<void> => {
  const fixture = candidateFixture(1, "Fresh candidate");
  const finalization = new PrismaReaderSummaryRecoveryFinalization(
    postgresPrismaClient(pool),
  );
  assert(
    (await finalization.finalize(fixture)) === "published",
    "fresh candidate staging must publish on its first run",
  );
  assert(
    (await finalization.finalize(fixture)) === "replayed",
    "the exact staged candidate must replay",
  );
  const payload = buildReaderSummaryPublicationPayload(fixture.publication);
  const evidence = await pool.query<{
    readonly artifacts: string;
    readonly finalizations: string;
    readonly jobs: string;
  }>(
    `SELECT
       (SELECT count(*) FROM reader_summary_artifacts WHERE id = $1) AS artifacts,
       (SELECT count(*) FROM reader_summary_jobs WHERE id = $2) AS jobs,
       (SELECT count(*) FROM recovery_finalizations WHERE publication_id = $1)
         AS finalizations`,
    [payload.readerSummaryArtifactId, payload.readerSummaryJobId],
  );
  assertDeepEqual(
    evidence.rows[0],
    { artifacts: "1", jobs: "1", finalizations: "1" },
    "fresh finalization and replay must retain one exact durable candidate",
  );
};

const assertDivergentCandidateRejected = async (pool: Pool): Promise<void> => {
  const fixture = candidateFixture(2, "Candidate before divergence");
  const finalization = new PrismaReaderSummaryRecoveryFinalization(
    postgresPrismaClient(pool),
  );
  await finalization.finalize(fixture);
  const payload = buildReaderSummaryPublicationPayload(fixture.publication);
  await pool.query("DELETE FROM recovery_finalizations WHERE publication_id = $1", [
    payload.readerSummaryArtifactId,
  ]);
  await pool.query("DELETE FROM reader_summary_jobs WHERE id = $1", [
    payload.readerSummaryJobId,
  ]);
  await pool.query(
    `UPDATE reader_summary_artifacts
        SET status = 'RUNNING', headline = 'Divergent durable headline'
      WHERE id = $1`,
    [payload.readerSummaryArtifactId],
  );

  await assertRejectsContaining(
    () => finalization.finalize(fixture),
    "candidate conflicts with durable state",
    "a divergent durable candidate must fail exact verification",
  );
  const evidence = await pool.query<{
    readonly artifact_headline: string;
    readonly jobs: string;
  }>(
    `SELECT artifact.headline AS artifact_headline,
            (SELECT count(*) FROM reader_summary_jobs WHERE id = $2) AS jobs
       FROM reader_summary_artifacts artifact
      WHERE artifact.id = $1`,
    [payload.readerSummaryArtifactId, payload.readerSummaryJobId],
  );
  assertDeepEqual(
    evidence.rows[0],
    { artifact_headline: "Divergent durable headline", jobs: "0" },
    "divergent rejection must preserve authority and roll back the staged job",
  );
};

const assertFinalizationFailureRollsBackCandidate = async (
  pool: Pool,
): Promise<void> => {
  const fixture = candidateFixture(3, "Rollback candidate");
  const payload = buildReaderSummaryPublicationPayload(fixture.publication);
  const finalization = new PrismaReaderSummaryRecoveryFinalization(
    postgresPrismaClient(pool),
  );
  await assertRejectsContaining(
    () => finalization.finalize(fixture),
    "fixture finalization failure",
    "failure after exact staging must reject",
  );
  const evidence = await pool.query<{
    readonly artifacts: string;
    readonly finalizations: string;
    readonly jobs: string;
  }>(
    `SELECT
       (SELECT count(*) FROM reader_summary_artifacts WHERE id = $1) AS artifacts,
       (SELECT count(*) FROM reader_summary_jobs WHERE id = $2) AS jobs,
       (SELECT count(*) FROM recovery_finalizations WHERE publication_id = $1)
         AS finalizations`,
    [payload.readerSummaryArtifactId, payload.readerSummaryJobId],
  );
  assertDeepEqual(
    evidence.rows[0],
    { artifacts: "0", jobs: "0", finalizations: "0" },
    "finalization failure must roll candidate insertion back atomically",
  );
};

const postgresPrismaClient = (pool: Pool): PrismaSummaryClient => {
  const root = {
    $queryRaw: async () => {
      throw new Error("candidate staging query escaped its transaction");
    },
    $transaction: async <TValue>(
      operation: (client: PrismaReaderSummaryClient) => Promise<TValue>,
      options?: { readonly isolationLevel?: "Serializable" },
    ): Promise<TValue> => {
      assert(
        options?.isolationLevel === "Serializable",
        "candidate staging must request Serializable isolation",
      );
      const client = await pool.connect();
      try {
        await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
        const result = await operation(postgresQueryClient(client));
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
  return root as unknown as PrismaSummaryClient;
};

const postgresQueryClient = (client: PoolClient): PrismaReaderSummaryClient =>
  ({
    $queryRaw: async <TValue>(
      strings: TemplateStringsArray,
      ...values: readonly unknown[]
    ): Promise<TValue> => {
      const text = strings.reduce(
        (sql, fragment, index) =>
          `${sql}${fragment}${index < values.length ? `$${index + 1}` : ""}`,
        "",
      );
      const result = await client.query(text, [...values]);
      return result.rows as TValue;
    },
  }) as unknown as PrismaReaderSummaryClient;

const candidateFixture = (
  sequence: number,
  headline: string,
): ReaderSummaryRecoveryFinalizationCommand => {
  const idSuffix = String(sequence).padStart(12, "0");
  const tenantId = "00000000-0000-4000-8000-000000000001";
  const workspaceId = "00000000-0000-4000-8000-000000000002";
  const jobId = `10000000-0000-4000-8000-${idSuffix}`;
  const artifactId = `20000000-0000-4000-8000-${idSuffix}`;
  const requestedAt = new Date("2026-07-05T10:00:00.000Z");
  const completedAt = new Date("2026-07-06T00:00:00.000Z");
  const period = {
    cadence: "daily" as const,
    startedAt: new Date("2026-07-05T00:00:00.000Z"),
    endedAt: completedAt,
    timezone: "UTC",
    periodKey:
      "daily:2026-07-05T00:00:00.000Z:2026-07-06T00:00:00.000Z:UTC",
  };
  const scope = { type: "workspace" as const };
  const artifactSnapshot = {
    schemaVersion: "reader_summary.artifact.v1" as const,
    readerSummaryId: artifactId,
    tenantId,
    workspaceId,
    scope,
    period,
    generatedAt: requestedAt,
    sourceWindow: {
      windowId: `candidate-window-${sequence}`,
      startedAt: period.startedAt,
      endedAt: period.endedAt,
      selectedFeedItemIds: [],
      storyClusterIds: [],
    },
    storyClusters: [],
    contextArtifacts: [],
    headline,
    executiveSummary: "No eligible evidence.",
    topStories: [],
    interestHighlights: [],
    repeatedSignals: [],
    risksAndUnknowns: [],
    citationMap: [],
    content: {
      qualityState: {
        status: "no_signal" as const,
        flags: ["no_signal"],
        warnings: ["No eligible evidence."],
        isSingleSource: false,
      },
      topReads: [],
      selectedPosts: [],
      narrativeSections: [],
    },
    qualityFlags: ["no_signal"],
    confidence: {
      level: "none" as const,
      score: 0,
      rationale: "No eligible evidence.",
    },
    lineage: {
      promptVersion: "reader-summary.prompt.candidate-stage.v1",
      schemaVersion: "reader_summary.artifact.v1",
      modelVersion: "candidate-stage-postgres.v1",
      providerVersion: "fixture",
      rulesVersion: "reader-summary.rules.v1",
      evalDatasetVersion: "reader-summary.eval.v1",
    },
    usage: { inputTokens: 10, outputTokens: 5, estimatedCostUsd: 0 },
    noSignalReason: "No eligible evidence.",
  };
  const finalJobSnapshot = {
    id: jobId,
    tenantId,
    workspaceId,
    scope,
    period,
    status: "no_signal" as const,
    idempotencyKey: `candidate-stage:${jobId}`,
    requestedAt,
    startedAt: requestedAt,
    completedAt,
    readerSummaryId: artifactId,
  };
  const publication = {
    artifact: { toSnapshot: () => artifactSnapshot },
    finalJob: { toSnapshot: () => finalJobSnapshot },
    publicationDecision: {
      status: "published" as const,
      qualityPassed: true,
      canonicalScore: 1,
      shadow: {
        mode: "shadow" as const,
        policyVersion: "reader_summary_publication_shadow_v1" as const,
        riskScore: 0,
        signals: [],
      },
      reasons: [],
    },
    githubProjectionAudit: {
      schemaVersion: "reader_summary.github_projection.v1" as const,
      status: "not_required" as const,
      requestedUtcDay: "2026-07-05",
      pageCount: 1,
      scannedItemCount: 0,
      eligibleBindingIds: [],
      bindings: [],
      violationCodes: [],
      reasons: [],
    },
    readyEvent: {
      eventId: `30000000-0000-4000-8000-${idSuffix}`,
      eventType: "reader_summary.ready" as const,
      schemaVersion: 1 as const,
      occurredAt: completedAt,
      tenantId,
      workspaceId,
      correlationId: jobId,
      causationId: jobId,
      payload: {
        readerSummaryJobId: jobId,
        readerSummaryId: artifactId,
        tenantId,
        workspaceId,
        scope,
        period,
        status: "no_signal" as const,
      },
    },
  } as unknown as ReaderSummaryPublicationCommand;
  const payload = buildReaderSummaryPublicationPayload(publication);
  return {
    publication,
    provenance: recoveryProvenance(payload),
    candidate: {
      runningJob: {
        toSnapshot: () => ({
          ...finalJobSnapshot,
          status: "running" as const,
          completedAt: undefined,
          readerSummaryId: undefined,
        }),
      } as unknown as ReaderSummaryJob,
    },
  };
};

const recoveryProvenance = (payload: {
  readonly periodStartedAt: string;
  readonly periodEndedAt: string;
  readonly periodTimezone: string;
}): ReaderSummaryRecoveryProvenance => ({
  schemaVersion: "reader_summary.summary_only_recovery_provenance.v1",
  mode: "summary-only",
  collectionUtcPeriod: {
    startedAt: payload.periodStartedAt,
    endedAt: payload.periodEndedAt,
    timezone: payload.periodTimezone,
  },
  priorCollectionProof: {
    sourceAttempt: {
      artifactFormat: "reader-summary-production-day-run-v1",
      sha256: "a".repeat(64),
    },
    collectionArtifact: {
      artifactFormat: "reader-summary-clean-real-day-collection-v1",
      sha256: "b".repeat(64),
    },
    collectionQualityReport: {
      artifactFormat: "yesterday-social-collection-quality-report-v1",
      sha256: "c".repeat(64),
    },
  },
  regenerationInputManifest: {
    artifactFormat: "reader-summary-day-dataset-manifest-v1",
    sha256: "d".repeat(64),
    datasetSha256: "e".repeat(64),
  },
});

const cleanup = async (): Promise<void> => {
  if (databaseCreated) {
    await server.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
      [databaseName],
    );
    await server.query(`DROP DATABASE ${quoteIdentifier(databaseName)}`);
  }
  await server.end();
};

const requiredAdminUrl = (env: NodeJS.ProcessEnv): string => {
  const value = env.READER_SUMMARY_PUBLICATION_TEST_ADMIN_DATABASE_URL?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(
      "READER_SUMMARY_PUBLICATION_TEST_ADMIN_DATABASE_URL is required; the disposable PostgreSQL candidate staging gate never skips",
    );
  }
  return value;
};

const withDatabase = (input: string, database: string): string => {
  const value = new URL(input);
  value.pathname = `/${database}`;
  return value.toString();
};

const quoteIdentifier = (input: string): string =>
  `"${input.replaceAll('"', '""')}"`;

const assertRejectsContaining = async (
  operation: () => Promise<unknown>,
  expected: string,
  message: string,
): Promise<void> => {
  try {
    await operation();
  } catch (error) {
    assert(error instanceof Error && error.message.includes(expected), message);
    return;
  }
  throw new Error(message);
};

const assertDeepEqual = (
  actual: unknown,
  expected: unknown,
  message: string,
): void => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const schemaSql = `
  CREATE TYPE "SummaryStatus" AS ENUM ('RUNNING', 'COMPLETED', 'NO_SIGNAL');

  CREATE TABLE reader_summary_artifacts (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    workspace_id UUID NOT NULL,
    scope_type TEXT NOT NULL,
    scope_key TEXT NOT NULL,
    interest_id UUID,
    cadence TEXT NOT NULL,
    period_started_at TIMESTAMPTZ NOT NULL,
    period_ended_at TIMESTAMPTZ NOT NULL,
    period_timezone TEXT NOT NULL,
    period_key TEXT NOT NULL,
    user_id TEXT,
    subscription_id UUID,
    status "SummaryStatus" NOT NULL,
    schema_version INTEGER NOT NULL,
    model_version TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    headline TEXT NOT NULL,
    summary_text TEXT,
    artifact_payload JSONB NOT NULL,
    citations JSONB NOT NULL,
    quality_signals JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
  );

  CREATE TABLE reader_summary_jobs (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    workspace_id UUID NOT NULL,
    scope_type TEXT NOT NULL,
    scope_key TEXT NOT NULL,
    interest_id UUID,
    cadence TEXT NOT NULL,
    period_started_at TIMESTAMPTZ NOT NULL,
    period_ended_at TIMESTAMPTZ NOT NULL,
    period_timezone TEXT NOT NULL,
    period_key TEXT NOT NULL,
    user_id TEXT,
    subscription_id UUID,
    status "SummaryStatus" NOT NULL,
    idempotency_key TEXT NOT NULL,
    requested_at TIMESTAMPTZ NOT NULL,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    reader_summary_artifact_id UUID REFERENCES reader_summary_artifacts(id),
    failure_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
  );

  CREATE TABLE recovery_finalizations (publication_id UUID PRIMARY KEY);

  CREATE FUNCTION finalize_reader_summary_recovery(
    publication_payload JSONB,
    receipt_payload JSONB
  ) RETURNS TABLE (
    outcome TEXT,
    publication_id UUID,
    receipt_id UUID,
    report_sha256 TEXT,
    proof_sha256 TEXT,
    provenance_sha256 TEXT,
    receipt_sha256 TEXT
  ) LANGUAGE plpgsql AS $$
  DECLARE
    inserted BOOLEAN;
    artifact_id UUID := (publication_payload->>'readerSummaryArtifactId')::UUID;
  BEGIN
    IF publication_payload->'report'->>'headline' = 'Rollback candidate' THEN
      RAISE EXCEPTION 'fixture finalization failure';
    END IF;
    WITH first_finalize AS (
      INSERT INTO recovery_finalizations(publication_id)
      VALUES (artifact_id)
      ON CONFLICT DO NOTHING
      RETURNING 1
    ) SELECT EXISTS (SELECT 1 FROM first_finalize) INTO inserted;
    UPDATE reader_summary_artifacts
       SET status = (publication_payload->>'semanticStatus')::"SummaryStatus"
     WHERE id = artifact_id;
    UPDATE reader_summary_jobs
       SET status = (publication_payload->>'semanticStatus')::"SummaryStatus",
           completed_at = (publication_payload->>'publishedAt')::TIMESTAMPTZ,
           reader_summary_artifact_id = artifact_id
     WHERE id = (publication_payload->>'readerSummaryJobId')::UUID;
    RETURN QUERY SELECT
      CASE WHEN inserted THEN 'published' ELSE 'replayed' END,
      artifact_id,
      artifact_id,
      publication_payload->>'reportSha256',
      publication_payload->>'proofSha256',
      receipt_payload->>'provenanceSha256',
      receipt_payload->>'receiptSha256';
  END;
  $$;
`;

void main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(cleanup);
