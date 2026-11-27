import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client, type Pool } from 'pg';
import { loadPrismaRuntimeClient } from '@social-monitor/platform-persistence/prisma-runtime-client';
import { defaultPostgresRuntimePoolConfig, PostgresRuntimePoolRegistry, type PrismaPgRuntimeClientConstructor } from '@social-monitor/platform-persistence';
import { CryptoIdGenerator, FixedClock, eventId, workspaceId } from '@social-monitor/shared-kernel';
import { DeterministicSummaryModelAdapter } from '@social-monitor/summary/adapters/model/deterministic-summary-model.adapter';
import { PrismaSummaryArtifactRepository } from '@social-monitor/summary/adapters/persistence/prisma/prisma-summary-artifact.repository';
import { PrismaSummaryExecutionWorkflow } from '@social-monitor/summary/adapters/persistence/prisma/prisma-summary-execution-workflow';
import { PrismaSummaryJobRepository } from '@social-monitor/summary/adapters/persistence/prisma/prisma-summary-job.repository';
import { SummaryJob } from '@social-monitor/summary/domain';
import { ExecuteSummaryJobUseCase } from '@social-monitor/summary/features/execute-summary-job/execute-summary-job.use-case';
import type { SummaryExecutionClaim } from '@social-monitor/summary/ports';

import {
  summaryFixtureCommand, summaryFixtureCompletion, summaryFixtureJob, summaryFixtureNow,
} from '../../test/support/summary-execution-outcome-fixture';
import {
  installSummaryExecutionTables, waitForBlockedSummaryClaims, withSummaryCommitFault, type SummaryExecutionPostgresClient,
} from './summary-execution-postgres-fixture';

type Fixture = { readonly database: Pool; readonly adminUrl: string; readonly runtimeUrl: string };

