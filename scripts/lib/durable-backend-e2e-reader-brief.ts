import { withIdempotency } from "./durable-backend-e2e-auth";
import { providerCitationCoverage, assertProviderCitationCoverage, type ProviderCitationCoverage } from "./durable-backend-e2e-citation-coverage";
import type { createDurableBackendHttpClient } from "./durable-backend-e2e-http-client";
import { readRecord, readObjectArray, readString, type JsonRecord } from "./durable-backend-e2e-json-fields";
import type { DurableScanProviderKey } from "./durable-backend-e2e-scan-targets";

export type ReaderBriefEvidence = {
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

type ReaderBriefHttp = Pick<ReturnType<typeof createDurableBackendHttpClient>, "requestJson" | "pollJson">;

export async function captureReaderBriefEvidence(params: {
  readonly headers: Readonly<Record<string, string>>;
  readonly idempotencyKey: string;
  readonly expectedProviderKeys: readonly DurableScanProviderKey[];
}, http: ReaderBriefHttp): Promise<ReaderBriefEvidence> {
  const { requestJson, pollJson } = http;
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

