import assert from 'node:assert/strict';
import { CryptoIdGenerator, SystemClock } from '@social-monitor/shared-kernel';
import type { ConfiguredInterestReaderPort } from '@social-monitor/relevance/ports';
import { assessmentReadSnapshot } from '@social-monitor/relevance/infrastructure/reader-value/assessment-sql';
import { readerValueLabels } from '@social-monitor/relevance/domain/reader-value/reader-value-assessment';
import type { ReaderValueFailureCode } from '@social-monitor/relevance/domain/reader-value/reader-value-failure';
import { READER_VALUE_RESOLVED_MODEL } from '@social-monitor/relevance/domain/reader-value/reader-value-config';
import type { ReaderValueScoringProvider } from '@social-monitor/relevance/infrastructure/reader-value/reader-value-provider-config';
import { seedAssessmentSource, type assessmentPostgresFixture } from './reader-value-postgres-fixture';
import { seedProductionReaderValueCapture } from './reader-summary-v3-postgres-production-preflight';

export type ReaderValuePipelineFixture = Awaited<ReturnType<typeof assessmentPostgresFixture>>;
export const pipelineClock = new SystemClock();
export const pipelineIds = new CryptoIdGenerator();

/** Current interest authority is read through the fixture's scoped production
 * Prisma connection, rather than supplied as a canned configuration. */
export const pipelineInterests = (fixture: ReaderValuePipelineFixture): ConfiguredInterestReaderPort => ({
  readCurrent: async (scope) => assessmentReadSnapshot(fixture.client, scope, async (tx) => {
    const rows = await tx.$queryRawUnsafe<{ query: string }[]>(`SELECT query FROM interests
      WHERE tenant_id=$1::uuid AND workspace_id=$2::uuid AND id=$3::uuid
        AND status='ENABLED' AND deleted_at IS NULL`, scope.tenantId, scope.workspaceId, scope.interestId);
    return rows[0] === undefined ? { kind: 'missing' } : {
      kind: 'available', interest: { ...scope, query: rows[0].query },
    };
  }),
});

export async function seedProviderPipelineSource(fixture: ReaderValuePipelineFixture,
  kind: 'useful' | 'unrelated' = 'useful') {
  const seeded = await seedAssessmentSource(fixture.setup);
  const title = kind === 'useful' ? 'Compiler test runner adds reproducible build tests'
    : 'A quiet afternoon in the garden';
  const body = kind === 'useful'
    ? 'A compiler test runner release adds deterministic test fixtures and a cache-isolation check. '
      + 'In a documented 100-build local experiment, median build time fell from 40 seconds to 25 seconds. '
      + 'The report describes the fixture inputs, cache settings, and steps to reproduce the comparison.'
    : 'The roses are pink today. I enjoyed a cup of tea beside the garden and watched a robin.';
  await fixture.setup.query(`UPDATE interests SET query=$2 WHERE id=$1::uuid`,
    [seeded.input.interestId, 'Compiler testing tools and reproducible software testing methods']);
  await fixture.setup.query(`UPDATE source_items SET title=$2,body=$3,content_hash=$4,
    published_at=clock_timestamp()-interval '1 minute',
    observed_at=clock_timestamp()-interval '1 minute',
    content_updated_at=clock_timestamp()-interval '1 minute' WHERE id=$1::uuid`,
  [seeded.input.sourceItemId, title, body, `pipeline-${kind}`]);
  await fixture.setup.query(`UPDATE feed_items SET title=$2,body_preview=$3,
    published_at=(SELECT published_at FROM source_items WHERE id=$4::uuid),
    observed_at=(SELECT observed_at FROM source_items WHERE id=$4::uuid) WHERE id=$1::uuid`,
  [seeded.feedId, title, body, seeded.input.sourceItemId]);
  const client = await fixture.setup.connect();
  try { await seedProductionReaderValueCapture(client, seeded.feedId); }
  finally { client.release(); }
  const window = (await fixture.setup.query<{ startedAt: string; endedAt: string; cutoffAt: string }>(
    `SELECT to_char(date_trunc('day',published_at) AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "startedAt",
      to_char((date_trunc('day',published_at)+interval '1 day') AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "endedAt",
      to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "cutoffAt"
      FROM source_items WHERE id=$1::uuid`, [seeded.input.sourceItemId])).rows[0];
  assert(window, 'synthetic source has a bounded publication window');
  const { tenantId, workspaceId, interestId } = seeded.input;
  return { ...seeded, scope: { tenantId, workspaceId, interestId }, window };
}

export function syntheticProviderResponse(provider: ReaderValueScoringProvider, refusal = false) {
  const answers = Object.entries(readerValueLabels).map(([name, labels]) => {
    const choice = name === 'usefulness' ? 'useful' : name === 'relevance' ? 'relevant'
      : name === 'context_sufficiency' ? 'sufficient' : 'described_data';
    return { name, type: 'choice', choice, confidence: 1,
      probabilities: labels.map((value) => ({ value, probability: value === choice ? 1 : 0 })) };
  });
  if (provider === 'openai-decisions') return {
    model: 'gpt-6-luna',
    answers: answers.map((answer, index) => refusal && index === 0
      ? { name: answer.name, type: 'refusal' } : answer),
    usage: { input_tokens: 128, output_tokens: 0, total_tokens: 128 },
  };
  assert(!refusal, 'refusal wire fixture belongs to Decisions');
  return { model: READER_VALUE_RESOLVED_MODEL, provider: 'TypeSafe', id: 'fixture-request',
    usage: { input_tokens: 128, output_tokens: 0, cost: 0.001 },
    answers: Object.fromEntries(answers.map(({ name, ...answer }) => [name, { ...answer,
      probabilities: Object.fromEntries(answer.probabilities.map(({ value, probability }) => [value, probability])),
    }])) };
}

/** A single counter spans all sources and adapter restarts in one live run.
 * The counter is incremented before transport; exceeding the budget sends nothing. */
export function boundedPipelineTransport(transport: typeof fetch, maximumCalls: number) {
  assert(Number.isSafeInteger(maximumCalls) && maximumCalls > 0);
  let calls = 0;
  let blockedCalls = 0;
  const bounded: typeof fetch = async (...args) => {
    if (calls >= maximumCalls) {
      blockedCalls += 1;
      throw new Error('Reader value pipeline transport budget exhausted');
    }
    calls += 1;
    return transport(...args);
  };
  return { transport: bounded, calls: () => calls, blockedCalls: () => blockedCalls };
}

export class ReaderValueProviderPipelineFailure extends Error {
  constructor(readonly failureCode: ReaderValueFailureCode | 'assessment_incomplete' | 'persistence_unavailable') {
    super('Reader value pipeline assessment did not complete');
  }
}

export function providerPipelineFailureCode(error: unknown): string {
  return error instanceof ReaderValueProviderPipelineFailure ? error.failureCode : 'pipeline_verification_failed';
}

/** Deliberately excludes exception messages, SQL, connection strings and raw
 * provider payloads, including on assertion or cleanup failures. */
export function reportProviderPipelineFailure(check: string, error?: unknown): void {
  console.error(JSON.stringify({ check, passed: false, errorCode: providerPipelineFailureCode(error) }));
  process.exitCode = 1;
}
