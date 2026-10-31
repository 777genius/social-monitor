import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import {
  readerSummaryHasVerifiedGitHubProjection,
  type ReaderSummaryArtifact,
  type ReaderSummaryPeriod,
  type ReaderSummaryPublicationPolicy,
  type SummaryEvidenceSelection,
} from "../../domain";
import {
  artifactWithoutGitHubEvidence,
  githubBoardArtifact,
  githubProjectionInput,
} from "../../domain/policies/reader-summary-github-projection-policy.spec-support";
import type { ReaderSummaryGitHubProjectionItem } from "../../domain";
import type { ReaderSummaryGitHubProjectionReaderPort } from "../../ports";
import { withReaderSummaryHistoricalOmissionQuality } from "./reader-summary-historical-omission-quality";
import {
  missingGitHubProjectionOmissionReason,
  resolveMissingGitHubProjectionOmission,
} from "./reader-summary-missing-github-projection";
import { evaluateReaderSummaryPrepublication } from "./reader-summary-prepublication-gate";

const tenant = tenantId("tenant-github-projection");
const workspace = workspaceId("workspace-github-projection");
const day: ReaderSummaryPeriod = { cadence: "daily", startedAt: new Date("2026-07-10T00:00:00.000Z"),
  endedAt: new Date("2026-07-11T00:00:00.000Z"), timezone: "UTC", periodKey: "daily:2026-07-10:UTC" };
const observedThrough = new Date("2026-07-11T01:00:00.000Z");

const reader = (items: readonly ReaderSummaryGitHubProjectionItem[],
  overrides: { readonly eligibleBindingIds?: readonly string[]; readonly pageCount?: number } = {},
): ReaderSummaryGitHubProjectionReaderPort => ({
  async read() {
    return { eligibleBindingIds: overrides.eligibleBindingIds ?? ["github-binding-a"], items,
      pageCount: overrides.pageCount ?? 2 };
  },
});

const resolve = (githubProjectionReader: ReaderSummaryGitHubProjectionReaderPort,
  period: ReaderSummaryPeriod = day, at = observedThrough) =>
  resolveMissingGitHubProjectionOmission({ tenantId: tenant, workspaceId: workspace, period,
    githubProjectionReader, observedThrough: at });

const prepublish = async (artifact: ReaderSummaryArtifact,
  githubProjectionReader: ReaderSummaryGitHubProjectionReaderPort) =>
  evaluateReaderSummaryPrepublication({
    artifact,
    evidence: {} as SummaryEvidenceSelection,
    publicationPolicy: publishingPolicy,
    githubProjectionReader,
    observedThrough,
    historicalGitHubOmission: await resolve(githubProjectionReader),
  });

describe("resolveMissingGitHubProjectionOmission", () => {
  it("publishes a day without any GitHub projection without the GitHub block, flagged and audited", async () => {
    const projection = reader([]);
    const omission = await resolve(projection);
    expect(omission).toEqual({ reason: missingGitHubProjectionOmissionReason, authorizedAt: observedThrough,
      readerQuality: "limited_sources" });
    const draft = { qualityFlags: ["low_confidence"] } as unknown as Parameters<
      typeof withReaderSummaryHistoricalOmissionQuality>[0];
    expect(withReaderSummaryHistoricalOmissionQuality(draft, omission).qualityFlags)
      .toEqual(["low_confidence", "limited_sources"]);

    const artifact = artifactWithoutGitHubEvidence();
    const decision = await prepublish(artifact, projection);
    expect(decision.publicationDecision.status).toBe("published");
    expect(decision.githubProjectionAudit).toMatchObject({ status: "not_required", requestedUtcDay: "2026-07-10",
      historicalOmission: { mode: "github_projection_unavailable_historical",
        reason: missingGitHubProjectionOmissionReason }, violationCodes: [] });
    // The serving and publication proofs accept exactly this audit.
    expect(readerSummaryHasVerifiedGitHubProjection({ artifact, audit: decision.githubProjectionAudit })).toBe(true);
  });

  it("keeps rejecting a day whose projection exists but is incomplete", async () => {
    const projection = reader(githubProjectionInput().slice(0, 4));
    expect(await resolve(projection)).toBeUndefined();

    const decision = await prepublish(artifactWithoutGitHubEvidence(), projection);
    expect(decision.publicationDecision.status).toBe("rejected");
    expect(decision.githubProjectionAudit).toMatchObject({ status: "rejected" });
    expect(decision.githubProjectionAudit).not.toHaveProperty("historicalOmission");
    expect(decision.githubProjectionAudit.violationCodes).toContain("github_projection_missing");
  });

  it("keeps verifying a complete projection and its Top 10 exactly as before", async () => {
    // The board fixture's Watch block lists the first three repositories above 1,000 stars.
    const projection = reader(githubProjectionInput().map((item, index) => ({
      ...item, starsGained: index < 3 ? 1_101 : item.starsGained })));
    expect(await resolve(projection)).toBeUndefined();

    const decision = await prepublish(
      githubBoardArtifact({ selectedPostCount: 10, watchRanks: [1, 2, 3], watchStarsGained: 1_101 }), projection);
    expect(decision.publicationDecision.status).toBe("published");
    expect(decision.githubProjectionAudit).toMatchObject({ status: "verified", eligibleBindingIds: ["github-binding-a"] });
    expect(decision.githubProjectionAudit).not.toHaveProperty("historicalOmission");
  });

  it("still rejects GitHub entries in a summary whose day has no projection", async () => {
    const decision = await prepublish(
      githubBoardArtifact({ selectedPostCount: 10, watchRanks: [1, 2, 3], watchStarsGained: 1_101 }), reader([]));
    expect(decision.publicationDecision.status).toBe("rejected");
  });

  it.each([
    ["two eligible bindings", reader([], { eligibleBindingIds: ["github-binding-a", "github-binding-b"] }), day, observedThrough],
    ["no eligible binding", reader([], { eligibleBindingIds: [] }), day, observedThrough],
    ["an incompletely read eligibility", reader([], { pageCount: 0 }), day, observedThrough],
    ["an unreadable projection", { async read() { throw new Error("database unavailable"); } }, day, observedThrough],
    ["a day still in progress", reader([]), day, new Date("2026-07-10T23:00:00.000Z")],
    ["a weekly period", reader([]), { ...day, cadence: "weekly", endedAt: new Date("2026-07-17T00:00:00.000Z") },
      new Date("2026-07-18T01:00:00.000Z")],
  ] as const)("grants no omission for %s", async (_name, projection, period, at) => {
    expect(await resolve(projection as ReaderSummaryGitHubProjectionReaderPort, period as ReaderSummaryPeriod, at))
      .toBeUndefined();
  });
});

const publishingPolicy = {
  evaluate: () => ({
    status: "published",
    qualityPassed: true,
    canonicalScore: 1,
    shadow: { mode: "shadow", policyVersion: "reader_summary_publication_shadow_v1", riskScore: 0, signals: [] },
    reasons: [],
  }),
} as unknown as ReaderSummaryPublicationPolicy;
