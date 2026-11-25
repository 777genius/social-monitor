import {
  canonicalJsonSha256,
  selectedAgentRuntimeOutput,
} from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import { openAiReaderSummaryJsonSchema } from "@social-monitor/summary/adapters/model/openai-responses-reader-summary-schema";
import { MeteredReaderSummaryModelAdapter } from "@social-monitor/summary/adapters/model/metered-reader-summary-model.adapter";
import { ExecuteReaderSummaryJobUseCase } from "@social-monitor/summary/features/execute-reader-summary-job/execute-reader-summary-job.use-case";
import type {
  AgentRuntimeClientPort,
  AgentRuntimeHealthResult,
  AgentRuntimeTaskCommand,
  AgentRuntimeTaskResult,
} from "@social-monitor/summary/ports";

export const readerSummaryHttpFixtureIdentity = Object.freeze({
  jobId: "00000000-0000-7000-8000-000000000703",
  artifactId: "00000000-0000-7000-8000-000000000704",
  provider: "agent-runtime",
  agentProvider: "codex",
  model: "gpt-5.6-sol",
  effort: "high",
  modelVersion: "codex:gpt-5.6-sol:high",
});

export const readerSummaryHttpFixtureUsage = Object.freeze({
  inputTokens: 4_321,
  outputTokens: 789,
  totalTokens: 5_110,
  estimatedCostUsd: 0,
});

const promotedFeedItemIds = [
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
] as const;

export class ReaderSummaryAgentRuntimeFixture implements AgentRuntimeClientPort {
  private readonly commands: AgentRuntimeTaskCommand[] = [];

  get callCount(): number {
    return this.commands.length;
  }

  async runTask(
    command: AgentRuntimeTaskCommand,
  ): Promise<AgentRuntimeTaskResult> {
    this.commands.push(command);
    if (this.commands.length !== 1) {
      throw new Error(
        "Reader summary HTTP fixture rejected an unexpected repair or second runtime call",
      );
    }
    assertReaderSummaryAgentRuntimeCommand(command);

    const structuredOutput = buildFixtureStructuredOutput(command);
    const selectedOutput = selectedAgentRuntimeOutput({ structuredOutput });
    return {
      status: "completed",
      structuredOutput,
      warnings: [],
      usage: readerSummaryHttpFixtureUsage,
      executionAttestation: {
        schemaVersion: 1,
        requestId: command.requestId,
        purpose: command.purpose,
        canonicalRequestSha256: canonicalJsonSha256(command),
        provider: command.provider,
        model: readerSummaryHttpFixtureIdentity.model,
        reasoningEffort: readerSummaryHttpFixtureIdentity.effort,
        runtimeEngine: "subscription-runtime-cli",
        runtimePackageVersion: "0.0.0-reader-summary-e2e.1",
        launcherSha256: canonicalJsonSha256({
          fixture: "reader-summary-http-agent-runtime",
        }),
        selectedOutputKind: selectedOutput.kind,
        selectedOutputSha256: selectedOutput.sha256,
      },
    };
  }

  async checkHealth(service: string): Promise<AgentRuntimeHealthResult> {
    void service;
    throw new Error(
      "Reader summary HTTP fixture forbids runtime health checks and real gRPC connections",
    );
  }

  assertExactlyOneGenerateRequest(): void {
    fixtureInvariant(
      this.commands.length === 1,
      `expected exactly one generate request, observed ${this.commands.length}`,
    );
    fixtureInvariant(
      this.commands[0]?.purpose ===
        "social_monitor.reader_summary.generate.v2",
      "the only runtime request must be reader-summary generation",
    );
  }
}

