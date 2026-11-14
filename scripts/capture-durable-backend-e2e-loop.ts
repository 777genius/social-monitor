import { randomUUID } from "node:crypto";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { minimumScanIntervalSecondsForProvider } from "@social-monitor/monitoring/features/shared/scan-cadence-policy";
import { defaultMemoStackTimeoutMs } from "@social-monitor/summary/adapters/memory/memo-stack-memory-client";
import { MemoStackSummaryMemoryAdapter } from "@social-monitor/summary/adapters/memory/memo-stack-summary-memory.adapter";
import type { SummaryMemoryContext } from "@social-monitor/summary/ports";
import { Pool } from "pg";

import { createDurableBackendHttpClient } from "./lib/durable-backend-e2e-http-client";
import { summaryMemoryContextQuery } from "./lib/durable-backend-e2e-summary-memory-query";
import { autoSummaryEvidenceSnapshot, durableCounts, scheduledScanEvidenceSnapshot, seedDurableIdentity } from "./lib/durable-backend-e2e-pg-evidence";
import { emptyToUndefined, loadConfig } from "./lib/durable-backend-e2e-config";
import { writeFrontendRuntimeEnvFile } from "./lib/durable-backend-e2e-frontend-env";
import { authHeaders, resolveAccessToken, withIdempotency, type AuthContext } from "./lib/durable-backend-e2e-auth";
import { createDurableScanTargets, type DurableScanProviderKey, type DurableScanTarget } from "./lib/durable-backend-e2e-scan-targets";
import {
  assertProviderCitationCoverage,
  providerCitationCoverage,
  type ProviderCitationCoverage,
} from "./lib/durable-backend-e2e-citation-coverage";

import {
  safeMemoryContextDebug,
  summaryMemoryEvidenceSnapshot,
  type SummaryMemoryEvidence,
} from "./lib/durable-backend-e2e-summary-memory-evidence";

import {
  isRecord,
  readFirst,
  readNumber,
  readObjectArray,
  readRecord,
  readString,
  readStringArray,
  type JsonRecord,
} from "./lib/durable-backend-e2e-json-fields";

type RuntimeIds = {
  readonly runId: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly userId: string;
  readonly membershipId: string;
};



type SignalResult = {
  readonly signalId: string;
  readonly status: "passed";
  readonly observedAt: string;
  readonly evidence: JsonRecord;
};

type SourceBindingEvidence = {
  readonly providerKey: DurableScanProviderKey;
  readonly sourceBindingId: string;
  readonly scanPolicyId: string;
  readonly scanId: string;
  readonly feedItemCount: number;
  readonly feedItemIds: readonly string[];
  readonly feedProviderKeys: readonly string[];
};

type ScheduledScanEvidence = {
  readonly providerKey: DurableScanProviderKey;
  readonly sourceBindingId: string;
  readonly scanPolicyId: string;
  readonly scanJobId: string;
  readonly scheduledIdempotencyKey: string;
  readonly status: "SUCCEEDED";
  readonly completedAt: string;
  readonly nextRunAtAfterSchedule: string;
  readonly feedItemCount: number;
  readonly feedItemIds: readonly string[];
};

type AutoSummaryEvidence = {
  readonly summaryPolicyId: string;
  readonly summaryJobId: string;
  readonly summaryId: string;
  readonly idempotencyKey: string;
  readonly status: "completed" | "no_signal";
  readonly requestedAt: string;
  readonly completedAt: string;
  readonly latestFeedItemObservedAt: string;
  readonly newFeedItemCount: number;
};

type ReaderBriefEvidence = {
  readonly readerSummaryJobId: string;
  readonly readerSummaryId: string;
  readonly headline: string;
  readonly topReadCount: number;
  readonly topReadTitles: readonly string[];
  readonly sourceMixProviderKeys: readonly string[];
  readonly citationProviderKeys: readonly string[];
  readonly citationCoverage: ProviderCitationCoverage;
  readonly qualityStatus: string;
};


const config = loadConfig(defaultMemoStackTimeoutMs);
const { durableScanTargets, scheduledScanTarget } = createDurableScanTargets({ process, emptyToUndefined });
const { pollJson, requestStatus, requestJsonWithContext, requestJson } =
  createDurableBackendHttpClient(config, { isRecord, delay });
const ids: RuntimeIds = {
  runId: `run-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`,
  tenantId: randomUUID(),
  workspaceId: randomUUID(),
  userId: randomUUID(),
  membershipId: randomUUID(),
};
const pool = new Pool({ connectionString: config.databaseUrl, min: 0, max: 2 });
const startedAt = nowIso();
const DIGEST_EVIDENCE_FIRST_RUN_DELAY_MS = 3_000;
const DIGEST_EVIDENCE_WINDOW_PADDING_MS = 30_000;
const MIN_DIGEST_EVIDENCE_INTERVAL_SECONDS = 60;

