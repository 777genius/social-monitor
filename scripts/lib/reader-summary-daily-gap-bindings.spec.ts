import { strict as assert } from "node:assert";

import { buildCurrentPublicArtifactSnapshot, currentPublicArtifactBindingsQuery } from "./reader-summary-current-publication-bindings";
import { assertDailyGapPublicationBindings, type DailyGapPublicationRow } from "./reader-summary-daily-gap-bindings";
import { dailyGapPublicationBindingsQuery } from "./reader-summary-daily-gap-query";
import {
  dailyGapTestDatabaseUrl, dailyGapTestDates, dailyGapTestRecord as record,
  dailyGapTestRows, dailyGapTestScope, rehashDailyGapTestRow,
} from "./reader-summary-daily-gap-test-fixtures";
import { canonicalJsonSha256 } from "./reader-summary-quality-eval-support";

const verify = (rows: readonly DailyGapPublicationRow[]) => assertDailyGapPublicationBindings({
  rows, collectionDates: dailyGapTestDates,
  databaseUrl: dailyGapTestDatabaseUrl, scope: dailyGapTestScope,
});
const noSignal = () => dailyGapTestRows()[4]!;
const verifyLast = (row: DailyGapPublicationRow) => verify([...dailyGapTestRows().slice(0, 4), row]);

