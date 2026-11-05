import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import {
  buildReaderSummaryPeriod,
  ReaderSummaryJob,
  type ReaderSummaryArtifact,
  type ReaderSummaryGitHubProjectionAudit,
} from "../../domain";
import type {
  ReaderSummaryJobRepositoryPort,
  ReaderSummaryPublicationPort,
} from "../../ports";

import { publishReaderSummaryJob } from "./publish-reader-summary-job";

const tenant = tenantId("tenant-reader-summary-recovery-publication");
const workspace = workspaceId("workspace-reader-summary-recovery-publication");
const completedAt = new Date("2026-07-24T00:00:00.000Z");

describe("publishReaderSummaryJob V4 recovery boundary", () => {
  it("publishes only the prepublication audit already durably accepted by the repository", async () => {
    const events: string[] = [];
    const publications: ReaderSummaryPublicationPort = {
      publish: async () => {
        events.push("publication");
        return "published";
      },
    };

    const accepted = await publishReaderSummaryJob({
      artifact: artifact(),
      runningJob: runningJob(),
      publicationDecision: publicationDecision,
      githubProjectionAudit: audit,
      jobs: { save: async () => undefined } as unknown as ReaderSummaryJobRepositoryPort,
      publications,
      ids: { generate: () => "reader-summary-ready-event" },
      clock: { now: () => completedAt },
    });

    expect(accepted).toMatchObject({
      ok: true,
      value: { status: "completed", readerSummaryId: "recovery-artifact" },
    });
    expect(events).toEqual(["publication"]);
  });
});

const artifact = (): ReaderSummaryArtifact => ({
  toSnapshot: () => ({
    readerSummaryId: "recovery-artifact",
    qualityFlags: [],
  }),
} as unknown as ReaderSummaryArtifact);

const runningJob = (): ReaderSummaryJob => ReaderSummaryJob.request({
  id: "recovery-job",
  tenantId: tenant,
  workspaceId: workspace,
  scope: { type: "workspace" },
  period: buildReaderSummaryPeriod({
    cadence: "daily",
    startedAt: new Date("2026-07-24T00:00:00.000Z"),
    endedAt: new Date("2026-07-25T00:00:00.000Z"),
    timezone: "UTC",
  }),
  idempotencyKey: "recovery-job",
  requestedAt: new Date("2026-07-24T00:00:00.000Z"),
}).start({ startedAt: completedAt });

const publicationDecision = {
  status: "published" as const,
  qualityPassed: true as const,
  canonicalScore: 1,
  shadow: {
    mode: "shadow" as const,
    policyVersion: "reader_summary_publication_shadow_v1" as const,
    riskScore: 0,
    signals: [],
  },
  reasons: [],
};

const audit: ReaderSummaryGitHubProjectionAudit = {
  schemaVersion: "reader_summary.github_projection.v1",
  status: "verified",
  requestedUtcDay: "2026-07-24",
  pageCount: 1,
  scannedItemCount: 0,
  eligibleBindingIds: [],
  bindings: [],
  violationCodes: [],
  reasons: [],
};