void main().catch(async (error: unknown) => {
  await pool.end().catch(() => undefined);
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

async function main(): Promise<void> {
  try {
    await assertReady();
    await seedDurableIdentity(pool, ids);

    const auth: AuthContext = {
      tenantId: ids.tenantId,
      workspaceId: ids.workspaceId,
      token: resolveAccessToken(config, ids),
    };
    writeFrontendRuntimeEnvFile(config, auth, ids);
    const evidence = await executeBackendLoop(auth, ids);
    const completedAt = nowIso();
    const signalObservedAt = completedAt;
    const artifact = {
      schemaVersion: 1,
      format: "staging-reliability-artifact-v1",
      artifactId: "durable-backend-e2e-output",
      environmentId: config.environmentId,
      imageDigest: config.imageDigest,
      operator: config.operator,
      apiBaseUrl: config.apiBaseUrl,
      startedAt,
      completedAt,
      provenance: {
        evidenceKind: "staging_drill",
        collectionMethod: "Docker Compose durable backend e2e loop capture.",
        runner: "scripts/capture-durable-backend-e2e-loop.ts",
        fixtureOnly: false,
      },
      redaction: {
        secretsIncluded: false,
        rawProviderPayloadsIncluded: false,
        databaseUrlsIncluded: false,
        brokerUrlsIncluded: false,
      },
      signalResults: [
        signalResult(
          "backend-loop-topic-to-delivery-audit",
          {
            summary:
              "topic multi-source scan feed summary feedback digest webhook realtime audit loop observed on durable runtime",
            interestId: evidence.interestId,
            sourceBindingId: evidence.sourceBindingId,
            scanId: evidence.scanId,
            providerBindings: evidence.sourceBindings,
            providerFeedCounts: evidence.providerFeedCounts,
            feedItemIds: evidence.feedItemIds,
            summaryId: evidence.summaryId,
            summaryCitationProviderKeys: evidence.summaryCitationProviderKeys,
            summaryCitationCoverage: evidence.summaryCitationCoverage,
            feedbackId: evidence.feedbackId,
            feedbackProviderKey: evidence.feedbackProviderKey,
            digestId: evidence.digestId,
            webhookEndpointId: evidence.webhookEndpointId,
            webhookDeliveryAttemptId: evidence.webhookDeliveryAttemptId,
            realtimeEventId: evidence.realtimeEventId,
            auditEventIds: evidence.auditEventIds,
          },
          signalObservedAt,
        ),
        signalResult(
          "backend-loop-scheduled-scan",
          {
            summary:
              "scan policy was executed by the ingestion scheduler without a manual scan request",
            scheduledScan: evidence.scheduledScan,
            manualScanIdempotencyKeyUsed: false,
          },
          signalObservedAt,
        ),
        signalResult(
          "backend-loop-auto-summary-scheduler",
          {
            summary:
              "summary policy automatically requested a summary job after new feed evidence became stable",
            autoSummary: evidence.autoSummary,
            manualSummaryRequestUsed: false,
          },
          signalObservedAt,
        ),
        signalResult(
          "backend-loop-reader-brief",
          {
            summary:
              "reader readerSummary was generated from durable feed evidence with top reads, citations and source mix",
            readerBrief: evidence.readerBrief,
          },
          signalObservedAt,
        ),
        signalResult(
          "backend-loop-summary-memory",
          {
            summary:
              "summary feedback was projected into memo-stack and retrieved by topic and provider memory scopes",
            summaryId: evidence.summaryId,
            feedbackId: evidence.feedbackId,
            feedbackProviderKey: evidence.feedbackProviderKey,
            memory: evidence.memoryEvidence,
            rawMemoryTextIncluded: false,
          },
          signalObservedAt,
        ),
        signalResult(
          "backend-loop-tenant-isolation",
          {
            summary:
              "wrong tenant and wrong workspace checks denied durable data access",
            negativeChecks: evidence.negativeChecks,
            wrongTenantStatus: evidence.wrongTenantStatus,
            wrongWorkspaceStatus: evidence.wrongWorkspaceStatus,
            leakageObserved: false,
          },
          signalObservedAt,
        ),
        signalResult(
          "backend-loop-idempotency",
          {
            summary:
              "idempotency keys replayed without duplicate durable side effects",
            idempotencyKeys: evidence.idempotencyKeys,
            responseIds: evidence.responseIds,
            stableDurableCounts: evidence.stableDurableCounts,
            duplicateSideEffectsObserved: false,
          },
          signalObservedAt,
        ),
      ] satisfies readonly SignalResult[],
    };

    mkdirSync(dirname(config.outputPath), { recursive: true });
    writeFileSync(config.outputPath, `${JSON.stringify(artifact, null, 2)}\n`, {
      mode: 0o600,
    });
    chmodSync(config.outputPath, 0o600);
    console.log(config.outputPath);
  } finally {
    await pool.end();
  }
}

async function executeBackendLoop(
  auth: AuthContext,
  runtimeIds: RuntimeIds,
): Promise<{
  readonly interestId: string;
  readonly sourceBindingId: string;
  readonly sourceBindings: readonly SourceBindingEvidence[];
  readonly providerFeedCounts: readonly JsonRecord[];
  readonly scheduledScan: ScheduledScanEvidence;
  readonly autoSummary: AutoSummaryEvidence;
  readonly scanId: string;
  readonly feedItemIds: readonly string[];
  readonly summaryId: string;
  readonly summaryCitationProviderKeys: readonly string[];
  readonly summaryCitationCoverage: ProviderCitationCoverage;
  readonly readerBrief: ReaderBriefEvidence;
  readonly feedbackId: string;
  readonly feedbackProviderKey: string;
  readonly memoryEvidence: SummaryMemoryEvidence;
  readonly digestId: string;
  readonly webhookEndpointId: string;
  readonly webhookDeliveryAttemptId: string;
  readonly realtimeEventId: string;
  readonly auditEventIds: readonly string[];
  readonly negativeChecks: readonly JsonRecord[];
  readonly wrongTenantStatus: number;
  readonly wrongWorkspaceStatus: number;
  readonly idempotencyKeys: readonly string[];
  readonly responseIds: readonly string[];
  readonly stableDurableCounts: JsonRecord;
}> {
  const loopStartedAt = new Date();
  const headers = authHeaders(auth);
  const topicKey = `topic-${runtimeIds.runId}`;
  const summaryKey = `summary-${runtimeIds.runId}`;
  const readerSummaryKey = `readerSummary-${runtimeIds.runId}`;
  const feedbackKey = `feedback-${runtimeIds.runId}`;
  const scanTargets = durableScanTargets();
  const topic = await requestJson<JsonRecord>("POST", "/interests", {
    headers: withIdempotency(headers, topicKey),
    body: {
      name: `Durable Multi-Provider Backend Loop ${runtimeIds.runId}`,
      query:
        "backend reliability observability social monitoring developer tools",
    },
  });
  const interestId = readString(topic, "interestId");
  const summaryPolicy = await requestJson<JsonRecord>(
    "PUT",
    `/interests/${encodeURIComponent(interestId)}/summary-policy`,
    {
      headers,
      body: {
        language: "auto",
        format: "bullet_digest",
        tone: "concise",
        maxKeyPoints: 10,
        includeRisks: true,
        includeSourceHighlights: true,
        customInstructions:
          "Automatically summarize stable feed evidence across all configured backend sources.",
      },
    },
  );
  const summaryPolicyId = readString(
    readRecord(summaryPolicy, "policy"),
    "summaryPolicyId",
  );

  const sourceBindings: Array<
    Omit<
      SourceBindingEvidence,
      "feedItemCount" | "feedItemIds" | "feedProviderKeys"
    >
  > = [];
  for (const target of scanTargets) {
    sourceBindings.push(
      await createSourceBindingAndScan({
        headers,
        interestId,
        target,
        runId: runtimeIds.runId,
      }),
    );
  }
  const scheduledTopic = await requestJson<JsonRecord>("POST", "/interests", {
    headers: withIdempotency(
      headers,
      scheduledInterestIdempotencyKey(runtimeIds.runId),
    ),
    body: {
      name: `Durable Scheduled Backend Loop ${runtimeIds.runId}`,
      query: "backend release notes reliability newest",
    },
  });
  const scheduledInterestId = readString(scheduledTopic, "interestId");
  const scheduledScan = await createScheduledSourceBindingAndWait({
    headers,
    interestId: scheduledInterestId,
    target: scheduledScanTarget(),
    runId: runtimeIds.runId,
  });

  const feed = await pollJson<JsonRecord>(
    `/feed/items?interestId=${encodeURIComponent(interestId)}&limit=100`,
    headers,
    (page) => {
      const items = readObjectArray(page, "items");
      const sourceBindingIds = new Set(
        items.map((item) => readString(item, "sourceBindingId")),
      );

      return sourceBindings.every(
        (binding) =>
          sourceBindingIds.has(binding.sourceBindingId) &&
          items.some(
            (item) =>
              readString(item, "sourceBindingId") === binding.sourceBindingId &&
              readString(item, "providerKey") === binding.providerKey,
          ),
      )
        ? page
        : undefined;
    },
    { timeoutMs: 120_000, label: "multi-provider feed projection" },
  );
  const feedItems = readObjectArray(feed, "items");
  const feedItemIds = feedItems
    .map((item) => readString(item, "id"))
    .slice(0, 5);
  const bindingsWithFeed = sourceBindings.map(
    (binding): SourceBindingEvidence => {
      const bindingFeedItems = feedItems.filter(
        (item) =>
          readString(item, "sourceBindingId") === binding.sourceBindingId,
      );
      const providerKeys = [
        ...new Set(
          bindingFeedItems.map((item) => readString(item, "providerKey")),
        ),
      ].sort();

      if (
        providerKeys.length !== 1 ||
        providerKeys[0] !== binding.providerKey
      ) {
        throw new Error(
          `feed items for ${binding.providerKey} binding ${binding.sourceBindingId} have provider keys ${providerKeys.join(",")}`,
        );
      }

      return {
        ...binding,
        feedItemCount: bindingFeedItems.length,
        feedItemIds: bindingFeedItems
          .map((item) => readString(item, "id"))
          .slice(0, 5),
        feedProviderKeys: providerKeys,
      };
    },
  );
  const primaryBinding = readFirst(bindingsWithFeed, "source binding evidence");
  const autoSummary = await pollAutoSummaryEvidence(
    {
      tenantId: ids.tenantId,
      workspaceId: ids.workspaceId,
      interestId,
      summaryPolicyId,
    },
    {
      timeoutMs: 180_000,
      label: "auto-summary scheduler completion",
    },
  );

  const summary = await requestJson<JsonRecord>(
    "POST",
    `/interests/${encodeURIComponent(interestId)}/summary-requests`,
    {
      headers: withIdempotency(headers, summaryKey),
    },
  );
  const summaryJobId = readString(summary, "summaryJobId");
  const summaryStatus = await pollJson<JsonRecord>(
    `/summary-jobs/${encodeURIComponent(summaryJobId)}/status`,
    headers,
    (status) => {
      const value = readString(status, "status");
      if (value === "failed" || value === "rejected") {
        throw new Error(
          `summary job ${summaryJobId} ended with ${value}: ${String(status.failureReason ?? "")}`,
        );
      }

      return value === "completed" || value === "no_signal"
        ? status
        : undefined;
    },
    { timeoutMs: 120_000, label: "summary completion" },
  );
  const summaryId = readString(summaryStatus, "summaryId");
  const summaryArtifact = await requestJson<JsonRecord>(
    "GET",
    `/summaries/${encodeURIComponent(summaryId)}`,
    { headers },
  );
  const citations = readObjectArray(summaryArtifact, "citations");
  const firstCitationId =
    citations.length === 0
      ? undefined
      : readString(citations[0] ?? {}, "citationId");
  const summaryCitationProviderKeys = [
    ...new Set(
      citations.map((citation) => readString(citation, "providerKey")),
    ),
  ].sort();
  const summaryCitationCoverage = providerCitationCoverage(
    bindingsWithFeed.map((item) => item.providerKey),
    summaryCitationProviderKeys,
  );
  assertProviderCitationCoverage("summary", summaryCitationCoverage, {
    providerFeedCounts: bindingsWithFeed.map((item) => ({
      providerKey: item.providerKey,
      feedItemCount: item.feedItemCount,
      feedProviderKeys: item.feedProviderKeys,
    })),
    citationCount: citations.length,
  });
  const readerBrief = await captureReaderBriefEvidence({
    headers,
    idempotencyKey: readerSummaryKey,
    expectedProviderKeys: bindingsWithFeed.map(
      (binding) => binding.providerKey,
    ),
  });

  const realtimeChannel = `interest:${interestId}:summary-status`;
  const realtime = await pollJson<JsonRecord>(
    `/realtime/events?channel=${encodeURIComponent(realtimeChannel)}&limit=20`,
    headers,
    (page) => {
      const events = readObjectArray(page, "events");
      return events.find(
        (event) => readString(event, "resourceId") === summaryId,
      );
    },
    { timeoutMs: 90_000, label: "summary realtime projection" },
  );
  const realtimeEventId = readString(realtime, "id");

  const feedback = await requestJson<JsonRecord>(
    "POST",
    `/summaries/${encodeURIComponent(summaryId)}/feedback`,
    {
      headers: {
        ...withIdempotency(headers, feedbackKey),
        "x-actor-id": runtimeIds.userId,
      },
      body: {
        category: "bad_citation",
        rating: 4,
        comment:
          "Citation reviewed during durable backend loop evidence capture.",
        ...(firstCitationId === undefined
          ? {}
          : { citationId: firstCitationId }),
      },
    },
  );
  const feedbackId = readString(feedback, "feedbackId");
  const feedbackEvidence = readRecord(feedback, "evidence");
  const feedbackProviderKey = readString(feedbackEvidence, "providerKey");
  if (
    firstCitationId !== undefined &&
    !summaryCitationProviderKeys.includes(feedbackProviderKey)
  ) {
    throw new Error(
      `feedback provider key ${feedbackProviderKey} must match a summary citation provider`,
    );
  }
  const memoryEvidence = await pollSummaryMemoryEvidence(
    {
      tenantId: auth.tenantId,
      workspaceId: auth.workspaceId,
      userId: runtimeIds.userId,
      interestId,
      summaryId,
      feedbackId,
      feedbackProviderKey,
      feedItems,
    },
    {
      timeoutMs: 180_000,
      label: "summary feedback memory projection",
    },
  );

  const webhook = await requestJson<JsonRecord>(
    "POST",
    "/delivery/webhook-endpoints",
    {
      headers,
      body: {
        url: config.webhookUrl,
        eventTypes: ["digest.ready.v1"],
      },
    },
  );
  const webhookEndpoint = readRecord(webhook, "endpoint");
  const webhookEndpointId = readString(webhookEndpoint, "id");
  const digestScheduleWindow = durableDeliveryDigestScheduleWindow({
    loopStartedAt,
    scheduledAt: new Date(),
  });

  await requestJson<JsonRecord>("POST", "/delivery/digest-schedules", {
    headers,
    body: {
      recipientKey: webhookEndpointId,
      channel: "webhook",
      interestIds: [interestId],
      intervalSeconds: digestScheduleWindow.intervalSeconds,
      includeNoSignal: true,
      nextRunAt: digestScheduleWindow.nextRunAt.toISOString(),
    },
  });

  const deliveryAttempt = await pollJson<JsonRecord>(
    "/delivery/attempts?limit=20",
    headers,
    (page) => {
      const attempts = readObjectArray(page, "attempts");
      return attempts.find(
        (attempt) =>
          readString(attempt, "recipientKey") === webhookEndpointId &&
          readString(attempt, "resourceType") === "digest" &&
          readString(attempt, "state") !== "queued",
      );
    },
    { timeoutMs: 180_000, label: "digest webhook delivery attempt" },
  );
  const webhookDeliveryAttemptId = readString(deliveryAttempt, "id");
  const digestId = readString(deliveryAttempt, "resourceId");
  await requestJson<JsonRecord>(
    "GET",
    `/delivery/digests/${encodeURIComponent(digestId)}`,
    { headers },
  );

  const auditPage = await pollJson<JsonRecord>(
    "/usage/audit-events?limit=50",
    headers,
    (page) => {
      const auditEvents = readObjectArray(page, "auditEvents");
      return auditEvents.length >= 4 ? page : undefined;
    },
    { timeoutMs: 60_000, label: "audit events" },
  );
  const auditEventIds = readObjectArray(auditPage, "auditEvents")
    .map((event) => readString(event, "id"))
    .slice(0, 8);

  const wrongTenantAuth = {
    tenantId: randomUUID(),
    workspaceId: auth.workspaceId,
    token: resolveAccessToken(config, {
      ...runtimeIds,
      tenantId: randomUUID(),
      workspaceId: auth.workspaceId,
    }),
  };
  const wrongWorkspaceAuth = {
    tenantId: auth.tenantId,
    workspaceId: randomUUID(),
    token: resolveAccessToken(config, {
      ...runtimeIds,
      tenantId: auth.tenantId,
      workspaceId: randomUUID(),
    }),
  };
  const wrongTenantStatus = await requestStatus(
    "/feed/items?limit=1",
    authHeaders(wrongTenantAuth),
  );
  const wrongWorkspaceStatus = await requestStatus(
    `/summaries/${encodeURIComponent(summaryId)}`,
    authHeaders(wrongWorkspaceAuth),
  );
  const auditWrongWorkspaceStatus = await requestStatus(
    "/usage/audit-events?limit=1",
    authHeaders(wrongWorkspaceAuth),
  );
  if (
    wrongTenantStatus < 400 ||
    wrongWorkspaceStatus < 400 ||
    auditWrongWorkspaceStatus < 400
  ) {
    throw new Error("tenant isolation negative checks did not deny access");
  }

  const countsBeforeReplay = await durableCounts(
    pool,
    auth.tenantId,
    auth.workspaceId,
  );
  const replayedTopic = await requestJson<JsonRecord>("POST", "/interests", {
    headers: withIdempotency(headers, topicKey),
    body: {
      name: `Durable Backend Loop ${runtimeIds.runId}`,
      query: "backend reliability observability",
    },
  });
  const replayedScan = await requestJson<JsonRecord>(
    "POST",
    `/source-bindings/${encodeURIComponent(primaryBinding.sourceBindingId)}/scan-requests`,
    {
      headers: withIdempotency(
        headers,
        scanIdempotencyKey(primaryBinding.providerKey, runtimeIds.runId),
      ),
    },
  );
  const replayedSummary = await requestJson<JsonRecord>(
    "POST",
    `/interests/${encodeURIComponent(interestId)}/summary-requests`,
    {
      headers: withIdempotency(headers, summaryKey),
    },
  );
  const countsAfterReplay = await durableCounts(
    pool,
    auth.tenantId,
    auth.workspaceId,
  );
  if (
    JSON.stringify(countsBeforeReplay) !== JSON.stringify(countsAfterReplay)
  ) {
    throw new Error("durable counts changed after idempotency replay");
  }

  return {
    interestId,
    sourceBindingId: primaryBinding.sourceBindingId,
    sourceBindings: bindingsWithFeed,
    providerFeedCounts: bindingsWithFeed.map((binding) => ({
      providerKey: binding.providerKey,
      sourceBindingId: binding.sourceBindingId,
      feedItemCount: binding.feedItemCount,
      feedProviderKeys: binding.feedProviderKeys,
      scanId: binding.scanId,
    })),
    scheduledScan,
    autoSummary,
    scanId: primaryBinding.scanId,
    feedItemIds,
    summaryId,
    summaryCitationProviderKeys,
    summaryCitationCoverage,
    readerBrief,
    feedbackId,
    feedbackProviderKey,
    memoryEvidence,
    digestId,
    webhookEndpointId,
    webhookDeliveryAttemptId,
    realtimeEventId,
    auditEventIds,
    negativeChecks: [
      {
        surface: "feed",
        expectedStatusAtLeast: 400,
        observedStatus: wrongTenantStatus,
      },
      {
        surface: "summary",
        expectedStatusAtLeast: 400,
        observedStatus: wrongWorkspaceStatus,
      },
      {
        surface: "audit",
        expectedStatusAtLeast: 400,
        observedStatus: auditWrongWorkspaceStatus,
      },
    ],
    wrongTenantStatus,
    wrongWorkspaceStatus,
    idempotencyKeys: [
      topicKey,
      scheduledInterestIdempotencyKey(runtimeIds.runId),
      scheduledBindingIdempotencyKey(runtimeIds.runId),
      scheduledPolicyIdempotencyKey(runtimeIds.runId),
      scheduledScan.scheduledIdempotencyKey,
      autoSummary.idempotencyKey,
      ...scanTargets.flatMap((target) => [
        bindingIdempotencyKey(target.providerKey, runtimeIds.runId),
        policyIdempotencyKey(target.providerKey, runtimeIds.runId),
        scanIdempotencyKey(target.providerKey, runtimeIds.runId),
      ]),
      summaryKey,
      readerSummaryKey,
      feedbackKey,
    ],
    responseIds: [
      readString(replayedTopic, "interestId"),
      scheduledScan.scanJobId,
      autoSummary.summaryJobId,
      readString(replayedScan, "scanJobId"),
      readString(replayedSummary, "summaryJobId"),
      webhookDeliveryAttemptId,
    ],
    stableDurableCounts: countsAfterReplay,
  };
}

async function createSourceBindingAndScan(params: {
  readonly headers: Readonly<Record<string, string>>;
  readonly interestId: string;
  readonly target: DurableScanTarget;
  readonly runId: string;
}): Promise<
  Omit<
    SourceBindingEvidence,
    "feedItemCount" | "feedItemIds" | "feedProviderKeys"
  >
> {
  const binding = await requestJson<JsonRecord>(
    "POST",
    `/interests/${encodeURIComponent(params.interestId)}/source-bindings`,
    {
      headers: withIdempotency(
        params.headers,
        bindingIdempotencyKey(params.target.providerKey, params.runId),
      ),
      body: {
        providerKey: params.target.providerKey,
        config: params.target.config,
      },
    },
  );
  const sourceBindingId = readString(binding, "sourceBindingId");
  const scanCadence = durableScanPolicyCadence(params.target.providerKey);
  const policy = await requestJson<JsonRecord>(
    "POST",
    `/source-bindings/${encodeURIComponent(sourceBindingId)}/scan-policy`,
    {
      headers: withIdempotency(
        params.headers,
        policyIdempotencyKey(params.target.providerKey, params.runId),
      ),
      body: {
        intervalSeconds: scanCadence.intervalSeconds,
        freshnessSeconds: scanCadence.freshnessSeconds,
        retryBudget: 3,
      },
    },
  );
  const scanPolicyId = readString(policy, "scanPolicyId");
  const scan = await requestJsonWithContext<JsonRecord>(
    `manual ${params.target.providerKey} scan request for source binding ${sourceBindingId}`,
    "POST",
    `/source-bindings/${encodeURIComponent(sourceBindingId)}/scan-requests`,
    {
      headers: withIdempotency(
        params.headers,
        scanIdempotencyKey(params.target.providerKey, params.runId),
      ),
    },
  );
  const scanId = readString(scan, "scanJobId");
  await pollJson<JsonRecord>(
    `/scan-requests/${encodeURIComponent(scanId)}/status`,
    params.headers,
    (status) => {
      const scanStatus = readString(status, "status");
      if (scanStatus === "failed" || scanStatus === "cancelled") {
        throw new Error(
          `scan job ${scanId} for ${params.target.providerKey} ended with ${scanStatus}: ${String(status.failureReason ?? "")}`,
        );
      }

      return scanStatus === "succeeded" ? status : undefined;
    },
    {
      timeoutMs: 180_000,
      label: `${params.target.providerKey} scan completion`,
    },
  );

  return {
    providerKey: params.target.providerKey,
    sourceBindingId,
    scanPolicyId,
    scanId,
  };
}

async function createScheduledSourceBindingAndWait(params: {
  readonly headers: Readonly<Record<string, string>>;
  readonly interestId: string;
  readonly target: DurableScanTarget;
  readonly runId: string;
}): Promise<ScheduledScanEvidence> {
  const binding = await requestJson<JsonRecord>(
    "POST",
    `/interests/${encodeURIComponent(params.interestId)}/source-bindings`,
    {
      headers: withIdempotency(
        params.headers,
        scheduledBindingIdempotencyKey(params.runId),
      ),
      body: {
        providerKey: params.target.providerKey,
        config: params.target.config,
      },
    },
  );
  const sourceBindingId = readString(binding, "sourceBindingId");
  const scanCadence = durableScanPolicyCadence(params.target.providerKey);
  const policy = await requestJson<JsonRecord>(
    "POST",
    `/source-bindings/${encodeURIComponent(sourceBindingId)}/scan-policy`,
    {
      headers: withIdempotency(
        params.headers,
        scheduledPolicyIdempotencyKey(params.runId),
      ),
      body: {
        intervalSeconds: scanCadence.intervalSeconds,
        freshnessSeconds: scanCadence.freshnessSeconds,
        retryBudget: 3,
      },
    },
  );
  const scanPolicyId = readString(policy, "scanPolicyId");

  return pollScheduledScanEvidence(
    {
      tenantId: ids.tenantId,
      workspaceId: ids.workspaceId,
      providerKey: params.target.providerKey,
      sourceBindingId,
      scanPolicyId,
    },
    {
      timeoutMs: 180_000,
      label: `${params.target.providerKey} scheduled scan completion`,
    },
  );
}

async function captureReaderBriefEvidence(params: {
  readonly headers: Readonly<Record<string, string>>;
  readonly idempotencyKey: string;
  readonly expectedProviderKeys: readonly DurableScanProviderKey[];
}): Promise<ReaderBriefEvidence> {
  const request = await requestJson<JsonRecord>("POST", "/reader-summary-requests", {
    headers: withIdempotency(params.headers, params.idempotencyKey),
    body: {
      scope: {
        type: "workspace",
      },
    },
  });
  const readerSummaryJobId = readString(request, "readerSummaryJobId");
  const status = await pollJson<JsonRecord>(
    `/reader-summary-jobs/${encodeURIComponent(readerSummaryJobId)}/status`,
    params.headers,
    (value) => {
      const jobStatus = readString(value, "status");
      if (jobStatus === "failed") {
        throw new Error(
          `readerSummary job ${readerSummaryJobId} failed: ${String(value.failureReason ?? "")}`,
        );
      }

      return jobStatus === "completed" ? value : undefined;
    },
    { timeoutMs: 120_000, label: "reader readerSummary completion" },
  );
  const readerSummaryId = readString(status, "readerSummaryId");
  const readerSummary = await requestJson<JsonRecord>(
    "GET",
    `/reader-summaries/${encodeURIComponent(readerSummaryId)}`,
    {
      headers: params.headers,
    },
  );
  const readerBrief = readRecord(readerSummary, "readerBrief");
  const topReads = readObjectArray(readerBrief, "topReads");
  const sourceMix = readObjectArray(readerBrief, "sourceMix");
  const citations = readObjectArray(readerSummary, "citations");
  const qualityState = readRecord(readerBrief, "qualityState");
  const sourceMixProviderKeys = [
    ...new Set(sourceMix.map((entry) => readString(entry, "providerKey"))),
  ].sort();
  const citationProviderKeys = [
    ...new Set(
      citations.map((citation) => readString(citation, "providerKey")),
    ),
  ].sort();
  const citationCoverage = providerCitationCoverage(
    params.expectedProviderKeys,
    citationProviderKeys,
  );

  if (topReads.length < 3) {
    throw new Error(
      `reader brief must expose at least three top reads, got ${topReads.length}`,
    );
  }
  for (const providerKey of params.expectedProviderKeys) {
    if (!sourceMixProviderKeys.includes(providerKey)) {
      throw new Error(
        `reader brief source mix must include ${providerKey}: ${JSON.stringify(sourceMixProviderKeys)}`,
      );
    }
  }
  assertProviderCitationCoverage("reader brief", citationCoverage, {
    sourceMixProviderKeys,
    citationCount: citations.length,
  });

  return {
    readerSummaryJobId,
    readerSummaryId,
    headline: readString(readerSummary, "headline"),
    topReadCount: topReads.length,
    topReadTitles: topReads
      .map((item) => readString(item, "title"))
      .slice(0, 10),
    sourceMixProviderKeys,
    citationProviderKeys,
    citationCoverage,
    qualityStatus: readString(qualityState, "status"),
  };
}

async function assertReady(): Promise<void> {
  const ready = await requestJson<JsonRecord>("GET", "/ready", { headers: {} });
  if (ready.status !== "ok") {
    throw new Error("API /ready must report ok");
  }
  const runtime = readRecord(ready, "runtime");
  if (runtime.runtimeProfile !== "beta") {
    throw new Error(
      "API runtimeProfile must be beta for durable backend evidence capture",
    );
  }
}

async function pollSummaryMemoryEvidence(
  params: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly userId: string;
    readonly interestId: string;
    readonly summaryId: string;
    readonly feedbackId: string;
    readonly feedbackProviderKey: string;
    readonly feedItems: readonly JsonRecord[];
  },
  options: { readonly timeoutMs: number; readonly label: string },
): Promise<SummaryMemoryEvidence> {
  const deadline = Date.now() + options.timeoutMs;
  const memory = new MemoStackSummaryMemoryAdapter({
    baseUrl: config.memoryBaseUrl,
    token: config.memoryToken,
    timeoutMs: config.memoryTimeoutMs,
  });
  let latest: SummaryMemoryContext | undefined;
  let latestError: string | undefined;

  while (Date.now() < deadline) {
    try {
      latest = await memory.buildContext(summaryMemoryContextQuery(params));
      latestError = undefined;
    } catch (error) {
      latestError = error instanceof Error ? error.message : String(error);
      await delay(1_000);
      continue;
    }
    const evidence = summaryMemoryEvidenceSnapshot(params, latest, config);
    if (evidence !== undefined) {
      return evidence;
    }
    await delay(1_000);
  }

  throw new Error(
    `${options.label} did not produce retrievable memo-stack context; last=${safeMemoryContextDebug(latest)} lastError=${latestError ?? "none"}`,
  );
}

async function pollScheduledScanEvidence(
  params: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly providerKey: DurableScanProviderKey;
    readonly sourceBindingId: string;
    readonly scanPolicyId: string;
  },
  options: { readonly timeoutMs: number; readonly label: string },
): Promise<ScheduledScanEvidence> {
  const deadline = Date.now() + options.timeoutMs;
  let lastValue: JsonRecord | undefined;

  while (Date.now() < deadline) {
    const value = await scheduledScanEvidenceSnapshot(pool, params);
    lastValue = value;

    if (value !== undefined) {
      const status = readString(value, "status");
      if (status === "FAILED" || status === "CANCELLED") {
        throw new Error(
          `${options.label} ended with ${status}: ${String(value.failureReason ?? "")}`,
        );
      }

      const feedItemCount = readNumber(value, "feedItemCount");
      if (status === "SUCCEEDED" && feedItemCount > 0) {
        return {
          providerKey: params.providerKey,
          sourceBindingId: params.sourceBindingId,
          scanPolicyId: params.scanPolicyId,
          scanJobId: readString(value, "scanJobId"),
          scheduledIdempotencyKey: readString(value, "scheduledIdempotencyKey"),
          status: "SUCCEEDED",
          completedAt: readString(value, "completedAt"),
          nextRunAtAfterSchedule: readString(value, "nextRunAtAfterSchedule"),
          feedItemCount,
          feedItemIds: readStringArray(value, "feedItemIds"),
        };
      }
    }

    await delay(1_000);
  }

  throw new Error(
    `${options.label} did not complete before timeout; last=${JSON.stringify(lastValue ?? {})}`,
  );
}

