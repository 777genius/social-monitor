import { createPrivateKey, randomUUID, sign as signJwt } from "node:crypto";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { defaultMemoStackTimeoutMs } from "@social-monitor/summary/adapters/memory/memo-stack-memory-client";
import { MemoStackSummaryMemoryAdapter } from "@social-monitor/summary/adapters/memory/memo-stack-summary-memory.adapter";
import type { SummaryMemoryContext } from "@social-monitor/summary/ports";
import { Pool, type PoolClient } from "pg";

type JsonRecord = Record<string, unknown>;

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH";

type RunnerConfig = {
  readonly apiBaseUrl: string;
  readonly databaseUrl: string;
  readonly outputPath: string;
  readonly environmentId: string;
  readonly imageDigest: string;
  readonly operator: string;
  readonly issuer: string;
  readonly audience: string;
  readonly privateKeyPem?: string;
  readonly keyId?: string;
  readonly accessToken?: string;
  readonly accessTokenTtlSeconds: number;
  readonly frontendEnvPath?: string;
  readonly webhookUrl: string;
  readonly memoryBaseUrl: string;
  readonly memoryToken: string;
  readonly memoryTimeoutMs: number;
};

type RuntimeIds = {
  readonly runId: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly userId: string;
  readonly membershipId: string;
};

type AuthContext = {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly token: string;
};

type SignalResult = {
  readonly signalId: string;
  readonly status: "passed";
  readonly observedAt: string;
  readonly evidence: JsonRecord;
};

type DurableScanProviderKey =
  | "hacker-news"
  | "github-issues"
  | "github-trending-page"
  | "reddit"
  | "rss";

type DurableScanTarget = {
  readonly providerKey: DurableScanProviderKey;
  readonly config: JsonRecord;
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
  readonly briefingJobId: string;
  readonly briefingId: string;
  readonly headline: string;
  readonly topReadCount: number;
  readonly topReadTitles: readonly string[];
  readonly sourceMixProviderKeys: readonly string[];
  readonly citationProviderKeys: readonly string[];
  readonly qualityStatus: string;
};

type SummaryMemoryEvidence = {
  readonly status: "available";
  readonly memoryBaseUrlOrigin: string;
  readonly topicScopeExternalRef: string;
  readonly providerScopeExternalRef: string;
  readonly sourceRefTypes: readonly string[];
  readonly sourceRefCount: number;
  readonly renderedTextChars: number;
  readonly factsUsed?: number | undefined;
  readonly itemsUsed?: number | undefined;
  readonly retrievalSourcesUsed?: readonly string[] | undefined;
  readonly memoryEffectMatched: boolean;
};

const config = loadConfig();
const ids: RuntimeIds = {
  runId: `run-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`,
  tenantId: randomUUID(),
  workspaceId: randomUUID(),
  userId: randomUUID(),
  membershipId: randomUUID(),
};
const pool = new Pool({ connectionString: config.databaseUrl });
const startedAt = nowIso();

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
            topicId: evidence.topicId,
            sourceBindingId: evidence.sourceBindingId,
            scanId: evidence.scanId,
            providerBindings: evidence.sourceBindings,
            providerFeedCounts: evidence.providerFeedCounts,
            feedItemIds: evidence.feedItemIds,
            summaryId: evidence.summaryId,
            summaryCitationProviderKeys: evidence.summaryCitationProviderKeys,
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
              "reader briefing was generated from durable feed evidence with top reads, citations and source mix",
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

function writeFrontendRuntimeEnvFile(
  runnerConfig: RunnerConfig,
  auth: AuthContext,
  runtimeIds: RuntimeIds,
): void {
  if (runnerConfig.frontendEnvPath === undefined) {
    return;
  }

  const frontendEnvPath = validatePrivateOutOfWorkspacePath(
    runnerConfig.frontendEnvPath,
    "DURABLE_BACKEND_E2E_FRONTEND_ENV_PATH",
  );
  const lines = [
    "# Generated for local Marionette visual verification only.",
    "# Contains a short-lived backend JWT. Keep outside git and do not commit.",
    `SOCIAL_MONITOR_API_BASE_URL=${shellQuote(runnerConfig.apiBaseUrl)}`,
    `SOCIAL_MONITOR_TENANT_ID=${shellQuote(auth.tenantId)}`,
    `SOCIAL_MONITOR_WORKSPACE_ID=${shellQuote(auth.workspaceId)}`,
    `SOCIAL_MONITOR_TENANT_NAME=${shellQuote(`tenant-${runtimeIds.runId}`)}`,
    `SOCIAL_MONITOR_WORKSPACE_NAME=${shellQuote(
      `workspace-${runtimeIds.runId}`,
    )}`,
    "SOCIAL_MONITOR_WORKSPACE_ROLE='owner'",
    `SOCIAL_MONITOR_USER_ID=${shellQuote(runtimeIds.userId)}`,
    `SOCIAL_MONITOR_USER_LABEL=${shellQuote("MVP Operator")}`,
    `SOCIAL_MONITOR_CORRELATION_ID=${shellQuote(
      `frontend-visual-${runtimeIds.runId}`,
    )}`,
    `SOCIAL_MONITOR_API_BEARER_TOKEN=${shellQuote(auth.token)}`,
  ];

  mkdirSync(dirname(frontendEnvPath), { recursive: true });
  writeFileSync(frontendEnvPath, `${lines.join("\n")}\n`, { mode: 0o600 });
  chmodSync(frontendEnvPath, 0o600);
  console.log(`DURABLE_BACKEND_E2E_FRONTEND_ENV_PATH=${frontendEnvPath}`);
}

