import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';

import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { defaultMemoStackTimeoutMs } from '@social-monitor/summary/adapters/memory/memo-stack-memory-client';
import { MemoStackSummaryMemoryAdapter } from '@social-monitor/summary/adapters/memory/memo-stack-summary-memory.adapter';
import type { SummaryMemoryContext } from '@social-monitor/summary/ports';

import { writeLiveEvidenceArtifactAtomically } from './lib/live-evidence-artifact';

const evidencePathEnv = 'SUMMARY_MEMORY_RUNTIME_CANARY_EVIDENCE_PATH';
const baseUrl = requiredEnv('INFINITY_CONTEXT_URL');
const token = requiredEnv('INFINITY_CONTEXT_TOKEN');
const runId = readOptionalEnv('SUMMARY_MEMORY_RUNTIME_CANARY_RUN_ID') ?? `runtime-canary-${Date.now()}`;
const tenant = tenantId(`tenant-${runId}`);
const workspace = workspaceId(`workspace-${runId}`);
const topicId = `topic-${runId}`;
const userId = `user-${runId}`;
const subscriptionId = `subscription-${runId}`;
const requestedAt = new Date();

const memory = new MemoStackSummaryMemoryAdapter({
  baseUrl,
  token,
  timeoutMs: readPositiveIntegerEnv('SUMMARY_MEMORY_RUNTIME_CANARY_TIMEOUT_MS', defaultMemoStackTimeoutMs, 1_000, 60_000),
});

void main();

async function main(): Promise<void> {
  const before = await memory.buildContext(contextQuery());
  const write = await memory.recordSummaryFeedback({
    tenantId: tenant,
    workspaceId: workspace,
    topicId,
    summaryId: `summary-${runId}`,
    feedbackId: `feedback-${runId}`,
    idempotencyKey: `summary-memory-runtime-canary:${runId}`,
    submittedBy: userId,
    rating: 2,
    category: 'too_verbose',
    comment: 'Prefer shorter summaries and prioritize GitHub security evidence over low-signal Reddit.',
    citationId: 'c1',
    feedItemId: 'feed-github',
    sourceItemId: 'source-github',
    providerKey: 'github',
    createdAt: requestedAt,
  });
  assert.equal(write.status, 'written', 'runtime canary feedback must be written to memo-stack');

  const after = await waitForMemoryContext();
  assert.equal(after.status, 'available', 'runtime canary must retrieve written memory context');
  const memoryEffectMatched = runtimeCanaryMemoryEffectMatched(after);
  assert(
    memoryEffectMatched ||
      Number(after.retrieval?.factsUsed ?? after.diagnostics.facts_used ?? 0) > 0,
    'runtime canary memory context must include the written feedback fact or retrieval diagnostics',
  );

  writeOptionalEvidence(before, after, memoryEffectMatched);
  console.log([
    'Summary memory runtime canary OK',
    `Run id: ${runId}`,
    `Before status: ${before.status}`,
    `After status: ${after.status}`,
    `Facts used: ${String(after.retrieval?.factsUsed ?? after.diagnostics.facts_used ?? 'unknown')}`,
  ].join('\n'));
}

async function waitForMemoryContext(): Promise<SummaryMemoryContext> {
  let latest: SummaryMemoryContext | undefined;
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    latest = await memory.buildContext(contextQuery());
    if (latest.status === 'available') {
      return latest;
    }
    await sleep(500);
  }

  assert(latest !== undefined, 'runtime canary must attempt memory context retrieval');
  return latest;
}

function contextQuery(): Parameters<MemoStackSummaryMemoryAdapter['buildContext']>[0] {
  return {
    tenantId: tenant,
    workspaceId: workspace,
    topicId,
    userId,
    subscriptionId,
    requestedAt,
    evidence: {
      sourceWindow: {
        windowId: `window-${runId}`,
        startedAt: requestedAt,
        endedAt: new Date(requestedAt.getTime() + 1),
        selectedFeedItemIds: ['feed-github', 'feed-reddit', 'feed-hn', 'feed-rss'],
      },
      items: [
        evidenceItem('github', 'GitHub security advisory from runtime canary'),
        evidenceItem('reddit', 'Reddit discussion with mixed operational signal'),
        evidenceItem('hacker-news', 'Hacker News thread about incident learning'),
        evidenceItem('rss', 'RSS changelog for queue reliability'),
      ],
    },
  };
}

function evidenceItem(providerKey: string, title: string) {
  return {
    feedItemId: `feed-${providerKey}`,
    sourceItemId: `source-${providerKey}`,
    sourceBindingId: `binding-${providerKey}`,
    providerKey,
    title,
    observedAt: requestedAt,
  };
}

function writeOptionalEvidence(
  before: SummaryMemoryContext,
  after: SummaryMemoryContext,
  memoryEffectMatched: boolean,
): void {
  const path = readOptionalEnv(evidencePathEnv);
  if (path === undefined) {
    return;
  }

  writeLiveEvidenceArtifactAtomically(path, `${JSON.stringify({
    schemaVersion: 1,
    artifactId: 'summary-memory-runtime-canary-v1',
    generatedAt: new Date().toISOString(),
    runId,
    baseUrlOrigin: safeOrigin(baseUrl),
    result: {
      beforeStatus: before.status,
      afterStatus: after.status,
      afterFactsUsed: after.retrieval?.factsUsed ?? after.diagnostics.facts_used ?? null,
      memoryEffectMatched,
      supportStatus: after.support?.status ?? null,
    },
    redaction: {
      tokenIncluded: false,
      rawAuthorizationHeaderIncluded: false,
      rawMemoryTextIncluded: false,
      rawSourceTextIncluded: false,
    },
  }, null, 2)}\n`, evidencePathEnv);
}

function runtimeCanaryMemoryEffectMatched(context: SummaryMemoryContext): boolean {
  const rendered = String(context.renderedText ?? '').toLowerCase();

  return rendered.includes('shorter') || rendered.includes('github security') || rendered.includes('low-signal reddit');
}

function safeOrigin(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return 'invalid-url-redacted';
  }
}

function requiredEnv(name: string): string {
  const value = readOptionalEnv(name);
  if (value === undefined) {
    throw new Error(`${name} is required for summary memory runtime canary`);
  }

  return value;
}

function readOptionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
}

function readPositiveIntegerEnv(name: string, fallback: number, min: number, max: number): number {
  const value = readOptionalEnv(name);
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }

  return parsed;
}