describe("daily gap terminal publication bindings", () => {
  it("accepts the Aug30..Sep3 gap with four COMPLETED and one canonical NO_SIGNAL", () => {
    const rows = dailyGapTestRows();
    const before = JSON.stringify(rows);
    verify(rows);
    assert.equal(JSON.stringify(rows), before);
    assert.deepEqual(rows.map((row) => [row.semanticStatus, row.status]), [
      ["COMPLETED", "COMPLETED"], ["COMPLETED", "COMPLETED"],
      ["COMPLETED", "COMPLETED"], ["COMPLETED", "COMPLETED"], ["NO_SIGNAL", "NO_SIGNAL"],
    ]);
  });

  it("also accepts an all-COMPLETED gap", () => {
    const rows = dailyGapTestRows().slice(0, 4);
    assertDailyGapPublicationBindings({
      rows, collectionDates: dailyGapTestDates.slice(0, 4),
      databaseUrl: dailyGapTestDatabaseUrl, scope: dailyGapTestScope,
    });
  });

  it("supports exact historical request dates as well as invocation-day dates", () => {
    const row = noSignal();
    const exactProof = { ...record(row.exactProof), requestedUtcDate: row.collectionDate };
    verifyLast({ ...row, publicationRequestedUtcDate: row.collectionDate,
      exactProof, proofSha256: canonicalJsonSha256(exactProof) });
  });

  it("keeps the shared SQL and successful-summary snapshot COMPLETED-only", () => {
    assert.match(currentPublicArtifactBindingsQuery, /publication\.semantic_status = 'COMPLETED'/u);
    assert.match(currentPublicArtifactBindingsQuery, /artifact\.status = 'COMPLETED'/u);
    assert.doesNotMatch(currentPublicArtifactBindingsQuery, /NO_SIGNAL/u);
    assert.throws(() => buildCurrentPublicArtifactSnapshot({
      rows: dailyGapTestRows(), collectionDates: dailyGapTestDates,
      databaseUrl: dailyGapTestDatabaseUrl,
      scope: { ...dailyGapTestScope, scopeType: "workspace", scopeKey: "workspace" },
    }), /scope drifted/u);
  });

  it("preserves every existing SQL binding except the two successful-only status filters", () => {
    const predicates = currentPublicArtifactBindingsQuery.split("\n")
      .map((line) => line.trim())
      .filter((line) => /^(?:on|and) /u.test(line))
      .filter((line) => !["and publication.semantic_status = 'COMPLETED'", "and artifact.status = 'COMPLETED'"].includes(line));
    for (const predicate of predicates) assert.ok(dailyGapPublicationBindingsQuery.includes(predicate), predicate);
    assert.match(dailyGapPublicationBindingsQuery, /publication\.semantic_status in \('COMPLETED', 'NO_SIGNAL'\)/u);
    assert.match(dailyGapPublicationBindingsQuery, /artifact\.status = publication\.semantic_status/u);
  });

  for (const [label, change] of [
    ["missing date", (rows) => rows.slice(0, 4)],
    ["empty result", () => []],
    ["extra duplicate", (rows) => [...rows, rows[4]!]],
    ["duplicate instead of missing day", (rows) => [...rows.slice(0, 4), rows[3]!]],
    ["unsorted result", (rows) => [...rows].reverse()],
    ["mixed capture timestamps", (rows) => rows.map((row, i) => i === 4 ? { ...row, capturedAt: "2026-09-05T00:00:01.000Z" } : row)],
  ] satisfies readonly [string, (rows: DailyGapPublicationRow[]) => DailyGapPublicationRow[]][]) {
    it(`rejects ${label}`, () => assert.throws(() => verify(change(dailyGapTestRows()))));
  }

  for (const [field, value] of [
    ["tenantId", "wrong-tenant"], ["workspaceId", "wrong-workspace"],
    ["scopeType", "interest"], ["scopeKey", "other"], ["cadence", "weekly"],
    ["periodTimezone", "Europe/London"], ["periodKey", "wrong-period"],
    ["collectionDate", "2026-09-02"], ["periodStartedAt", new Date("2026-09-02T00:00:00Z")],
    ["periodEndedAt", new Date("2026-09-05T00:00:00Z")],
    ["publicationKind", "LEGACY"], ["currentPublicationId", null],
    ["currentPublicationId", "00000000-0000-4000-8000-000000009999"],
    ["publicationArtifactId", "00000000-0000-4000-8000-000000009999"],
    ["publicationModelVersion", "other-model"], ["semanticStatus", "COMPLETED"],
    ["modelVersion", undefined], ["promptVersion", ""],
    ["status", "COMPLETED"], ["status", "FAILED"], ["status", "REJECTED"],
    ["publicationReaderSummaryJobId", ""], ["publicationRequestedAt", "invalid"],
    ["publicationRequestedAt", null], ["publicationRequestedUtcDate", "2026-09-02"],
    ["reportSha256", "f".repeat(64)], ["reportSha256", "invalid"],
    ["proofSha256", "f".repeat(64)], ["proofSha256", "invalid"],
    ["exactProof", null], ["headline", "Tampered headline"],
    ["summaryText", "Tampered text"], ["promptVersion", "tampered-prompt"],
    ["artifactPayload", {}], ["citations", []], ["qualitySignals", {}],
  ] as const) {
    // Empty citations are the original NO_SIGNAL value; exercise that report
    // mutation on a successful row instead.
    it(`rejects persisted ${field}=${String(value)} drift`, () => {
      const rows = dailyGapTestRows();
      const index = field === "citations" ? 0 : 4;
      rows[index] = { ...rows[index]!, [field]: value } as DailyGapPublicationRow;
      assert.throws(() => verify(rows));
    });
  }

  for (const [path, value] of [
    [["schemaVersion"], "reader_summary.publication_proof.v2"],
    [["tenantId"], "other"], [["workspaceId"], "other"],
    [["scope", "type"], "interest"], [["scope", "key"], "other"],
    [["scope", "extra"], true], [["period", "cadence"], "weekly"],
    [["period", "timezone"], "other"], [["period", "periodKey"], "other"],
    [["period", "startedAt"], "2026-09-02T00:00:00.000Z"],
    [["period", "endedAt"], "2026-09-05T00:00:00.000Z"],
    [["period", "extra"], true], [["requestedUtcDate"], "2026-09-02"],
    [["requestedAt"], "2026-09-04T01:00:00.000Z"],
    [["readerSummaryJobId"], "other"], [["readerSummaryArtifactId"], "other"],
    [["semanticStatus"], "COMPLETED"], [["modelVersion"], "other"],
    [["reportSha256"], "e".repeat(64)], [["extra"], true],
  ] as const) {
    it(`rejects rehashed exact proof ${path.join(".")} drift`, () => {
      const row = noSignal();
      let target = record(row.exactProof);
      for (const key of path.slice(0, -1)) target = record(target[key]);
      target[path.at(-1)!] = value;
      assert.throws(() => verifyLast({ ...row, proofSha256: canonicalJsonSha256(row.exactProof) }), /exact proof drifted/u);
    });
  }

  it("rejects every missing exact-proof key even when its hash is recomputed", () => {
    for (const key of Object.keys(record(noSignal().exactProof))) {
      const row = noSignal();
      delete record(row.exactProof)[key];
      assert.throws(() => verifyLast({ ...row, proofSha256: canonicalJsonSha256(row.exactProof) }));
    }
  });

  for (const [label, mutate] of [
    ["no flag", (p) => { p.qualityFlags = []; }],
    ["no reason", (p) => { delete p.noSignalReason; }],
    ["empty reason", (p) => { p.noSignalReason = " "; }],
    ["payload tenant", (p) => { p.tenantId = "wrong"; }],
    ["payload workspace", (p) => { p.workspaceId = "wrong"; }],
    ["payload artifact", (p) => { p.readerSummaryId = "wrong"; }],
    ["payload period", (p) => { record(p.period).periodKey = "wrong"; }],
    ["payload scope", (p) => { p.scope = { type: "interest", interestId: "wrong" }; }],
    ["payload model", (p) => { record(p.lineage).modelVersion = "wrong"; }],
    ["payload prompt", (p) => { record(p.lineage).promptVersion = "wrong"; }],
    ["payload headline", (p) => { p.headline = "wrong"; }],
    ["payload text", (p) => { p.executiveSummary = "wrong"; }],
    ["provider evidence", (p) => { p.citationMap = [{ citationId: "synthetic", feedItemId: "synthetic", sourceItemId: "synthetic", providerKey: "hacker-news", field: "title" }]; }],
    ["missing GitHub audit", (_p, q) => { delete q.githubProjectionAudit; }],
    ["rejected GitHub audit", (_p, q) => { record(q.githubProjectionAudit).status = "rejected"; }],
    ["wrong-day GitHub audit", (_p, q) => { record(q.githubProjectionAudit).requestedUtcDay = "2026-09-02"; }],
    ["GitHub repository", (_p, q) => { record(q.githubProjectionAudit).bindings = [{}]; }],
    ["no GitHub scan", (_p, q) => { record(q.githubProjectionAudit).pageCount = 0; }],
    ["missing publication decision", (_p, q) => { delete q.publicationDecision; }],
    ["rejected publication decision", (_p, q) => { record(q.publicationDecision).status = "rejected"; }],
    ["failed quality decision", (_p, q) => { record(q.publicationDecision).qualityPassed = false; }],
  ] satisfies readonly [string, (payload: Record<string, unknown>, quality: Record<string, unknown>) => void][]) {
    it(`rejects rehashed NO_SIGNAL with ${label}`, () => {
      const row = noSignal();
      mutate(record(row.artifactPayload), record(row.qualitySignals));
      assert.throws(() => verifyLast(rehashDailyGapTestRow(row)));
    });
  }

  it("rejects FAILED/FAILED and duplicate identities even with otherwise coherent rows", () => {
    assert.throws(() => verifyLast({ ...noSignal(), semanticStatus: "FAILED", status: "FAILED" }));
    const rows = dailyGapTestRows();
    rows[4] = { ...rows[4]!, publicationId: rows[0]!.publicationId, currentPublicationId: rows[0]!.publicationId };
    assert.throws(() => verify(rows));
  });

  it("rejects a fully rehashed NO_SIGNAL report containing provider citations", () => {
    const row = noSignal();
    const citations = dailyGapTestRows()[0]!.citations;
    record(row.artifactPayload).citationMap = citations;
    assert.throws(() => verifyLast(rehashDailyGapTestRow({ ...row, citations })), /NO_SIGNAL evidence is invalid/u);
  });

  it("rejects coherent wrong-day requests even with a matching recomputed proof hash", () => {
    const row = noSignal();
    const exactProof = { ...record(row.exactProof), requestedUtcDate: "2026-09-02" };
    assert.throws(() => verifyLast({ ...row, exactProof,
      publicationRequestedUtcDate: "2026-09-02", proofSha256: canonicalJsonSha256(exactProof),
    }), /exact proof drifted/u);
  });

  it("keeps completed report and exact-proof validation active", () => {
    for (const change of [{ headline: "tampered" }, { proofSha256: "f".repeat(64) }]) {
      const rows = dailyGapTestRows();
      rows[0] = { ...rows[0]!, ...change };
      assert.throws(() => verify(rows));
    }
  });
});