async function pollAutoSummaryEvidence(
  params: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly interestId: string;
    readonly summaryPolicyId: string;
  },
  options: { readonly timeoutMs: number; readonly label: string },
): Promise<AutoSummaryEvidence> {
  const deadline = Date.now() + options.timeoutMs;
  let lastValue: JsonRecord | undefined;

  while (Date.now() < deadline) {
    const value = await autoSummaryEvidenceSnapshot(pool, params);
    lastValue = value;

    if (value !== undefined) {
      const status = readString(value, "status");
      if (status === "failed" || status === "rejected") {
        throw new Error(
          `${options.label} ended with ${status}: ${String(value.failureReason ?? "")}`,
        );
      }

      if (
        (status === "completed" || status === "no_signal") &&
        readString(value, "summaryId").trim().length > 0
      ) {
        return {
          summaryPolicyId: params.summaryPolicyId,
          summaryJobId: readString(value, "summaryJobId"),
          summaryId: readString(value, "summaryId"),
          idempotencyKey: readString(value, "idempotencyKey"),
          status,
          requestedAt: readString(value, "requestedAt"),
          completedAt: readString(value, "completedAt"),
          latestFeedItemObservedAt: readString(
            value,
            "latestFeedItemObservedAt",
          ),
          newFeedItemCount: readNumber(value, "newFeedItemCount"),
        };
      }
    }

    await delay(1_000);
  }

  throw new Error(
    `${options.label} did not complete before timeout; last=${JSON.stringify(lastValue ?? {})}`,
  );
}

