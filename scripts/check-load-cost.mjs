import { performance } from 'node:perf_hooks';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
require('ts-node/register');
require('tsconfig-paths/register');

const { FixedClock, tenantId, workspaceId } = require('@social-monitor/shared-kernel');
const { InMemoryUsageQuotaLedger } = require('../libs/usage/adapters/quota/in-memory-usage-quota-ledger');
const { ReserveUsageQuotaUseCase } = require('../libs/usage/features/reserve-usage-quota/reserve-usage-quota.use-case');

const useCase = new ReserveUsageQuotaUseCase(
  new InMemoryUsageQuotaLedger(),
  new FixedClock(new Date('2026-06-06T12:15:05.000Z')),
);

const scenarios = [
  {
    name: 'noisy-scan-tenant',
    tenantId: tenantId('tenant-load-noisy'),
    workspaceId: workspaceId('workspace-load-noisy'),
    operation: 'scan_request.manual',
    amount: 1,
    limit: 50,
    attempts: 75,
    expectedAllowed: 50,
    expectedRejected: 25,
  },
  {
    name: 'quiet-scan-tenant',
    tenantId: tenantId('tenant-load-quiet'),
    workspaceId: workspaceId('workspace-load-quiet'),
    operation: 'scan_request.manual',
    amount: 1,
    limit: 50,
    attempts: 10,
    expectedAllowed: 10,
    expectedRejected: 0,
  },
  {
    name: 'summary-cost-budget',
    tenantId: tenantId('tenant-load-summary'),
    workspaceId: workspaceId('workspace-load-summary'),
    operation: 'summary.generate',
    amount: 5,
    limit: 100,
    attempts: 25,
    expectedAllowed: 20,
    expectedRejected: 5,
  },
];

const violations = [];
const results = [];

for (const scenario of scenarios) {
  const latencies = [];
  let allowed = 0;
  let rejected = 0;

  for (let index = 0; index < scenario.attempts; index += 1) {
    const startedAt = performance.now();
    const result = await useCase.execute({
      tenantId: scenario.tenantId,
      workspaceId: scenario.workspaceId,
      subjectKey: `workspace:${scenario.tenantId}:${scenario.workspaceId}`,
      operation: scenario.operation,
      amount: scenario.amount,
      limit: scenario.limit,
      windowSeconds: 3600,
    });
    latencies.push(performance.now() - startedAt);

    if (result.ok) {
      allowed += 1;
    } else if (result.error.code === 'operation.quota_exceeded') {
      rejected += 1;
    } else {
      violations.push(`${scenario.name}: unexpected error ${result.error.code}`);
    }
  }

  const p95Milliseconds = percentile(latencies, 95);
  results.push({ ...scenario, allowed, rejected, p95Milliseconds });

  if (allowed !== scenario.expectedAllowed || rejected !== scenario.expectedRejected) {
    violations.push(
      `${scenario.name}: expected allowed/rejected ${scenario.expectedAllowed}/${scenario.expectedRejected}, got ${allowed}/${rejected}`,
    );
  }

  if (p95Milliseconds > 25) {
    violations.push(`${scenario.name}: p95 quota reservation latency ${p95Milliseconds.toFixed(2)}ms exceeds 25ms`);
  }
}

const noisy = results.find((result) => result.name === 'noisy-scan-tenant');
const quiet = results.find((result) => result.name === 'quiet-scan-tenant');
if (noisy?.rejected === 0 || quiet?.rejected !== 0) {
  violations.push('noisy tenant must hit quota without causing quiet tenant rejection');
}

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

for (const result of results) {
  console.log(
    `${result.name}: allowed=${result.allowed} rejected=${result.rejected} p95_ms=${result.p95Milliseconds.toFixed(2)}`,
  );
}
console.log('Load and cost guardrails OK');

function percentile(values, percentileRank) {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.ceil((percentileRank / 100) * sorted.length) - 1;

  return sorted[Math.max(index, 0)] ?? 0;
}