export const assertReaderSummaryAgentRuntimeCommand = (
  command: AgentRuntimeTaskCommand,
): void => {
  fixtureInvariant(
    command.purpose === "social_monitor.reader_summary.generate.v2",
    "runtime purpose must be social_monitor.reader_summary.generate.v2",
  );
  fixtureInvariant(
    command.provider === readerSummaryHttpFixtureIdentity.agentProvider,
    "runtime provider must be codex",
  );
  fixtureInvariant(
    command.controls.model === readerSummaryHttpFixtureIdentity.model,
    "runtime controls.model must be gpt-5.6-sol",
  );
  fixtureInvariant(
    command.controls.reasoningEffort ===
      readerSummaryHttpFixtureIdentity.effort,
    "runtime controls.reasoningEffort must be high",
  );
  fixtureInvariant(
    command.metadata?.reasoningEffort ===
      readerSummaryHttpFixtureIdentity.effort,
    "runtime metadata.reasoningEffort must be high",
  );
  fixtureInvariant(
    command.metadata?.attempt === "primary",
    "runtime metadata.attempt must be primary",
  );
  fixtureInvariant(
    command.controls.interactive === false,
    "runtime controls must be noninteractive",
  );
  fixtureInvariant(
    command.controls.outputSchemaName ===
      "social_monitor_reader_summary_artifact" &&
      command.controls.schemaVersion === "reader_summary.artifact.v1",
    "runtime structured-output controls must target the reader-summary artifact schema",
  );
  fixtureInvariant(
    canonicalJsonSha256(command.outputSchema) ===
      canonicalJsonSha256(openAiReaderSummaryJsonSchema),
    "runtime output schema must match the production reader-summary schema",
  );
  fixtureInvariant(
    toolsAreDisabled(command.controls),
    "runtime controls must keep tools disabled",
  );
};

export const assertReaderSummaryHttpFixtureProductionWiring = (
  executeReaderSummary: ExecuteReaderSummaryJobUseCase,
  selectedModel: MeteredReaderSummaryModelAdapter,
): void => {
  const wired = executeReaderSummary as unknown as {
    readonly readerSummaryModel?: unknown;
  };
  fixtureInvariant(
    executeReaderSummary instanceof ExecuteReaderSummaryJobUseCase &&
      selectedModel instanceof MeteredReaderSummaryModelAdapter &&
      wired.readerSummaryModel === selectedModel,
    "execute use case and selected model must come from the production Nest factory",
  );
};

type FixturePersistenceState = Readonly<{
  rawJob: Readonly<Record<string, unknown>>;
  repositoryJob: Readonly<Record<string, unknown>>;
  rawArtifact: Readonly<Record<string, unknown>>;
  repositoryArtifact: Readonly<Record<string, unknown>>;
  publication: Readonly<Record<string, unknown>>;
}>;

export const assertReaderSummaryHttpFixturePersistence = (
  state: FixturePersistenceState,
): void => {
  const identity = readerSummaryHttpFixtureIdentity;
  assertJobBinding(state.rawJob, "COMPLETED", "readerSummaryArtifactId");
  assertJobBinding(state.repositoryJob, "completed", "readerSummaryId");

  fixtureInvariant(
    state.rawArtifact.id === identity.artifactId,
    "raw artifact identity must match the fixture artifact",
  );
  fixtureInvariant(
    state.repositoryArtifact.readerSummaryId === identity.artifactId,
    "repository artifact identity must match the fixture artifact",
  );
  fixtureInvariant(
    state.rawArtifact.modelVersion === identity.modelVersion,
    "raw artifact model_version must be codex:gpt-5.6-sol:high",
  );

  const payload = objectValue(
    state.rawArtifact.artifactPayload,
    "raw artifact payload",
  );
  const qualitySignals = objectValue(
    state.rawArtifact.qualitySignals,
    "raw artifact quality signals",
  );
  assertLineage(objectValue(payload.lineage, "artifact payload lineage"));
  assertLineage(objectValue(
    state.repositoryArtifact.lineage,
    "repository artifact lineage",
  ));
  assertUsage(objectValue(payload.usage, "artifact payload usage"));
  assertUsage(objectValue(
    qualitySignals.usage,
    "artifact quality-signals usage",
  ));
  assertUsage(objectValue(
    state.repositoryArtifact.usage,
    "repository artifact usage",
  ));

  fixtureInvariant(
    state.publication.publicationId === identity.artifactId &&
      state.publication.readerSummaryJobId === identity.jobId &&
      state.publication.readerSummaryArtifactId === identity.artifactId,
    "publication must bind the exact fixture job and artifact",
  );
  fixtureInvariant(
    state.publication.modelVersion === identity.modelVersion,
    "publication model_version must match the artifact",
  );
  const proof = objectValue(
    state.publication.exactProof,
    "publication exact proof",
  );
  fixtureInvariant(
    proof.readerSummaryJobId === identity.jobId &&
      proof.readerSummaryArtifactId === identity.artifactId &&
      proof.modelVersion === identity.modelVersion,
    "publication proof must match the fixture job, artifact and model",
  );
};

