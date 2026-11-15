import assert from "node:assert/strict";
import { test } from "node:test";
import { captureReaderBriefEvidence } from "./durable-backend-e2e-reader-brief.ts";

const headers = { authorization: "Bearer test", "x-tenant-id": "tenant-1" };
const params = { headers, idempotencyKey: "reader-key", expectedProviderKeys: ["reddit", "rss", "hacker-news"] };
function artifact(extra = {}) {
  return {
    headline: "Reader headline",
    readerBrief: {
      topReads: Array.from({ length: 11 }, (_, index) => ({ title: "Top " + index })),
      sourceMix: [{ providerKey: "rss" }, { providerKey: "reddit" }, { providerKey: "hacker-news" }, { providerKey: "rss" }],
      qualityState: { status: "passed" },
    },
    citations: [{ providerKey: "rss" }, { providerKey: "reddit" }, { providerKey: "reddit" }],
    ...extra,
  };
}
function fake({ status = { status: "completed", readerSummaryId: "summary-1" }, summary = artifact() } = {}) {
  const calls = [];
  return {
    calls,
    async requestJson(method, path, options) {
      calls.push({ method, path, options });
      if (method === "POST" && path === "/reader-summary-requests") return { readerSummaryJobId: "job-1" };
      if (method === "GET" && path === "/reader-summaries/summary-1") return summary;
      throw new Error("unexpected HTTP request");
    },
    async pollJson(path, pollHeaders, done, options) {
      calls.push({ path, headers: pollHeaders, options });
      const result = done(status);
      if (result === undefined) throw new Error("status remains pending");
      return result;
    },
  };
}
test("preserves request order, idempotency, polling timeout, projection and sorting", async () => {
  const client = fake();
  const value = await captureReaderBriefEvidence(params, client);
  assert.deepEqual(client.calls.map((x) => x.method ?? "POLL"), ["POST", "POLL", "GET"]);
  assert.deepEqual(client.calls[0], {
    method: "POST", path: "/reader-summary-requests",
    options: { headers: { ...headers, "idempotency-key": "reader-key" }, body: { scope: { type: "workspace" } } },
  });
  assert.deepEqual(client.calls[1], {
    path: "/reader-summary-jobs/job-1/status", headers,
    options: { timeoutMs: 120_000, label: "reader readerSummary completion" },
  });
  assert.deepEqual(client.calls[2], {
    method: "GET", path: "/reader-summaries/summary-1", options: { headers },
  });
  assert.deepEqual(value, {
    readerSummaryJobId: "job-1", readerSummaryId: "summary-1",
    headline: "Reader headline", topReadCount: 11,
    topReadTitles: Array.from({ length: 10 }, (_, i) => "Top " + i),
    sourceMixProviderKeys: ["hacker-news", "reddit", "rss"],
    citationProviderKeys: ["reddit", "rss"],
    citationCoverage: {
      expectedProviderKeys: ["hacker-news", "reddit", "rss"],
      citedProviderKeys: ["reddit", "rss"],
      uncitedProviderKeys: ["hacker-news"],
      minimumCitedProviderCount: 2,
    },
    qualityStatus: "passed",
  });
});
test("failed reader job keeps exact failure reason without fetching artifact", async () => {
  const http = fake({ status: { status: "failed", failureReason: "rejected" } });
  await assert.rejects(captureReaderBriefEvidence(params, http), /readerSummary job job-1 failed: rejected/);
  assert.equal(http.calls.length, 2);
});
test("pending job is not accepted as completed", async () => {
  await assert.rejects(captureReaderBriefEvidence(params, fake({ status: { status: "running" } })),
    /status remains pending/);
});
test("minimum three top reads remains mandatory", async () => {
  const summary = artifact();
  summary.readerBrief.topReads = [{ title: "one" }, { title: "two" }];
  await assert.rejects(captureReaderBriefEvidence(params, fake({ summary })),
    /reader brief must expose at least three top reads, got 2/);
});
test("all expected providers must appear in source mix", async () => {
  const summary = artifact();
  summary.readerBrief.sourceMix = [{ providerKey: "reddit" }, { providerKey: "rss" }];
  await assert.rejects(captureReaderBriefEvidence(params, fake({ summary })),
    /reader brief source mix must include hacker-news: \["reddit","rss"\]/);
});
test("citation rejection includes original threshold, count and sorted providers", async () => {
  await assert.rejects(captureReaderBriefEvidence(params, fake({
    summary: artifact({ citations: [{ providerKey: "reddit" }] }),
  })), (error) => {
    assert.match(error.message, /reader brief citations must include at least 2 provider families:/);
    assert.match(error.message, /"citationCount":1/);
    assert.match(error.message, /"sourceMixProviderKeys":\["hacker-news","reddit","rss"\]/);
    return true;
  });
});