function durableScanPolicyCadence(providerKey: DurableScanProviderKey): {
  readonly intervalSeconds: number;
  readonly freshnessSeconds: number;
} {
  const intervalSeconds = minimumScanIntervalSecondsForProvider(providerKey);

  return {
    intervalSeconds,
    freshnessSeconds: Math.max(intervalSeconds, 300),
  };
}

function durableDeliveryDigestScheduleWindow(params: {
  readonly loopStartedAt: Date;
  readonly scheduledAt: Date;
}): {
  readonly intervalSeconds: number;
  readonly nextRunAt: Date;
} {
  const nextRunAt = new Date(
    params.scheduledAt.getTime() + DIGEST_EVIDENCE_FIRST_RUN_DELAY_MS,
  );
  const intervalMs = Math.max(
    MIN_DIGEST_EVIDENCE_INTERVAL_SECONDS * 1000,
    nextRunAt.getTime() -
      params.loopStartedAt.getTime() +
      DIGEST_EVIDENCE_WINDOW_PADDING_MS,
  );

  return {
    intervalSeconds: Math.ceil(intervalMs / 1000),
    nextRunAt,
  };
}

function scheduledInterestIdempotencyKey(runId: string): string {
  return `scheduled-topic-${runId}`;
}

function bindingIdempotencyKey(
  providerKey: DurableScanProviderKey,
  runId: string,
): string {
  return `binding-${providerKey}-${runId}`;
}

function policyIdempotencyKey(
  providerKey: DurableScanProviderKey,
  runId: string,
): string {
  return `policy-${providerKey}-${runId}`;
}

function scanIdempotencyKey(
  providerKey: DurableScanProviderKey,
  runId: string,
): string {
  return `scan-${providerKey}-${runId}`;
}

function scheduledBindingIdempotencyKey(runId: string): string {
  return `scheduled-binding-rss-${runId}`;
}

function scheduledPolicyIdempotencyKey(runId: string): string {
  return `scheduled-policy-rss-${runId}`;
}

function signalResult(
  signalId: string,
  evidence: JsonRecord,
  observedAt: string,
): SignalResult {
  return {
    signalId,
    status: "passed",
    observedAt,
    evidence,
  };
}




function nowIso(): string {
  return new Date().toISOString();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
