/** No database: local evidence contract, with accepted supplemental producer input. */
import assert from "node:assert/strict";
import { successorGitHubProjection } from "./reader-summary-successor-publication-github";
import { buildReaderSummaryPublicationRequestV2, readerSummaryPublicationHasWeeklyDailyEvidence } from "@social-monitor/summary/adapters/persistence/reader-summary-weekly-publication-evidence";
import { successorPublicationCommand } from "./reader-summary-successor-publication-evidence";
import { fixtureJob, fixtureId, fixtureNow, fixtureObservedThrough } from "./reader-summary-successor-fixture-seed";
import { buildReaderSummaryPublicationPayload } from "@social-monitor/summary/adapters/persistence/reader-summary-publication-proof";
import { verifyHistoricalPromotionArtifact } from "./reader-summary-promotion-v2-historical-artifact";
import { serializeReaderSummaryArtifact } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-json";

test("validates publication evidence and rejects invalid bindings and operation dates", () => {
  const running = fixtureJob(fixtureId(80), "synthetic:publication-contract", fixtureNow).start({ startedAt: fixtureNow });
  const command = successorPublicationCommand(running, fixtureId(81), fixtureId(82), successorGitHubProjection());
  const artifact = command.artifact.toSnapshot();
  assert.equal(command.publicationDecision.status, "published", "real domain policy evaluation");
  assert.equal(artifact.promotionAttestations?.length, 1);
  assert.equal(artifact.promotionAttestations[0]?.policyVersion, "reader_post_promotion.v2");
  assert.equal(artifact.sourceWindow.ingestionCutoff?.toISOString(), fixtureObservedThrough);
  assert.equal(command.finalJob.toSnapshot().requestedAt.toISOString(), fixtureNow.toISOString());
  const record = { artifactId: artifact.readerSummaryId, status: "COMPLETED", tenantId: artifact.tenantId,
    workspaceId: artifact.workspaceId, scopeType: "workspace", interestId: null, cadence: "daily",
    periodStartedAt: artifact.period.startedAt, periodEndedAt: artifact.period.endedAt, periodTimezone: "UTC",
    userId: null, subscriptionId: null, headline: artifact.headline, summaryText: artifact.executiveSummary,
    createdAt: fixtureNow, artifactPayload: serializeReaderSummaryArtifact(command.artifact) };
  assert.equal(verifyHistoricalPromotionArtifact(record).kind, "valid-v2");
  assert.throws(() => verifyHistoricalPromotionArtifact({ ...record, artifactPayload: {
    ...record.artifactPayload, promotionAttestations: [],
  } }), /promotion|attestation/i);
  assert.equal(command.githubProjectionAudit.status, "verified");
  assert.equal(command.githubProjectionAudit.bindings.length, 10);
  assert.equal(readerSummaryPublicationHasWeeklyDailyEvidence(command), true);
  assert.deepEqual(buildReaderSummaryPublicationRequestV2(command), {
    schemaVersion: "reader_summary.publication_command.v2", tenantId: artifact.tenantId,
    workspaceId: artifact.workspaceId, readerSummaryJobId: running.toSnapshot().id,
    readerSummaryArtifactId: artifact.readerSummaryId,
  });
  // V1 serialization is only an additional domain binding check, never the SQL invocation.
  assert.equal(buildReaderSummaryPublicationPayload(command).requestedAt, fixtureNow.toISOString());
  assert.throws(() => buildReaderSummaryPublicationPayload({ ...command,
    githubProjectionAudit: { ...command.githubProjectionAudit, bindings: command.githubProjectionAudit.bindings.slice(1) } }),
    /exact verified GitHub projection audit/);
  for (const items of [[], successorGitHubProjection().items.slice(1),
    successorGitHubProjection().items.map((item, index) => index === 0 ? { ...item, sourceContentHash: "0".repeat(64) } : item)]) {
    assert.throws(() => successorPublicationCommand(running, fixtureId(81), fixtureId(82),
      { ...successorGitHubProjection(), items }));
  }
  assert.throws(() => successorPublicationCommand(fixtureJob(fixtureId(80), "synthetic", new Date("2026-09-03T23:00:00Z"))
    .start({ startedAt: fixtureNow }), fixtureId(81), fixtureId(82), successorGitHubProjection()), /later operation date/);
});
