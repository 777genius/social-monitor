import { performance } from 'node:perf_hooks';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

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
const capacityContractPath = 'ops/release/capacity-envelope-beta-ring-decision.json';
const capacityContract = JSON.parse(readFileSync(capacityContractPath, 'utf8'));
const capacityLimits = capacityContract.limits ?? {};
const manualScanLimit = positiveIntegerLimit('maxManualScansPerWorkspacePerHour');
const summaryRequestLimit = positiveIntegerLimit('maxSummaryRequestsPerWorkspacePerHour');
const deliveryAttemptLimit = positiveIntegerLimit('maxDeliveryAttemptsPerWorkspacePerHour');
const summaryQuotaUnit = 5;
const quietScanAttempts = Math.min(10, manualScanLimit);

const scenarios = [
  {
    name: 'noisy-scan-tenant',
    tenantId: tenantId('tenant-load-noisy'),
    workspaceId: workspaceId('workspace-load-noisy'),
    operation: 'scan_request.manual',
    amount: 1,
    limit: manualScanLimit,
    attempts: manualScanLimit + 25,
    expectedAllowed: manualScanLimit,
    expectedRejected: 25,
  },
  {
    name: 'quiet-scan-tenant',
    tenantId: tenantId('tenant-load-quiet'),
    workspaceId: workspaceId('workspace-load-quiet'),
    operation: 'scan_request.manual',
    amount: 1,
    limit: manualScanLimit,
    attempts: quietScanAttempts,
    expectedAllowed: quietScanAttempts,
    expectedRejected: 0,
  },
  {
    name: 'summary-cost-budget',
    tenantId: tenantId('tenant-load-summary'),
    workspaceId: workspaceId('workspace-load-summary'),
    operation: 'summary.generate',
    amount: summaryQuotaUnit,
    limit: summaryRequestLimit * summaryQuotaUnit,
    attempts: summaryRequestLimit + 5,
    expectedAllowed: summaryRequestLimit,
    expectedRejected: 5,
  },
  {
    name: 'delivery-attempt-budget',
    tenantId: tenantId('tenant-load-delivery'),
    workspaceId: workspaceId('workspace-load-delivery'),
    operation: 'delivery.attempt',
    amount: 1,
    limit: deliveryAttemptLimit,
    attempts: deliveryAttemptLimit + 5,
    expectedAllowed: deliveryAttemptLimit,
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

function positiveIntegerLimit(field) {
  const value = capacityLimits[field];
  if (!Number.isInteger(value) || value <= 0) {
    console.error(`${capacityContractPath}: limits.${field} must be a positive integer`);
    process.exit(1);
  }

  return value;
}
