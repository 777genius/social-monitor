import { createHash } from "node:crypto";

import { canonicalJsonSha256 } from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";

import {
  createReaderSummaryWeeklyReviewManifest,
  deriveReaderSummaryWeeklyReviewStoryCandidates,
  type ReaderSummaryWeeklyReviewAuthority,
} from "../../libs/summary/domain/value-objects/reader-summary-weekly-review-manifest";
import type {
  AgentRuntimeClientPort,
  AgentRuntimeTaskCommand,
} from "../../libs/summary/ports/agent-runtime-client.port";
import type {
  FindReaderSummaryWeeklyReviewManifestQuery,
  PersistReaderSummaryWeeklyReviewManifestCommand,
  ReaderSummaryWeeklyReviewManifestPort,
} from "../../libs/summary/ports/reader-summary-weekly-review-manifest.port";
import {
  runReaderSummaryWeeklyReviewProducer,
} from "./reader-summary-weekly-review-producer";
import { ReaderSummaryWeeklySubscriptionRuntimeFailureError } from "./reader-summary-weekly-execution-receipt";

describe("reader summary weekly review producer", () => {
  it("replays an existing seal-bound manifest without model or write calls", async () => {
    const source = authority();
    const existing = manifestFor(source);
    const runtime = fakeRuntime();
    const store = fakeStore(existing);

    const result = await runReaderSummaryWeeklyReviewProducer({
      authorityLoader: { load: async () => source },
      manifestStore: store,
      agentRuntime: runtime,
    });

    expect(result).toMatchObject({
      outcome: "replayed",
      modelCallPerformed: false,
      writePerformed: false,
      manifest: { manifestId: existing.manifestId },
    });
    expect(runtime.runTask).not.toHaveBeenCalled();
    expect(store.persist).not.toHaveBeenCalled();
  });

  it("uses only Codex gpt-5.6-sol xhigh selectors and persists after attestation", async () => {
    const source = authority();
    const candidate = deriveReaderSummaryWeeklyReviewStoryCandidates(source)[0]!;
    const structuredOutput = {
      schemaVersion: "reader_summary.weekly_review_response.v1",
      selections: [{
        story: candidate.story,
        label: "resolution",
        citationSelectors: [candidate.citations[0]!.selector],
        terminalCitationSelector: candidate.citations[0]!.selector,
      }],
    };
    const runtime = fakeRuntime(structuredOutput);
    const store = fakeStore(null);

    const result = await runReaderSummaryWeeklyReviewProducer({
      authorityLoader: { load: async () => source },
      manifestStore: store,
      agentRuntime: runtime,
    });

    const command = (runtime.runTask as jest.Mock).mock.calls[0]?.[0] as AgentRuntimeTaskCommand;
    expect(command).toMatchObject({
      provider: "codex",
      purpose: "social_monitor.reader_summary.weekly.review",
      controls: { model: "gpt-5.6-sol", reasoningEffort: "xhigh" },
      metadata: { reasoningEffort: "xhigh", runtimeOutput: "structured_output" },
    });
    expect(result).toMatchObject({
      outcome: "persisted",
      modelCallPerformed: true,
      writePerformed: true,
    });
    expect(store.persist).toHaveBeenCalledTimes(1);
  });

  it("does not persist an output with a forged attestation", async () => {
    const source = authority();
    const candidate = deriveReaderSummaryWeeklyReviewStoryCandidates(source)[0]!;
    const structuredOutput = {
      schemaVersion: "reader_summary.weekly_review_response.v1",
      selections: [{
        story: candidate.story,
        label: "observation",
        citationSelectors: [candidate.citations[0]!.selector],
      }],
    };
    const runtime = fakeRuntime(structuredOutput, "f".repeat(64));
    const store = fakeStore(null);

    await expect(runReaderSummaryWeeklyReviewProducer({
      authorityLoader: { load: async () => source },
      manifestStore: store,
      agentRuntime: runtime,
    })).rejects.toThrow("execution attestation is invalid");
    expect(store.persist).not.toHaveBeenCalled();
  });

  it("binds an exact seal-bound observation envelope to its raw attested hash", async () => {
    const source = authority();
    const candidate = deriveReaderSummaryWeeklyReviewStoryCandidates(source)[0]!;
    const structuredOutput = {
      responseSchemaVersion: "reader_summary.weekly_review_response.v1",
      sealId: source.sealId,
      findings: [{
        type: "observation",
        story: candidate.story,
        selector: candidate.citations[0]!.selector,
      }],
    };
    const result = await runReaderSummaryWeeklyReviewProducer({
      authorityLoader: { load: async () => source },
      manifestStore: fakeStore(null),
      agentRuntime: fakeRuntime(structuredOutput),
    });

    expect(result.manifest.modelResponseSha256).toBe(
      canonicalJsonSha256(structuredOutput),
    );
    expect(result.manifest.observations).toHaveLength(1);
  });

  it("preserves retryable subscription-runtime failures for the scheduler", async () => {
    const runtime = fakeRuntime();
    runtime.runTask.mockResolvedValue({
      status: "failed",
      warnings: [],
      failure: {
        code: "runtime_unavailable",
        safeMessage: "safe runtime failure",
        retryable: true,
        reconnectRequired: true,
        causeCategory: "transport",
        details: {},
      },
    });
    const store = fakeStore(null);

    let thrown: unknown;
    try {
      await runReaderSummaryWeeklyReviewProducer({
        authorityLoader: { load: async () => authority() },
        manifestStore: store,
        agentRuntime: runtime,
      });
    } catch (error: unknown) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(
      ReaderSummaryWeeklySubscriptionRuntimeFailureError,
    );
    expect(
      (thrown as ReaderSummaryWeeklySubscriptionRuntimeFailureError).failure,
    ).toMatchObject({
      retryable: true,
      code: "runtime_unavailable",
      causeCategory: "transport",
    });
    expect(store.persist).not.toHaveBeenCalled();
  });
});

