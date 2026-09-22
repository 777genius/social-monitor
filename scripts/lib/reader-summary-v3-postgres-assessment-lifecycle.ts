import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";

import type { ReaderValueAnswers, ReaderValueCriterion } from
  "../../libs/relevance/domain/reader-value/reader-value-assessment";
import { PrismaReaderValueAssessmentStore } from
  "../../libs/relevance/infrastructure/reader-value/prisma-reader-value-assessment-store";
import type { AssessmentSqlClient, AssessmentSqlTransaction } from
  "../../libs/relevance/infrastructure/reader-value/assessment-sql";

type CompletionParams = {
  readonly client: PoolClient;
  readonly lockClient: PoolClient;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly jobId: string;
  readonly answers: ReaderValueAnswers;
  readonly timing: "on_time" | "late";
};

export const fixtureReaderValueAnswers = (): ReaderValueAnswers => ({
  usefulness: answer<"usefulness">("useful", ["noise", "context", "useful", "important",
    "insufficient_context"]),
  relevance: answer<"relevance">("central", ["unrelated", "adjacent", "relevant", "central",
    "insufficient_context"]),
  context_sufficiency: answer<"context_sufficiency">("sufficient",
    ["sufficient", "partial", "insufficient"]),
  evidence_basis: answer<"evidence_basis">("observation", ["observation", "described_data",
    "linked_claim", "unsupported_claim", "no_claim", "insufficient_context"]),
});

const answer = <K extends ReaderValueCriterion>(choice: ReaderValueAnswers[K]["choice"],
  labels: readonly string[]): ReaderValueAnswers[K] => ({ choice,
  probabilities: Object.fromEntries(labels.map((label) =>
    [label, label === choice ? 1 : 0])), confidence: 0.9,
  choiceDiffersFromArgmax: false, probabilityTie: false }) as ReaderValueAnswers[K];

/** Drives the production assessment state machine. The explicit row lock lets
 * the contract prove whether the store's own completion timestamp falls on
 * the requested side of the already-frozen preparation deadline. */
export const completeProductionV3Assessment = async (
  params: CompletionParams,
): Promise<void> => {
  const config = (await params.client.query<{ readonly interest_id: string;
    readonly model_config_version: string }>(`SELECT
      preparation_config->>'interestId' AS interest_id,
      preparation_config->>'modelConfigVersion' AS model_config_version
    FROM reader_summary_jobs WHERE id=$1::uuid`, [params.jobId])).rows[0];
  if (config?.interest_id === undefined || config.model_config_version === undefined) {
    throw new Error("production V3 assessment configuration is missing");
  }
  const store = new PrismaReaderValueAssessmentStore(sqlClient(params.client));
  const scope = { tenantId: params.tenantId, workspaceId: params.workspaceId,
    interestId: config.interest_id };
  const claim = await store.claim(scope, config.model_config_version,
    randomUUID(), true);
  if (claim === null) throw new Error("production V3 assessment claim is missing");
  if (!(await store.authorizeDispatch(claim, true))) {
    throw new Error("production V3 assessment dispatch was not authorized");
  }

  const pid = (await params.client.query<{ readonly pid: number }>(
    "SELECT pg_backend_pid() AS pid",
  )).rows[0]?.pid;
  if (pid === undefined) throw new Error("assessment completion pid is missing");
  await params.lockClient.query("BEGIN");
  try {
    await params.lockClient.query(
      "SELECT id FROM reader_value_assessments WHERE id=$1::uuid FOR UPDATE",
      [claim.id],
    );
    const completion = store.complete(claim, { ok: true, answers: params.answers,
      execution: { requestId: `fixture-${claim.id}`, latencyMs: 1,
        inputTokens: 1, outputTokens: 1, costUsd: 0, usageUnknown: false,
        resolvedModel: "fixture-model", provider: "fixture" } });
    await waitForLock(params.lockClient, pid);
    if (params.timing === "late") {
      await params.lockClient.query(`SELECT pg_sleep(LEAST(6, GREATEST(0,
        EXTRACT(EPOCH FROM (preparation_deadline_at-clock_timestamp()))+0.05)))
        FROM reader_summary_jobs WHERE id=$1::uuid`, [params.jobId]);
    }
    await params.lockClient.query("COMMIT");
    if (!(await completion)) {
      throw new Error("production V3 assessment completion was rejected");
    }
  } catch (error) {
    await params.lockClient.query("ROLLBACK");
    throw error;
  }
};

const sqlClient = (client: PoolClient): AssessmentSqlClient => ({
  $queryRawUnsafe: async <T>(sql: string, ...values: unknown[]) =>
    (await client.query(sql, values)).rows as T,
  $executeRawUnsafe: async (sql: string, ...values: unknown[]) =>
    (await client.query(sql, values)).rowCount ?? 0,
  $transaction: async <T>(operation: (
    transaction: AssessmentSqlTransaction,
  ) => Promise<T>) => {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    try {
      const result = await operation(transactionClient(client));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  },
});

const transactionClient = (client: PoolClient): AssessmentSqlTransaction => ({
  $queryRawUnsafe: async <T>(sql: string, ...values: unknown[]) =>
    (await client.query(sql, values)).rows as T,
  $executeRawUnsafe: async (sql: string, ...values: unknown[]) =>
    (await client.query(sql, values)).rowCount ?? 0,
});

const waitForLock = async (observer: PoolClient, pid: number): Promise<void> => {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const row = (await observer.query<{ readonly waiting: boolean }>(
      "SELECT wait_event_type='Lock' AS waiting FROM pg_stat_activity WHERE pid=$1",
      [pid],
    )).rows[0];
    if (row?.waiting) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("assessment completion did not wait on the controlled row lock");
};