export async function checkSummaryExecutionPostgres(f: Fixture): Promise<void> {
  await installSummaryExecutionTables(f.database, f.runtimeUrl);
  const PrismaClient = loadPrismaRuntimeClient<PrismaPgRuntimeClientConstructor<SummaryExecutionPostgresClient>>();
  const config = defaultPostgresRuntimePoolConfig(f.runtimeUrl, 'admin-tool');
  assert.equal(config.max, 1, 'each independent fixture worker must use a single connection');
  const first = await new PostgresRuntimePoolRegistry().acquire(config, PrismaClient);
  const peer = await new PostgresRuntimePoolRegistry().acquire(config, PrismaClient).catch(async (error) => {
    await first.close();
    throw error;
  });
  const left = new PrismaSummaryExecutionWorkflow(first.client);
  const right = new PrismaSummaryExecutionWorkflow(peer.client);
  const jobs = new PrismaSummaryJobRepository(first.client);
  const artifacts = new PrismaSummaryArtifactRepository(first.client);
  const state = async (id: string) => (await f.database.query<{ status: string; summary_artifact_id: string | null }>(
    'SELECT status, summary_artifact_id FROM summary_jobs WHERE id=$1', [id])).rows[0]!;
  const artifactCount = async (id: string) => (await f.database.query<{ count: number }>(
    'SELECT count(*)::int AS count FROM summary_artifacts WHERE id=$1', [id])).rows[0]!.count;
  const eventCount = async (id: string) => (await f.database.query<{ count: number }>(
    'SELECT count(*)::int AS count FROM outbox_events WHERE id=$1', [id])).rows[0]!.count;
  const start = { ...summaryFixtureCommand, startedAt: summaryFixtureNow };

  try {
    await jobs.save(summaryFixtureJob());
    // Force both independent worker connections to wait for the same row.
    const locker = new Client({ connectionString: f.adminUrl });
    await locker.connect();
    let pending: Promise<(SummaryExecutionClaim | null)[]> | undefined;
    let claims: (SummaryExecutionClaim | null)[] = [];
    try {
      await locker.query('BEGIN');
      await locker.query('SELECT id FROM summary_jobs WHERE id=$1 FOR UPDATE', [start.summaryJobId]);
      pending = Promise.all([left.tryStart(start), right.tryStart(start)]);
      // Observe a rejected connection/query while the lock latch is still pending.
      void pending.catch(() => undefined);
      await waitForBlockedSummaryClaims(f.database);
      await locker.query('ROLLBACK');
      claims = await pending;
    } finally {
      await locker.query('ROLLBACK');
      await locker.end();
      await pending?.catch(() => undefined);
    }
    assert.equal(claims.filter((claim) => claim !== null).length, 1, 'exactly one delivery may claim the model execution');
    const original = claims.find((claim): claim is SummaryExecutionClaim => claim !== null)!;
    assert.match(original.version, /^\d+$/);
    assert.equal(await left.tryStart(start), null, 'RUNNING is never reclaimed');
    assert.equal(await left.tryStart({ ...start, workspaceId: workspaceId(randomUUID()) }), null);
    assert.equal(await left.fail({ execution: original, failedAt: summaryFixtureNow, failureReason: 'fixture known failure' }), true);
    const retry = await right.tryStart(start);
    assert(retry !== null);
    assert.notEqual(retry.version, original.version, 'identical wall-clock starts must still have different ownership');
    assert.equal(retry.job.toSnapshot().startedAt?.getTime(), original.job.toSnapshot().startedAt?.getTime());
    const stale = summaryFixtureCompletion(original);
    assert.equal(await left.complete(stale), null);
    assert.equal(await artifactCount(stale.artifact.toSnapshot().summaryId), 0, 'CAS loss must roll back the inserted artifact');
    assert.equal(await eventCount(stale.event.eventId), 0);
    assert.equal(await left.fail({ execution: original, failedAt: summaryFixtureNow, failureReason: 'late failure' }), false);
    const completed = summaryFixtureCompletion(retry);
    assert((await right.complete(completed)) !== null);
    assert.equal((await state(start.summaryJobId)).status, 'NO_SIGNAL');
    assert.equal(await left.fail({ execution: retry, failedAt: summaryFixtureNow, failureReason: 'late terminal failure' }), false);
    assert.equal(await artifactCount(completed.artifact.toSnapshot().summaryId), 1);
    assert.equal(await eventCount(completed.event.eventId), 1);

    // A valid job in a different workspace must not overwrite an artifact ID.
    const collisionJobId = randomUUID();
    const collisionScope = { ...start, workspaceId: workspaceId(randomUUID()), summaryJobId: collisionJobId };
    await jobs.save(SummaryJob.request({ ...summaryFixtureJob(collisionJobId).toSnapshot(), workspaceId: collisionScope.workspaceId }));
    const collision = await right.tryStart(collisionScope);
    assert(collision !== null);
    const colliding = summaryFixtureCompletion(collision, completed.artifact.toSnapshot().summaryId, randomUUID());
    await assert.rejects(right.complete(colliding));
    assert.equal((await state(collisionJobId)).status, 'RUNNING');
    assert.equal(await eventCount(colliding.event.eventId), 0);
    assert.deepEqual((await artifacts.findById({
      ...summaryFixtureCommand, summaryId: completed.artifact.toSnapshot().summaryId,
    }))?.toSnapshot(), completed.artifact.toSnapshot());

    // Event insertion fails after artifact insertion and job CAS; all three roll back.
    const eventCollisionId = randomUUID();
    await jobs.save(summaryFixtureJob(eventCollisionId));
    const eventClaim = await left.tryStart({ ...start, summaryJobId: eventCollisionId });
    assert(eventClaim !== null);
    const eventCollision = summaryFixtureCompletion(eventClaim, randomUUID(), completed.event.eventId);
    await assert.rejects(left.complete(eventCollision));
    assert.equal((await state(eventCollisionId)).status, 'RUNNING');
    assert.equal(await artifactCount(eventCollision.artifact.toSnapshot().summaryId), 0);
    assert.equal(await eventCount(completed.event.eventId), 1);
    assert((await left.complete({
      ...eventCollision, event: { ...eventCollision.event, eventId: eventId(randomUUID()) },
    })) !== null, 'a rolled-back transaction must leave the original execution version usable');

    // Concurrent completion and failure cannot both win the same ownership version.
    const raceId = randomUUID();
    await jobs.save(summaryFixtureJob(raceId));
    const raceClaim = await left.tryStart({ ...start, summaryJobId: raceId });
    assert(raceClaim !== null);
    const raceCompletion = summaryFixtureCompletion(raceClaim, randomUUID(), randomUUID());
    const [terminal, failed] = await Promise.all([
      left.complete(raceCompletion),
      right.fail({ execution: raceClaim, failedAt: summaryFixtureNow, failureReason: 'competing terminal outcome' }),
    ]);
    assert.equal(Number(terminal !== null) + Number(failed), 1);
    assert.equal(await artifactCount(raceCompletion.artifact.toSnapshot().summaryId), terminal === null ? 0 : 1);
    assert.equal(await eventCount(raceCompletion.event.eventId), terminal === null ? 0 : 1);

    for (const fault of ['before_commit', 'after_commit'] as const) {
      const jobId = randomUUID();
      await jobs.save(summaryFixtureJob(jobId));
      const model = new CountingSummaryModel();
      const allocated: string[] = [];
      const generated = new CryptoIdGenerator();
      const useCase = new ExecuteSummaryJobUseCase(
        jobs, artifacts, { save: async () => undefined, findByInterest: async () => null },
        { findEffectivePreference: async () => null },
        { select: async () => ({
          sourceWindow: { windowId: 'native-fixture', startedAt: new Date('2026-11-27T11:00:00.000Z'),
            endedAt: summaryFixtureNow, selectedFeedItemIds: [] }, items: [],
        }) },
        model, new PrismaSummaryExecutionWorkflow(withSummaryCommitFault(first.client, fault)),
        { generate: () => { const id = generated.generate(); allocated.push(id); return id; } },
        new FixedClock(summaryFixtureNow),
      );
      const command = { ...summaryFixtureCommand, summaryJobId: jobId };
      const result = await useCase.execute(command);
      assert.equal(model.calls, 1);
      assert.equal(model.classifications, 0, 'storage uncertainty must never be classified as a model error');
      assert.equal(result.ok, fault === 'after_commit');
      assert.equal((await state(jobId)).status, fault === 'after_commit' ? 'NO_SIGNAL' : 'RUNNING');
      assert.equal(await artifactCount(allocated[0]!), fault === 'after_commit' ? 1 : 0);
      assert.equal(await eventCount(allocated[1]!), fault === 'after_commit' ? 1 : 0);
      const replay = await useCase.execute(command);
      assert.equal(replay.ok, fault === 'after_commit');
      assert.equal(model.calls, 1, 'unknown finalization and terminal replay must not call the model again');
    }
  } finally {
    await first.close();
    await peer.close();
  }
}

class CountingSummaryModel extends DeterministicSummaryModelAdapter {
  calls = 0;
  classifications = 0;
  override async summarize(
    ...args: Parameters<DeterministicSummaryModelAdapter['summarize']>
  ): ReturnType<DeterministicSummaryModelAdapter['summarize']> {
    this.calls += 1;
    return super.summarize(...args);
  }
  override classifyError(
    ...args: Parameters<DeterministicSummaryModelAdapter['classifyError']>
  ): ReturnType<DeterministicSummaryModelAdapter['classifyError']> {
    this.classifications += 1;
    return super.classifyError(...args);
  }
}