const assertJobBinding = (
  job: Readonly<Record<string, unknown>>,
  status: string,
  artifactKey: string,
): void => {
  fixtureInvariant(
    job.id === readerSummaryHttpFixtureIdentity.jobId &&
      job.status === status &&
      job[artifactKey] === readerSummaryHttpFixtureIdentity.artifactId,
    `job must be ${status} and bind the exact fixture artifact`,
  );
};

const assertLineage = (lineage: Readonly<Record<string, unknown>>): void => {
  fixtureInvariant(
    lineage.providerVersion === readerSummaryHttpFixtureIdentity.provider &&
      lineage.modelVersion === readerSummaryHttpFixtureIdentity.modelVersion,
    "lineage must preserve agent-runtime and codex:gpt-5.6-sol:high",
  );
};

const assertUsage = (usage: Readonly<Record<string, unknown>>): void => {
  fixtureInvariant(
    usage.inputTokens === readerSummaryHttpFixtureUsage.inputTokens &&
      usage.outputTokens === readerSummaryHttpFixtureUsage.outputTokens &&
      usage.inputTokens + usage.outputTokens ===
        readerSummaryHttpFixtureUsage.totalTokens &&
      usage.estimatedCostUsd === readerSummaryHttpFixtureUsage.estimatedCostUsd,
    "usage must preserve exact provider-reported 4321 input and 789 output tokens",
  );
};

const toolsAreDisabled = (controls: Readonly<Record<string, unknown>>): boolean =>
  controls.toolsEnabled === false && controls.toolPolicy === "none";

const objectValue = (
  value: unknown,
  label: string,
): Readonly<Record<string, unknown>> => {
  fixtureInvariant(
    typeof value === "object" && value !== null && !Array.isArray(value),
    `${label} must be an object`,
  );
  return value as Readonly<Record<string, unknown>>;
};

function fixtureInvariant(
  condition: boolean,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(`Reader summary HTTP fixture contract violation: ${message}`);
  }
}

