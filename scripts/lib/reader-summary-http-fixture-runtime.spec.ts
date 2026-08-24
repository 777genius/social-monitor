import {
  canonicalJsonSha256,
} from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { openAiReaderSummaryJsonSchema } from "@social-monitor/summary/adapters/model/openai-responses-reader-summary-schema";
import type { AgentRuntimeTaskCommand } from "@social-monitor/summary/ports";

import {
  assertReaderSummaryAgentRuntimeCommand,
  assertReaderSummaryHttpFixturePersistence,
  ReaderSummaryAgentRuntimeFixture,
  readerSummaryHttpFixtureIdentity,
  readerSummaryHttpFixtureUsage,
} from "./reader-summary-http-fixture-runtime";

describe("reader-summary HTTP fixture runtime contract", () => {
  it("accepts only the production reader-summary generate command", () => {
    expect(() => assertReaderSummaryAgentRuntimeCommand(command())).not.toThrow();
  });

  it.each([
    ["wrong model", (value: MutableCommand) => { value.controls.model = "gpt-5.5"; }],
    ["missing model", (value: MutableCommand) => { delete value.controls.model; }],
    ["xhigh effort", (value: MutableCommand) => {
      value.metadata.reasoningEffort = "xhigh";
    }],
    ["missing effort", (value: MutableCommand) => {
      delete value.metadata.reasoningEffort;
    }],
    ["wrong provider", (value: MutableCommand) => { value.provider = "claude"; }],
    ["repair purpose", (value: MutableCommand) => {
      value.purpose = "social_monitor.reader_summary.repair.v2";
    }],
    ["legacy generate purpose", (value: MutableCommand) => {
      value.purpose = "social_monitor.reader_summary.generate";
    }],
    ["interactive mode", (value: MutableCommand) => {
      value.controls.interactive = true;
    }],
    ["tools enabled", (value: MutableCommand) => {
      value.controls.toolsEnabled = true;
    }],
    ["wrong output schema", (value: MutableCommand) => {
      value.outputSchema = { type: "string" };
    }],
  ])("rejects %s", (_label, mutate) => {
    const value = mutableCommand();
    mutate(value);
    expect(() => assertReaderSummaryAgentRuntimeCommand(value)).toThrow(
      /fixture contract violation/u,
    );
  });

  it("returns one correctly hashed attestation with distinctive exact usage", async () => {
    const fixture = new ReaderSummaryAgentRuntimeFixture();
    const value = command();
    const result = await fixture.runTask(value);

    expect(result.usage).toEqual(readerSummaryHttpFixtureUsage);
    expect(result.executionAttestation).toMatchObject({
      requestId: value.requestId,
      purpose: "social_monitor.reader_summary.generate.v2",
      provider: "codex",
      model: "gpt-5.6-sol",
      reasoningEffort: "high",
      canonicalRequestSha256: canonicalJsonSha256(value),
    });
    expect(result.executionAttestation?.selectedOutputSha256).toBe(
      canonicalJsonSha256(result.structuredOutput),
    );
    fixture.assertExactlyOneGenerateRequest();
    await expect(fixture.runTask(value)).rejects.toThrow(
      /unexpected repair or second runtime call/u,
    );
  });

  it("fails closed if composition attempts a runtime health or network path", async () => {
    const fixture = new ReaderSummaryAgentRuntimeFixture();
    await expect(fixture.checkHealth("agent-runtime")).rejects.toThrow(
      /forbids runtime health checks and real gRPC connections/u,
    );
  });

  it("accepts exact raw Prisma, repository and publication bindings", () => {
    expect(() =>
      assertReaderSummaryHttpFixturePersistence(persistenceState()),
    ).not.toThrow();
  });

  it.each([
    ["wrong model", (value: MutableState) => {
      value.rawArtifact.modelVersion = "codex:gpt-5.5:high";
    }],
    ["missing model", (value: MutableState) => {
      value.rawArtifact.modelVersion = "codex::high";
    }],
    ["xhigh effort", (value: MutableState) => {
      value.rawArtifact.modelVersion = "codex:gpt-5.6-sol:xhigh";
    }],
    ["missing effort", (value: MutableState) => {
      value.rawArtifact.modelVersion = "codex:gpt-5.6-sol";
    }],
    ["wrong provider", (value: MutableState) => {
      artifactPayload(value).lineage = {
        ...objectValue(artifactPayload(value).lineage),
        providerVersion: "deterministic",
      };
    }],
    ["artifact column/JSON lineage disagreement", (value: MutableState) => {
      artifactPayload(value).lineage = {
        ...objectValue(artifactPayload(value).lineage),
        modelVersion: "codex:gpt-5.6-sol:xhigh",
      };
    }],
    ["missing tokens", (value: MutableState) => {
      delete objectValue(artifactPayload(value).usage).inputTokens;
    }],
    ["malformed tokens", (value: MutableState) => {
      objectValue(artifactPayload(value).usage).outputTokens = "789";
    }],
    ["negative tokens", (value: MutableState) => {
      objectValue(value.rawArtifact.qualitySignals).usage = {
        inputTokens: -1,
        outputTokens: 789,
        estimatedCostUsd: 0,
      };
    }],
    ["off-by-one tokens", (value: MutableState) => {
      objectValue(value.repositoryArtifact.usage).inputTokens = 4_322;
    }],
    ["job/artifact mismatch", (value: MutableState) => {
      value.rawJob.readerSummaryArtifactId = "different-artifact";
    }],
    ["repository job/artifact mismatch", (value: MutableState) => {
      value.repositoryJob.readerSummaryId = "different-artifact";
    }],
    ["publication job mismatch", (value: MutableState) => {
      value.publication.readerSummaryJobId = "different-job";
    }],
    ["publication artifact mismatch", (value: MutableState) => {
      value.publication.readerSummaryArtifactId = "different-artifact";
    }],
    ["publication proof mismatch", (value: MutableState) => {
      objectValue(value.publication.exactProof).readerSummaryArtifactId =
        "different-artifact";
    }],
  ])("rejects persisted %s", (_label, mutate) => {
    const state = persistenceState();
    mutate(state);
    expect(() => assertReaderSummaryHttpFixturePersistence(state)).toThrow(
      /fixture contract violation/u,
    );
  });
});