function validatePrivateOutOfWorkspacePath(path: string, label: string): string {
  if (!isAbsolute(path)) {
    throw new Error(`${label} must be an absolute path`);
  }

  const resolvedPath = resolve(path);
  const workspaceRelativePath = relative(process.cwd(), resolvedPath);
  if (
    workspaceRelativePath === "" ||
    (!workspaceRelativePath.startsWith(`..${sep}`) &&
      workspaceRelativePath !== "..")
  ) {
    throw new Error(`${label} must not be inside the git workspace`);
  }

  return resolvedPath;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

async function executeBackendLoop(
  auth: AuthContext,
  runtimeIds: RuntimeIds,
): Promise<{
  readonly topicId: string;
  readonly sourceBindingId: string;
  readonly sourceBindings: readonly SourceBindingEvidence[];
  readonly providerFeedCounts: readonly JsonRecord[];
  readonly scheduledScan: ScheduledScanEvidence;
  readonly autoSummary: AutoSummaryEvidence;
  readonly scanId: string;
  readonly feedItemIds: readonly string[];
  readonly summaryId: string;
  readonly summaryCitationProviderKeys: readonly string[];
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
  const headers = authHeaders(auth);
  const topicKey = `topic-${runtimeIds.runId}`;
  const summaryKey = `summary-${runtimeIds.runId}`;
  const briefingKey = `briefing-${runtimeIds.runId}`;
  const feedbackKey = `feedback-${runtimeIds.runId}`;
  const scanTargets = durableScanTargets();
  const topic = await requestJson<JsonRecord>("POST", "/topics", {
    headers: withIdempotency(headers, topicKey),
    body: {
      name: `Durable Multi-Provider Backend Loop ${runtimeIds.runId}`,
      query:
        "backend reliability observability social monitoring developer tools",
    },
  });
  const topicId = readString(topic, "topicId");
  const summaryPolicy = await requestJson<JsonRecord>(
    "PUT",
    `/topics/${encodeURIComponent(topicId)}/summary-policy`,
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
        topicId,
        target,
        runId: runtimeIds.runId,
      }),
    );
  }
  const scheduledTopic = await requestJson<JsonRecord>("POST", "/topics", {
    headers: withIdempotency(
      headers,
      scheduledTopicIdempotencyKey(runtimeIds.runId),
    ),
    body: {
      name: `Durable Scheduled Backend Loop ${runtimeIds.runId}`,
      query: "backend release notes reliability newest",
    },
  });
  const scheduledTopicId = readString(scheduledTopic, "topicId");
  const scheduledScan = await createScheduledSourceBindingAndWait({
    headers,
    topicId: scheduledTopicId,
    target: scheduledScanTarget(),
    runId: runtimeIds.runId,
  });

  const feed = await pollJson<JsonRecord>(
    `/feed/items?topicId=${encodeURIComponent(topicId)}&limit=100`,
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
      topicId,
      summaryPolicyId,
    },
    {
      timeoutMs: 180_000,
      label: "auto-summary scheduler completion",
    },
  );

  const summary = await requestJson<JsonRecord>(
    "POST",
    `/topics/${encodeURIComponent(topicId)}/summary-requests`,
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
  for (const binding of bindingsWithFeed) {
    if (!summaryCitationProviderKeys.includes(binding.providerKey)) {
      throw new Error(
        `summary citations must include provider key ${binding.providerKey}: ${JSON.stringify(
          {
            expectedProviders: bindingsWithFeed.map((item) => item.providerKey),
            providerFeedCounts: bindingsWithFeed.map((item) => ({
              providerKey: item.providerKey,
              feedItemCount: item.feedItemCount,
              feedProviderKeys: item.feedProviderKeys,
            })),
            summaryCitationProviderKeys,
            citationCount: citations.length,
          },
        )}`,
      );
    }
  }
  const readerBrief = await captureReaderBriefEvidence({
    headers,
    idempotencyKey: briefingKey,
    expectedProviderKeys: bindingsWithFeed.map(
      (binding) => binding.providerKey,
    ),
  });

  const realtimeChannel = `topic:${topicId}:summary-status`;
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
      topicId,
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

  await requestJson<JsonRecord>("POST", "/delivery/digest-schedules", {
    headers,
    body: {
      recipientKey: webhookEndpointId,
      channel: "webhook",
      topicIds: [topicId],
      intervalSeconds: 60,
      includeNoSignal: true,
      nextRunAt: new Date(Date.now() + 3_000).toISOString(),
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
  const replayedTopic = await requestJson<JsonRecord>("POST", "/topics", {
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
    `/topics/${encodeURIComponent(topicId)}/summary-requests`,
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
    topicId,
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
      scheduledTopicIdempotencyKey(runtimeIds.runId),
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
      briefingKey,
      feedbackKey,
    ],
    responseIds: [
      readString(replayedTopic, "topicId"),
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
  readonly topicId: string;
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
    `/topics/${encodeURIComponent(params.topicId)}/source-bindings`,
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
  const policy = await requestJson<JsonRecord>(
    "POST",
    `/source-bindings/${encodeURIComponent(sourceBindingId)}/scan-policy`,
    {
      headers: withIdempotency(
        params.headers,
        policyIdempotencyKey(params.target.providerKey, params.runId),
      ),
      body: {
        intervalSeconds: 60,
        freshnessSeconds: 300,
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
  readonly topicId: string;
  readonly target: DurableScanTarget;
  readonly runId: string;
}): Promise<ScheduledScanEvidence> {
  const binding = await requestJson<JsonRecord>(
    "POST",
    `/topics/${encodeURIComponent(params.topicId)}/source-bindings`,
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
  const policy = await requestJson<JsonRecord>(
    "POST",
    `/source-bindings/${encodeURIComponent(sourceBindingId)}/scan-policy`,
    {
      headers: withIdempotency(
        params.headers,
        scheduledPolicyIdempotencyKey(params.runId),
      ),
      body: {
        intervalSeconds: 60,
        freshnessSeconds: 300,
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
  const request = await requestJson<JsonRecord>("POST", "/briefing-requests", {
    headers: withIdempotency(params.headers, params.idempotencyKey),
    body: {
      scope: {
        type: "workspace",
      },
    },
  });
  const briefingJobId = readString(request, "briefingJobId");
  const status = await pollJson<JsonRecord>(
    `/briefing-jobs/${encodeURIComponent(briefingJobId)}/status`,
    params.headers,
    (value) => {
      const jobStatus = readString(value, "status");
      if (jobStatus === "failed") {
        throw new Error(
          `briefing job ${briefingJobId} failed: ${String(value.failureReason ?? "")}`,
        );
      }

      return jobStatus === "completed" ? value : undefined;
    },
    { timeoutMs: 120_000, label: "reader briefing completion" },
  );
  const briefingId = readString(status, "briefingId");
  const briefing = await requestJson<JsonRecord>(
    "GET",
    `/briefings/${encodeURIComponent(briefingId)}`,
    {
      headers: params.headers,
    },
  );
  const readerBrief = readRecord(briefing, "readerBrief");
  const topReads = readObjectArray(readerBrief, "topReads");
  const sourceMix = readObjectArray(readerBrief, "sourceMix");
  const citations = readObjectArray(briefing, "citations");
  const qualityState = readRecord(readerBrief, "qualityState");
  const sourceMixProviderKeys = [
    ...new Set(sourceMix.map((entry) => readString(entry, "providerKey"))),
  ].sort();
  const citationProviderKeys = [
    ...new Set(
      citations.map((citation) => readString(citation, "providerKey")),
    ),
  ].sort();

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
    if (!citationProviderKeys.includes(providerKey)) {
      throw new Error(
        `reader brief citations must include ${providerKey}: ${JSON.stringify(citationProviderKeys)}`,
      );
    }
  }

  return {
    briefingJobId,
    briefingId,
    headline: readString(briefing, "headline"),
    topReadCount: topReads.length,
    topReadTitles: topReads
      .map((item) => readString(item, "title"))
      .slice(0, 10),
    sourceMixProviderKeys,
    citationProviderKeys,
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

async function seedDurableIdentity(
  db: Pool,
  runtimeIds: RuntimeIds,
): Promise<void> {
  await withClient(db, async (client) => {
    await client.query("begin");
    try {
      await client.query(
        `
          insert into tenants (id, slug, name, created_at, updated_at)
          values ($1, $2, $3, now(), now())
          on conflict (id) do update set updated_at = excluded.updated_at
        `,
        [
          runtimeIds.tenantId,
          `tenant-${runtimeIds.runId}`,
          "Durable Backend Loop Tenant",
        ],
      );
      await client.query(
        `
          insert into workspaces (id, tenant_id, slug, name, created_at, updated_at)
          values ($1, $2, $3, $4, now(), now())
          on conflict (id) do update set updated_at = excluded.updated_at
        `,
        [
          runtimeIds.workspaceId,
          runtimeIds.tenantId,
          `workspace-${runtimeIds.runId}`,
          "Durable Backend Loop Workspace",
        ],
      );
      await client.query(
        `
          insert into users (id, tenant_id, email, display_name, created_at, updated_at)
          values ($1, $2, $3, $4, now(), now())
          on conflict (id) do update set updated_at = excluded.updated_at
        `,
        [
          runtimeIds.userId,
          runtimeIds.tenantId,
          `ops-${runtimeIds.runId}@internal.local`,
          "Backend Loop Operator",
        ],
      );
      await client.query(
        `
          insert into memberships (id, tenant_id, workspace_id, user_id, role, created_at, updated_at)
          values ($1, $2, $3, $4, 'OWNER', now(), now())
          on conflict (tenant_id, workspace_id, user_id) do update set role = 'OWNER', updated_at = excluded.updated_at
        `,
        [
          runtimeIds.membershipId,
          runtimeIds.tenantId,
          runtimeIds.workspaceId,
          runtimeIds.userId,
        ],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  });
}

async function durableCounts(
  db: Pool,
  tenantId: string,
  workspaceId: string,
): Promise<JsonRecord> {
  return withClient(db, async (client) => {
    const result = await client.query<{
      topics: number;
      scan_jobs: number;
      feed_items: number;
      summary_jobs: number;
      summaries: number;
      feedback: number;
      digests: number;
      delivery_attempts: number;
    }>(
      `
        select
          (select count(*)::int from topics where tenant_id = $1 and workspace_id = $2) as topics,
          (select count(*)::int from scan_jobs where tenant_id = $1 and workspace_id = $2) as scan_jobs,
          (select count(*)::int from feed_items where tenant_id = $1 and workspace_id = $2) as feed_items,
          (select count(*)::int from summary_jobs where tenant_id = $1 and workspace_id = $2) as summary_jobs,
          (select count(*)::int from summary_artifacts where tenant_id = $1 and workspace_id = $2) as summaries,
          (select count(*)::int from summary_feedback where tenant_id = $1 and workspace_id = $2) as feedback,
          (select count(*)::int from digests where tenant_id = $1 and workspace_id = $2) as digests,
          (select count(*)::int from delivery_attempts where tenant_id = $1 and workspace_id = $2) as delivery_attempts
      `,
      [tenantId, workspaceId],
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw new Error("durable count query returned no row");
    }

    return {
      topics: Number(row.topics),
      scanJobs: Number(row.scan_jobs),
      feedItems: Number(row.feed_items),
      summaryJobs: Number(row.summary_jobs),
      summaries: Number(row.summaries),
      feedback: Number(row.feedback),
      digests: Number(row.digests),
      deliveryAttempts: Number(row.delivery_attempts),
    };
  });
}

async function pollSummaryMemoryEvidence(
  params: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly userId: string;
    readonly topicId: string;
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
    const evidence = summaryMemoryEvidenceSnapshot(params, latest);
    if (evidence !== undefined) {
      return evidence;
    }
    await delay(1_000);
  }

  throw new Error(
    `${options.label} did not produce retrievable memo-stack context; last=${safeMemoryContextDebug(latest)} lastError=${latestError ?? "none"}`,
  );
}

function summaryMemoryContextQuery(params: {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly userId: string;
  readonly topicId: string;
  readonly feedItems: readonly JsonRecord[];
}): Parameters<MemoStackSummaryMemoryAdapter["buildContext"]>[0] {
  const requestedAt = new Date();
  const evidenceItems = params.feedItems.slice(0, 12).map((item, index) => {
    const providerKey = readString(item, "providerKey");
    const feedItemId = readString(item, "id");
    const bodyPreview = optionalString(item, "bodyPreview");
    const canonicalUrl = optionalString(item, "canonicalUrl");

    return {
      feedItemId,
      sourceItemId:
        optionalString(item, "sourceItemId") ??
        `source-${providerKey}-${index}`,
      sourceBindingId: readString(item, "sourceBindingId"),
      providerKey,
      title:
        optionalString(item, "title") ??
        `${providerKey} feed item ${index + 1}`,
      ...(bodyPreview === undefined ? {} : { bodyPreview }),
      ...(canonicalUrl === undefined ? {} : { canonicalUrl }),
      observedAt: parseDateOrFallback(
        optionalString(item, "observedAt"),
        requestedAt,
      ),
    };
  });

  return {
    tenantId: tenantId(params.tenantId),
    workspaceId: workspaceId(params.workspaceId),
    topicId: params.topicId,
    userId: params.userId,
    requestedAt,
    evidence: {
      sourceWindow: {
        windowId: `durable-backend-loop-memory-${params.topicId}`,
        startedAt: requestedAt,
        endedAt: requestedAt,
        selectedFeedItemIds: evidenceItems.map((item) => item.feedItemId),
      },
      items: evidenceItems,
    },
  };
}

function summaryMemoryEvidenceSnapshot(
  params: {
    readonly topicId: string;
    readonly feedbackId: string;
    readonly feedbackProviderKey: string;
  },
  context: SummaryMemoryContext,
): SummaryMemoryEvidence | undefined {
  if (context.status !== "available") {
    return undefined;
  }

  const sourceRefs = context.sourceRefs ?? [];
  const sourceRefTypes = [
    ...new Set(
      sourceRefs
        .map((ref) =>
          typeof ref.source_type === "string" ? ref.source_type : undefined,
        )
        .filter(
          (value): value is string =>
            value !== undefined && value.trim().length > 0,
        ),
    ),
  ].sort((left, right) => left.localeCompare(right));
  const renderedText = context.renderedText ?? "";
  const rendered = renderedText.toLocaleLowerCase("en-US");
  const matchedBySourceRef = sourceRefs.some(
    (ref) =>
      ref.source_type === "social-monitor.summary-feedback" &&
      ref.source_id === params.feedbackId,
  );
  const matchedByText =
    rendered.includes(
      `summary feedback for topic ${params.topicId}`.toLocaleLowerCase("en-US"),
    ) ||
    rendered.includes(
      `provider ${params.feedbackProviderKey}`.toLocaleLowerCase("en-US"),
    );
  const matchedByDiagnostics =
    Number(
      context.retrieval?.factsUsed ?? context.diagnostics.facts_used ?? 0,
    ) > 0 ||
    Number(
      context.retrieval?.itemsUsed ?? context.diagnostics.items_used ?? 0,
    ) > 0;
  const memoryEffectMatched =
    matchedBySourceRef || matchedByText || matchedByDiagnostics;
  if (!memoryEffectMatched) {
    return undefined;
  }

  return {
    status: "available",
    memoryBaseUrlOrigin: safeUrlOrigin(config.memoryBaseUrl),
    topicScopeExternalRef: `topic:${params.topicId}:feedback`,
    providerScopeExternalRef: `topic:${params.topicId}:provider:${params.feedbackProviderKey}:quality`,
    sourceRefTypes,
    sourceRefCount: sourceRefs.length,
    renderedTextChars: renderedText.length,
    factsUsed: numberOrUndefined(
      context.retrieval?.factsUsed ?? context.diagnostics.facts_used,
    ),
    itemsUsed: numberOrUndefined(
      context.retrieval?.itemsUsed ?? context.diagnostics.items_used,
    ),
    retrievalSourcesUsed: stringArrayOrUndefined(
      context.retrieval?.retrievalSourcesUsed ??
        context.diagnostics.retrieval_sources_used,
    ),
    memoryEffectMatched,
  };
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
    const value = await scheduledScanEvidenceSnapshot(params);
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

async function scheduledScanEvidenceSnapshot(params: {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly sourceBindingId: string;
  readonly scanPolicyId: string;
}): Promise<JsonRecord | undefined> {
  return withClient(pool, async (client) => {
    const result = await client.query<{
      scan_job_id: string;
      status: string;
      scheduled_idempotency_key: string;
      completed_at: Date | null;
      failure_reason: string | null;
      next_run_at_after_schedule: Date;
      feed_item_count: number;
      feed_item_ids: string[] | null;
    }>(
      `
        select
          j.id as scan_job_id,
          j.status,
          j.idempotency_key as scheduled_idempotency_key,
          j.completed_at,
          j.failure_reason,
          p.next_run_at as next_run_at_after_schedule,
          count(fi.id)::int as feed_item_count,
          coalesce(array_agg(fi.id::text order by fi.observed_at desc) filter (where fi.id is not null), array[]::text[]) as feed_item_ids
        from scan_jobs j
        join scan_policies p on p.id = j.scan_policy_id
        left join feed_items fi
          on fi.tenant_id = j.tenant_id
          and fi.workspace_id = j.workspace_id
          and fi.source_binding_id = j.source_binding_id
        where j.tenant_id = $1
          and j.workspace_id = $2
          and j.source_binding_id = $3
          and j.scan_policy_id = $4
          and j.idempotency_key like 'scheduled:%'
        group by j.id, j.status, j.idempotency_key, j.completed_at, j.failure_reason, p.next_run_at, j.created_at
        order by j.created_at desc
        limit 1
      `,
      [
        params.tenantId,
        params.workspaceId,
        params.sourceBindingId,
        params.scanPolicyId,
      ],
    );
    const row = result.rows[0];
    if (row === undefined) {
      return undefined;
    }

    return {
      scanJobId: row.scan_job_id,
      status: row.status,
      scheduledIdempotencyKey: row.scheduled_idempotency_key,
      completedAt: row.completed_at?.toISOString() ?? "",
      failureReason: row.failure_reason,
      nextRunAtAfterSchedule: row.next_run_at_after_schedule.toISOString(),
      feedItemCount: Number(row.feed_item_count),
      feedItemIds: row.feed_item_ids ?? [],
    };
  });
}

async function pollAutoSummaryEvidence(
  params: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly topicId: string;
    readonly summaryPolicyId: string;
  },
  options: { readonly timeoutMs: number; readonly label: string },
): Promise<AutoSummaryEvidence> {
  const deadline = Date.now() + options.timeoutMs;
  let lastValue: JsonRecord | undefined;

  while (Date.now() < deadline) {
    const value = await autoSummaryEvidenceSnapshot(params);
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

async function autoSummaryEvidenceSnapshot(params: {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly topicId: string;
}): Promise<JsonRecord | undefined> {
  return withClient(pool, async (client) => {
    const result = await client.query<{
      summary_job_id: string;
      summary_id: string | null;
      idempotency_key: string;
      status: string;
      requested_at: Date;
      completed_at: Date | null;
      failure_reason: string | null;
      latest_feed_item_observed_at: Date | null;
      new_feed_item_count: number;
    }>(
      `
        with selected_job as (
          select
            j.id,
            j.tenant_id,
            j.workspace_id,
            j.topic_id,
            j.summary_artifact_id,
            j.idempotency_key,
            j.status,
            j.requested_at,
            j.completed_at,
            j.failure_reason
          from summary_jobs j
          where j.tenant_id = $1
            and j.workspace_id = $2
            and j.topic_id = $3
            and j.user_id is null
            and j.subscription_id is null
            and j.idempotency_key like 'auto-summary:%'
          order by j.requested_at desc, j.id desc
          limit 1
        ),
        previous_summary as (
          select max(previous.requested_at) as requested_at
          from summary_jobs previous
          join selected_job selected
            on selected.tenant_id = previous.tenant_id
           and selected.workspace_id = previous.workspace_id
           and selected.topic_id = previous.topic_id
          where previous.user_id is null
            and previous.subscription_id is null
            and previous.requested_at < selected.requested_at
        )
        select
          selected.id as summary_job_id,
          selected.summary_artifact_id as summary_id,
          selected.idempotency_key,
          lower(selected.status::text) as status,
          selected.requested_at,
          selected.completed_at,
          selected.failure_reason,
          max(fi.observed_at) filter (
            where fi.observed_at <= selected.requested_at
              and (previous.requested_at is null or fi.observed_at > previous.requested_at)
          ) as latest_feed_item_observed_at,
          count(fi.id) filter (
            where fi.observed_at <= selected.requested_at
              and (previous.requested_at is null or fi.observed_at > previous.requested_at)
          )::int as new_feed_item_count
        from selected_job selected
        cross join previous_summary previous
        left join feed_items fi
          on fi.tenant_id = selected.tenant_id
          and fi.workspace_id = selected.workspace_id
          and fi.topic_id = selected.topic_id
          and fi.status = 'VISIBLE'
        group by
          selected.id,
          selected.summary_artifact_id,
          selected.idempotency_key,
          selected.status,
          selected.requested_at,
          selected.completed_at,
          selected.failure_reason
      `,
      [params.tenantId, params.workspaceId, params.topicId],
    );
    const row = result.rows[0];
    if (row === undefined) {
      return undefined;
    }

    return {
      summaryJobId: row.summary_job_id,
      summaryId: row.summary_id ?? "",
      idempotencyKey: row.idempotency_key,
      status: row.status,
      requestedAt: row.requested_at.toISOString(),
      completedAt: row.completed_at?.toISOString() ?? "",
      failureReason: row.failure_reason,
      latestFeedItemObservedAt:
        row.latest_feed_item_observed_at?.toISOString() ?? "",
      newFeedItemCount: Number(row.new_feed_item_count),
    };
  });
}

async function withClient<T>(
  db: Pool,
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await db.connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

function resolveAccessToken(
  runnerConfig: RunnerConfig,
  runtimeIds: RuntimeIds,
): string {
  if (runnerConfig.accessToken !== undefined) {
    return runnerConfig.accessToken;
  }
  if (
    runnerConfig.privateKeyPem === undefined ||
    runnerConfig.keyId === undefined
  ) {
    throw new Error(
      "DURABLE_BACKEND_E2E_PRIVATE_KEY_PEM and DURABLE_BACKEND_E2E_JWT_KID are required when no access token is supplied",
    );
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const privateKey = createPrivateKey(runnerConfig.privateKeyPem);
  const encodedHeader = encodeJson({
    alg: "RS256",
    typ: "JWT",
    kid: runnerConfig.keyId,
  });
  const encodedPayload = encodeJson({
    sub: runtimeIds.userId,
    iss: runnerConfig.issuer,
    aud: runnerConfig.audience,
    iat: nowSeconds,
    exp: nowSeconds + runnerConfig.accessTokenTtlSeconds,
    tenant_id: runtimeIds.tenantId,
    workspace_id: runtimeIds.workspaceId,
    workspace_roles: ["owner"],
  });
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = signJwt(
    "RSA-SHA256",
    Buffer.from(signingInput, "ascii"),
    privateKey,
  ).toString("base64url");

  return `${signingInput}.${signature}`;
}

function authHeaders(auth: AuthContext): Record<string, string> {
  return {
    "x-tenant-id": auth.tenantId,
    "x-workspace-id": auth.workspaceId,
    authorization: `Bearer ${auth.token}`,
    "x-request-id": `durable-backend-loop-${randomUUID()}`,
  };
}

function withIdempotency(
  headers: Readonly<Record<string, string>>,
  key: string,
): Record<string, string> {
  return {
    ...headers,
    "idempotency-key": key,
  };
}

function durableScanTargets(): readonly DurableScanTarget[] {
  const githubAccessToken = emptyToUndefined(process.env.GITHUB_ACCESS_TOKEN);
  if (!hasRedditAppOnlyCredentials()) {
    throw new Error(
      "REDDIT_APP_CLIENT_ID and REDDIT_APP_CLIENT_SECRET are required because durable backend E2E must scan Reddit, GitHub Issues, GitHub Trending Page, Hacker News and RSS in one loop",
    );
  }

  return [
    {
      providerKey: "hacker-news",
      config: {
        mode: "search",
        query: "monitoring",
        maxItems: 2,
      },
    },
    {
      providerKey: "github-issues",
      config: {
        query: "repo:microsoft/TypeScript is:issue",
        maxItems: 2,
        userAgent:
          emptyToUndefined(process.env.GITHUB_USER_AGENT) ??
          "social-monitor-mvp/0.1 github-live-smoke",
        ...(githubAccessToken === undefined
          ? {}
          : { accessToken: githubAccessToken }),
      },
    },
    {
      providerKey: "github-trending-page",
      config: {
        window: "daily",
        language: "python",
        maxItems: 3,
        userAgent:
          emptyToUndefined(process.env.GITHUB_TRENDING_PAGE_USER_AGENT) ??
          emptyToUndefined(process.env.GITHUB_USER_AGENT) ??
          "social-monitor-mvp/0.1 github-trending-page",
      },
    },
    {
      providerKey: "reddit",
      config: {
        mode: "listing",
        subreddit: "programming",
        listing: "hot",
        maxItems: 2,
        userAgent:
          process.env.REDDIT_APP_USER_AGENT ??
          process.env.REDDIT_USER_AGENT ??
          "social-monitor-mvp/0.1 reddit-app-only",
      },
    },
    {
      providerKey: "rss",
      config: {
        feedUrl: "https://hnrss.org/frontpage",
        maxItems: 2,
      },
    },
  ];
}

function scheduledScanTarget(): DurableScanTarget {
  return {
    providerKey: "rss",
    config: {
      feedUrl: "https://hnrss.org/newest",
      maxItems: 2,
    },
  };
}

function scheduledTopicIdempotencyKey(runId: string): string {
  return `scheduled-topic-${runId}`;
}

function hasRedditAppOnlyCredentials(): boolean {
  return (
    emptyToUndefined(process.env.REDDIT_APP_CLIENT_ID) !== undefined &&
    emptyToUndefined(process.env.REDDIT_APP_CLIENT_SECRET) !== undefined
  );
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

async function pollJson<T extends JsonRecord>(
  path: string,
  headers: Readonly<Record<string, string>>,
  done: (value: JsonRecord) => T | undefined,
  options: { readonly timeoutMs: number; readonly label: string },
): Promise<T> {
  const deadline = Date.now() + options.timeoutMs;
  let lastValue: JsonRecord | undefined;
  while (Date.now() < deadline) {
    let value: JsonRecord;
    try {
      value = await requestJson<JsonRecord>("GET", path, { headers });
    } catch (error) {
      if (error instanceof RateLimitError) {
        const waitMs = Math.min(
          Math.max(error.retryAfterSeconds, 1) * 1_000,
          Math.max(deadline - Date.now(), 0),
        );
        lastValue = {
          rateLimited: true,
          retryAfterSeconds: error.retryAfterSeconds,
        };
        if (waitMs > 0) {
          await delay(waitMs);
          continue;
        }
      }
      throw error;
    }
    lastValue = value;
    const result = done(value);
    if (result !== undefined) {
      return result;
    }
    await delay(1_000);
  }

  throw new Error(
    `${options.label} did not complete before timeout; last=${JSON.stringify(lastValue ?? {})}`,
  );
}

async function requestStatus(
  path: string,
  headers: Readonly<Record<string, string>>,
): Promise<number> {
  let response: Response;
  try {
    response = await fetch(new URL(path, config.apiBaseUrl), {
      method: "GET",
      headers,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`GET ${path} request failed: ${message}`);
  }

  await response.arrayBuffer().catch(() => undefined);
  return response.status;
}

async function requestJsonWithContext<T extends JsonRecord>(
  context: string,
  method: HttpMethod,
  path: string,
  options: {
    readonly headers: Readonly<Record<string, string>>;
    readonly body?: JsonRecord;
  },
): Promise<T> {
  try {
    return await requestJson<T>(method, path, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${context}: ${message}`);
  }
}

async function requestJson<T extends JsonRecord>(
  method: HttpMethod,
  path: string,
  options: {
    readonly headers: Readonly<Record<string, string>>;
    readonly body?: JsonRecord;
  },
): Promise<T> {
  const headers: Record<string, string> = {
    accept: "application/json",
    ...options.headers,
  };
  let response: Response;
  try {
    response = await fetch(new URL(path, config.apiBaseUrl), {
      method,
      headers:
        options.body === undefined
          ? headers
          : { ...headers, "content-type": "application/json" },
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${method} ${path} request failed: ${message}`);
  }
  const text = await response.text();
  const body = parseJsonResponse(text);

  if (response.status < 200 || response.status >= 300) {
    if (response.status === 429) {
      throw new RateLimitError(
        method,
        path,
        readRetryAfterSeconds(response, body),
        safeHttpErrorBody(body),
      );
    }
    throw new Error(
      `${method} ${path} failed with HTTP ${response.status}: ${safeHttpErrorBody(body)}`,
    );
  }
  if (!isRecord(body)) {
    throw new Error(`${method} ${path} did not return a JSON object`);
  }

  return body as T;
}

class RateLimitError extends Error {
  constructor(
    readonly method: HttpMethod,
    readonly path: string,
    readonly retryAfterSeconds: number,
    readonly safeBody: string,
  ) {
    super(
      `${method} ${path} failed with HTTP 429; retryAfterSeconds=${retryAfterSeconds}; body=${safeBody}`,
    );
  }
}

function readRetryAfterSeconds(response: Response, body: unknown): number {
  const header = response.headers.get("retry-after");
  if (header !== null) {
    const parsedHeader = Number.parseInt(header, 10);
    if (Number.isSafeInteger(parsedHeader) && parsedHeader > 0) {
      return parsedHeader;
    }
  }
  if (isRecord(body) && isRecord(body.details)) {
    const value = body.details.retryAfterSeconds;
    if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
      return value;
    }
  }
  return 1;
}

function parseJsonResponse(text: string): unknown {
  if (text.trim().length === 0) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text.slice(0, 500) };
  }
}

function safeHttpErrorBody(body: unknown): string {
  const serialized = JSON.stringify(body);
  return serialized.length > 1_000
    ? `${serialized.slice(0, 1_000)}...`
    : serialized;
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

function loadConfig(): RunnerConfig {
  const apiBaseUrl = requireEnv("API_BASE_URL");
  const configValue: RunnerConfig = {
    apiBaseUrl,
    databaseUrl: requireEnv("DATABASE_URL"),
    outputPath: requireEnv("DURABLE_BACKEND_E2E_ARTIFACT_PATH"),
    environmentId: requireEnv("STAGING_ENVIRONMENT_ID"),
    imageDigest: requireEnv("BACKEND_IMAGE_DIGEST"),
    operator: process.env.STAGING_OPERATOR ?? "backend-ops-1",
    issuer:
      process.env.SOCIAL_MONITOR_OIDC_ISSUER ??
      process.env.DURABLE_BACKEND_E2E_OIDC_ISSUER ??
      "",
    audience:
      process.env.SOCIAL_MONITOR_OIDC_AUDIENCE ??
      process.env.DURABLE_BACKEND_E2E_OIDC_AUDIENCE ??
      "",
    privateKeyPem: emptyToUndefined(
      process.env.DURABLE_BACKEND_E2E_PRIVATE_KEY_PEM,
    ),
    keyId: emptyToUndefined(process.env.DURABLE_BACKEND_E2E_JWT_KID),
    accessToken: emptyToUndefined(process.env.DURABLE_BACKEND_E2E_ACCESS_TOKEN),
    accessTokenTtlSeconds: readPositiveIntegerEnv(
      "DURABLE_BACKEND_E2E_ACCESS_TOKEN_TTL_SECONDS",
      900,
      60,
      86_400,
    ),
    frontendEnvPath: emptyToUndefined(
      process.env.DURABLE_BACKEND_E2E_FRONTEND_ENV_PATH,
    ),
    webhookUrl:
      process.env.DURABLE_BACKEND_E2E_WEBHOOK_URL ??
      "https://httpbingo.org/post",
    memoryBaseUrl: requireEnv("INFINITY_CONTEXT_URL"),
    memoryToken: requireEnv("INFINITY_CONTEXT_TOKEN"),
    memoryTimeoutMs: readPositiveIntegerEnv(
      "SUMMARY_MEMORY_TIMEOUT_MS",
      defaultMemoStackTimeoutMs,
      1_000,
      120_000,
    ),
  };

  if (!/^https?:\/\//.test(configValue.apiBaseUrl)) {
    throw new Error("API_BASE_URL must be an http(s) URL");
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(configValue.imageDigest)) {
    throw new Error("BACKEND_IMAGE_DIGEST must be sha256:<64 hex chars>");
  }
  if (
    configValue.accessToken === undefined &&
    (configValue.issuer.trim() === "" || configValue.audience.trim() === "")
  ) {
    throw new Error(
      "SOCIAL_MONITOR_OIDC_ISSUER and SOCIAL_MONITOR_OIDC_AUDIENCE are required when signing runner JWTs",
    );
  }

  return configValue;
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function readRecord(source: JsonRecord, field: string): JsonRecord {
  const value = source[field];
  if (!isRecord(value)) {
    throw new Error(`Expected ${field} to be an object`);
  }

  return value;
}

function readString(source: JsonRecord, field: string): string {
  const value = source[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Expected ${field} to be a non-empty string`);
  }

  return value;
}

function optionalString(source: JsonRecord, field: string): string | undefined {
  const value = source[field];
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}

function readNumber(source: JsonRecord, field: string): number {
  const value = source[field];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Expected ${field} to be a finite number`);
  }

  return value;
}

function readStringArray(source: JsonRecord, field: string): readonly string[] {
  const value = source[field];
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string" || item.trim().length === 0)
  ) {
    throw new Error(`Expected ${field} to be a string array`);
  }

  return value;
}

function readObjectArray(
  source: JsonRecord,
  field: string,
): readonly JsonRecord[] {
  const value = source[field];
  if (!Array.isArray(value) || value.some((item) => !isRecord(item))) {
    throw new Error(`Expected ${field} to be an object array`);
  }

  return value as readonly JsonRecord[];
}

function readFirst<T>(values: readonly T[], label: string): T {
  const first = values[0];
  if (first === undefined) {
    throw new Error(`Expected at least one ${label}`);
  }

  return first;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function encodeJson(value: JsonRecord): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function emptyToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function stringArrayOrUndefined(value: unknown): readonly string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : undefined;
}

function parseDateOrFallback(value: string | undefined, fallback: Date): Date {
  if (value === undefined) {
    return fallback;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function safeMemoryContextDebug(
  context: SummaryMemoryContext | undefined,
): string {
  if (context === undefined) {
    return "{}";
  }

  return JSON.stringify({
    status: context.status,
    sourceRefTypes: [
      ...new Set(
        (context.sourceRefs ?? [])
          .map((ref) =>
            typeof ref.source_type === "string" ? ref.source_type : undefined,
          )
          .filter((value): value is string => value !== undefined),
      ),
    ],
    factsUsed: context.retrieval?.factsUsed ?? context.diagnostics.facts_used,
    itemsUsed: context.retrieval?.itemsUsed ?? context.diagnostics.items_used,
    renderedTextChars: context.renderedText?.length ?? 0,
  });
}

function safeUrlOrigin(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return "invalid-url-redacted";
  }
}

function readPositiveIntegerEnv(
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }

  return parsed;
}

function nowIso(): string {
  return new Date().toISOString();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