const fakeStore = (
  existing: ReturnType<typeof manifestFor> | null,
): jest.Mocked<ReaderSummaryWeeklyReviewManifestPort> => ({
  findBySeal: jest.fn(async (query: FindReaderSummaryWeeklyReviewManifestQuery) => {
    void query;
    return existing;
  }),
  persist: jest.fn(async ({ manifest }: PersistReaderSummaryWeeklyReviewManifestCommand) => (
    { outcome: "persisted" as const, manifest }
  )),
});

const fakeRuntime = (
  structuredOutput?: Record<string, unknown>,
  selectedOutputSha256?: string,
): jest.Mocked<AgentRuntimeClientPort> => ({
  runTask: jest.fn(async (command: AgentRuntimeTaskCommand) => {
    if (structuredOutput === undefined) {
      throw new Error("model should not have been called");
    }
    return {
      status: "completed" as const,
      structuredOutput,
      warnings: [],
      executionAttestation: {
        schemaVersion: 1 as const,
        requestId: command.requestId,
        purpose: command.purpose,
        canonicalRequestSha256: sha("request"),
        provider: "codex" as const,
        model: "gpt-5.6-sol",
        reasoningEffort: "xhigh",
        runtimeEngine: "subscription-runtime-cli" as const,
        runtimePackageVersion: "1.2.3",
        launcherSha256: sha("launcher"),
        selectedOutputKind: "structured_output" as const,
        selectedOutputSha256:
          selectedOutputSha256 ?? canonicalJsonSha256(structuredOutput),
      },
    };
  }),
  checkHealth: jest.fn(async (service: string) => {
    void service;
    return {
      status: "serving" as const,
      runtimeEngine: "subscription-runtime-cli",
      runtimeVersion: "1.2.3",
      warnings: [],
    };
  }),
});

const manifestFor = (source: ReaderSummaryWeeklyReviewAuthority) => {
  const candidate = deriveReaderSummaryWeeklyReviewStoryCandidates(source)[0]!;
  return createReaderSummaryWeeklyReviewManifest({
    authority: source,
    selections: [{
      story: candidate.story,
      label: "observation",
      citationSelectors: [candidate.citations[0]!.selector],
    }],
    modelResponseSha256: sha("stored-model-response"),
    executionAttestation: attestation(sha("stored-model-response")),
  });
};

const authority = (): ReaderSummaryWeeklyReviewAuthority => ({
  sealId: `reader_summary.weekly_certification_seal.v1:${sha("seal")}`,
  sealSha256: sha("seal"),
  tenantId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  scope: { type: "workspace" },
  weekStartedOn: "2026-07-20",
  weekEndedOn: "2026-07-26",
  days: Array.from({ length: 7 }, (_, index) => {
    const date = utcDateAfter("2026-07-20", index);
    return {
      requestedUtcDate: date,
      publicationId: `publication:${date}`,
      publicationEvidenceIdentity: `reader_summary.weekly_publication_evidence.v1:${sha(date)}`,
      publicationEvidenceSha256: sha(date),
      providerEvidenceSha256: sha(`provider:${date}`),
      githubEvidenceSha256: sha(`github:${date}`),
      semanticStatus: "COMPLETED" as const,
      githubMode: "verified" as const,
      providerEvidence: [{
        providerKey: "rss" as const,
        citationId: `citation:${date}`,
        feedItemId: `feed:${date}`,
        sourceItemId: `source:${date}`,
        sourceBindingId: `binding:${date}`,
        providerItemId: `provider-item:${date}`,
        canonicalUrl: "https://example.com/stable-story",
        sourceContentHash: sha(`content:${date}`),
        publishedAt: `${date}T08:00:00.000Z`,
        observedAt: `${date}T09:00:00.000Z`,
        title: "Sealed source",
        sourceText: "Sealed source body for weekly review.",
      }],
    };
  }),
});

const attestation = (selectedOutputSha256: string) => ({
  schemaVersion: 1 as const,
  requestId: "reader-summary-weekly-review:stored",
  purpose: "social_monitor.reader_summary.weekly.review" as const,
  canonicalRequestSha256: sha("request"),
  provider: "codex" as const,
  model: "gpt-5.6-sol" as const,
  reasoningEffort: "xhigh" as const,
  runtimeEngine: "subscription-runtime-cli" as const,
  runtimePackageVersion: "1.2.3",
  launcherSha256: sha("launcher"),
  selectedOutputKind: "structured_output" as const,
  selectedOutputSha256,
});

const sha = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const utcDateAfter = (date: string, offset: number): string =>
  new Date(Date.parse(`${date}T00:00:00.000Z`) + offset * 86_400_000)
    .toISOString()
    .slice(0, 10);