type MutableCommand = ReturnType<typeof mutableCommand>;
type MutableState = ReturnType<typeof persistenceState>;
type MutableRecord = Record<string, unknown>;

const command = (): AgentRuntimeTaskCommand => mutableCommand();

const mutableCommand = () => ({
  requestId: "reader-summary-fixture-request",
  tenantId: tenantId("00000000-0000-7000-8000-000000000701"),
  workspaceId: workspaceId("00000000-0000-7000-8000-000000000702"),
  correlationId: "reader-summary-fixture-correlation",
  provider: "codex" as "codex" | "claude",
  purpose: "social_monitor.reader_summary.generate.v2",
  systemPrompt: "Return only fixture JSON.",
  prompt: JSON.stringify(promptPayload()),
  outputSchema: structuredClone(openAiReaderSummaryJsonSchema) as MutableRecord,
  controls: {
    interactive: false,
    outputSchemaName: "social_monitor_reader_summary_artifact",
    schemaVersion: "reader_summary.artifact.v1",
    model: "gpt-5.6-sol",
    maxOutputTokens: 16_000,
  } as MutableRecord,
  timeoutMs: 600_000,
  metadata: {
    adapter: "agent-runtime-reader-summary",
    reasoningEffort: "high",
    attempt: "primary",
  } as Record<string, string>,
});

const promptPayload = () => {
  const ids = [
    "cursor-hn",
    "spacex-github-24",
    "anthropic-watermark-x",
    "github-48-top",
    "reddit-top",
    "reddit-additional",
    "hn-additional",
    "x-additional",
    "github-24-additional",
    "github-48-additional",
  ];
  const evidence = ids.map((feedItemId, index) => ({
    citationId: `c${index + 1}`,
    feedItemId,
    sourceItemId: feedItemId,
    providerKey: "fixture-provider",
    title: `Fixture title ${index + 1}`,
  }));
  const storyClusters = evidence.map((item) => ({
    id: `cluster:${item.feedItemId}`,
    representativeFeedItemId: item.feedItemId,
    duplicateFeedItemIds: [],
    interestIds: ["interest:fixture"],
    providerKeys: [item.providerKey],
  }));
  return {
    evidence,
    storyClusters,
    coveragePlan: {
      mode: "daily_synthesis",
      lead: {
        storyClusterId: storyClusters[0]?.id,
        citationIds: [evidence[0]?.citationId],
      },
      secondary: [{
        storyClusterId: storyClusters[1]?.id,
        citationIds: [evidence[1]?.citationId],
      }],
    },
  };
};

const persistenceState = () => {
  const identity = readerSummaryHttpFixtureIdentity;
  const usage = persistedUsage();
  const lineage = persistedLineage();
  const artifactPayload = { lineage, usage };
  const qualitySignals = { usage: persistedUsage() };
  return {
    rawJob: {
      id: identity.jobId,
      status: "COMPLETED",
      readerSummaryArtifactId: identity.artifactId,
    } as MutableRecord,
    repositoryJob: {
      id: identity.jobId,
      status: "completed",
      readerSummaryId: identity.artifactId,
    } as MutableRecord,
    rawArtifact: {
      id: identity.artifactId,
      modelVersion: identity.modelVersion,
      artifactPayload,
      qualitySignals,
    } as MutableRecord,
    repositoryArtifact: {
      readerSummaryId: identity.artifactId,
      lineage: persistedLineage(),
      usage: persistedUsage(),
    } as MutableRecord,
    publication: {
      publicationId: identity.artifactId,
      readerSummaryJobId: identity.jobId,
      readerSummaryArtifactId: identity.artifactId,
      modelVersion: identity.modelVersion,
      exactProof: {
        readerSummaryJobId: identity.jobId,
        readerSummaryArtifactId: identity.artifactId,
        modelVersion: identity.modelVersion,
      },
    } as MutableRecord,
  };
};

const persistedLineage = () => ({
  providerVersion: readerSummaryHttpFixtureIdentity.provider,
  modelVersion: readerSummaryHttpFixtureIdentity.modelVersion,
});

const persistedUsage = () => ({
  inputTokens: readerSummaryHttpFixtureUsage.inputTokens,
  outputTokens: readerSummaryHttpFixtureUsage.outputTokens,
  estimatedCostUsd: readerSummaryHttpFixtureUsage.estimatedCostUsd,
});

const artifactPayload = (state: MutableState): MutableRecord =>
  objectValue(state.rawArtifact.artifactPayload);

const objectValue = (value: unknown): MutableRecord => value as MutableRecord;