const buildFixtureStructuredOutput = (
  command: AgentRuntimeTaskCommand,
): Record<string, unknown> => {
  const prompt = objectValue(
    JSON.parse(command.prompt) as unknown,
    "runtime prompt",
  );
  const evidence = recordArray(prompt.evidence, "runtime prompt evidence");
  const clusters = recordArray(
    prompt.storyClusters,
    "runtime prompt story clusters",
  );
  const evidenceById = new Map(
    evidence.map((item) => [String(item.feedItemId), item] as const),
  );
  const clusterByFeedItemId = new Map<
    string,
    Readonly<Record<string, unknown>>
  >();
  for (const cluster of clusters) {
    clusterByFeedItemId.set(String(cluster.representativeFeedItemId), cluster);
    for (const duplicate of stringArray(cluster.duplicateFeedItemIds)) {
      clusterByFeedItemId.set(duplicate, cluster);
    }
  }
  const stories = promotedFeedItemIds.map((feedItemId) => {
    const item = evidenceById.get(feedItemId);
    const cluster = clusterByFeedItemId.get(feedItemId);
    fixtureInvariant(
      item !== undefined,
      `missing fixture evidence ${feedItemId}`,
    );
    fixtureInvariant(
      cluster !== undefined,
      `missing fixture cluster ${feedItemId}`,
    );
    fixtureInvariant(
      typeof item.title === "string" &&
        typeof item.citationId === "string" &&
        typeof cluster.id === "string",
      `fixture evidence ${feedItemId} must retain title, citation and cluster identity`,
    );
    return {
      storyClusterId: cluster.id,
      title: item.title,
      summary: `${String(item.title)} is a deterministic fixture signal. It matters because the accepted production promotion policy selected it for the reader. The cited source preserves the exact item identity and provider evidence. No provider claim is added beyond the fixture evidence.`,
      interestIds: stringArray(cluster.interestIds),
      providerKeys: stringArray(cluster.providerKeys),
      citationIds: [item.citationId],
    };
  });
  const coverage = objectValue(prompt.coveragePlan, "runtime coverage plan");
  const narrativeSections = fixtureNarrativeSections(coverage);
  const firstStoryCitation = stories[0]?.citationIds[0];
  fixtureInvariant(
    typeof firstStoryCitation === "string",
    "fixture output must contain a first story citation",
  );
  return {
    headline: "Reader signals span official updates and community discussion",
    executiveSummary:
      "The deterministic runtime fixture summarizes the accepted reader signals.",
    narrativeSections,
    content: emptyRawReaderContent(),
    topStories: stories,
    interestHighlights: [],
    repeatedSignals: [],
    risksAndUnknowns: [
      {
        description:
          "The fixture intentionally preserves source-specific uncertainty.",
        citationIds: [firstStoryCitation],
        reason: "source_limit",
      },
    ],
    citationMap: stories.map((story, index) => {
      const item = evidenceById.get(promotedFeedItemIds[index]!);
      fixtureInvariant(item !== undefined, "fixture citation evidence is missing");
      return {
        citationId: story.citationIds[0],
        feedItemId: item.feedItemId,
        sourceItemId: item.sourceItemId,
        providerKey: item.providerKey,
        field: "title",
      };
    }),
    qualityFlags: [],
    confidence: {
      level: "high",
      score: 0.9,
      rationale:
        "The fixture is grounded in the accepted deterministic evidence set.",
    },
    noSignalReason: null,
  };
};

const fixtureNarrativeSections = (
  coverage: Readonly<Record<string, unknown>>,
): readonly Record<string, unknown>[] => {
  const lead = objectValue(coverage.lead, "runtime coverage lead");
  const secondary = recordArray(
    coverage.secondary,
    "runtime coverage secondary",
  );
  const leadCitations = stringArray(lead.citationIds);
  const leadCitation = leadCitations[0];
  fixtureInvariant(
    leadCitation !== undefined,
    "runtime coverage lead must contain a citation",
  );
  const synthesisCitation = stringArray(secondary[0]?.citationIds)[0];
  return [
    {
      kind: "lead",
      title: "Overview",
      text: "Official updates and community discussion form the strongest accepted reader signals in this fixture window.",
      citationIds:
        coverage.mode === "daily_synthesis" && synthesisCitation !== undefined
          ? [leadCitation, synthesisCitation]
          : leadCitations,
      storyClusterId:
        coverage.mode === "daily_synthesis" ? null : lead.storyClusterId,
    },
    ...secondary.map((item) => ({
      kind: "secondary_signal",
      title: "Additional signal",
      text: "This accepted source adds a distinct, cited signal to the reader summary window.",
      citationIds: stringArray(item.citationIds),
      storyClusterId: item.storyClusterId,
    })),
  ];
};

const emptyRawReaderContent = (): Readonly<Record<string, unknown>> => ({
  headline: "Reader signals span official updates and community discussion",
  oneLineTakeaway: "Accepted fixture evidence provides the reader summary.",
  bullets: [],
  interestSections: [],
  sourceMix: [],
  topReads: [],
  claimBoard: [],
  reliabilityReport: {
    mode: "shadow",
    policyVersion: "reader_summary.reliability.shadow.v1",
    riskLevel: "low",
    riskScore: 0,
    risks: [],
  },
  trendDelta: {
    newSignals: [],
    growingSignals: [],
    repeatedSignals: [],
    fadingSignals: [],
  },
  openQuestions: [],
  risks: [],
  nextActions: [],
});

const recordArray = (
  value: unknown,
  label: string,
): readonly Readonly<Record<string, unknown>>[] => {
  fixtureInvariant(Array.isArray(value), `${label} must be an array`);
  return value.map((item) => objectValue(item, label));
};

const stringArray = (value: unknown): readonly string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
