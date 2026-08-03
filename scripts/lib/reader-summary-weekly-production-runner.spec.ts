import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { canonicalizeReaderSummaryWeeklyJson } from "../../libs/summary/domain/value-objects/reader-summary-weekly-canonical-json";
import { readerSummaryWeeklyCanonicalProviderKeys } from "../../libs/summary/domain/value-objects/reader-summary-weekly-daily-certification";
import {
  readerSummaryWeeklyModelOutputSchemaVersion,
  type ReaderSummaryWeeklyModelInput,
  type ReaderSummaryWeeklyModelOutput,
  type ReaderSummaryWeeklyModelPort,
} from "../../libs/summary/ports/reader-summary-weekly-model.port";
import type {
  AgentRuntimeClientPort,
  AgentRuntimeExecutionAttestation,
  AgentRuntimeHealthResult,
  AgentRuntimeTaskCommand,
  AgentRuntimeTaskResult,
} from "../../libs/summary/ports/agent-runtime-client.port";
import {
  AgentRuntimeReaderSummaryWeeklyTextModel,
  buildModelInputFromDbState,
  runReaderSummaryWeeklyProduction,
} from "./reader-summary-weekly-production-runner";
import {
  resolveReaderSummaryWeeklyProductionWindow,
  type ReaderSummaryWeeklyProductionCertification,
  type ReaderSummaryWeeklyProductionDbState,
} from "./reader-summary-weekly-production-postgres-contract";

const tenantId = "11111111-1111-4111-8111-111111111111";
const workspaceId = "22222222-2222-4222-8222-222222222222";
const window = resolveReaderSummaryWeeklyProductionWindow("2026-07-20");

describe("agent-runtime reader summary weekly text model", () => {
  it("accepts exact gpt-5.6-sol xhigh output_text runtime execution", async () => {
    const input = completeModelInput();
    const outputText = JSON.stringify(outputFor(input));
    const client = new FakeAgentRuntimeClient({
      status: "completed",
      outputText,
      warnings: [],
      executionAttestation: productionExecutionAttestation(),
    });

    const output = await new AgentRuntimeReaderSummaryWeeklyTextModel({
      client,
    }).generate(input);

    expect(output).toEqual(outputFor(input));
    expect(client.commands).toHaveLength(1);
    expect(client.commands[0]).toMatchObject({
      provider: "codex",
      controls: { model: "gpt-5.6-sol" },
      metadata: {
        reasoningEffort: "xhigh",
        runtimeOutput: "output_text",
      },
    });
  });

  it("fails when execution attestation is missing", async () => {
    const input = completeModelInput();
    const client = new FakeAgentRuntimeClient({
      status: "completed",
      outputText: JSON.stringify(outputFor(input)),
      warnings: [],
    });

    await expect(
      new AgentRuntimeReaderSummaryWeeklyTextModel({ client }).generate(input),
    ).rejects.toThrow(/attestation must prove codex gpt-5\.6-sol xhigh output_text/u);
  });

  it.each([
    ["provider", { provider: "claude" as const }],
    ["model", { model: "gpt-5.5" }],
    ["reasoning effort", { reasoningEffort: "high" }],
    [
      "selected output kind",
      { selectedOutputKind: "structured_output" as const },
    ],
  ])(
    "fails when execution attestation has the wrong %s",
    async (_label, override) => {
      const input = completeModelInput();
      const client = new FakeAgentRuntimeClient({
        status: "completed",
        outputText: JSON.stringify(outputFor(input)),
        warnings: [],
        executionAttestation: productionExecutionAttestation(override),
      });

      await expect(
        new AgentRuntimeReaderSummaryWeeklyTextModel({ client }).generate(input),
      ).rejects.toThrow(
        /attestation must prove codex gpt-5\.6-sol xhigh output_text/u,
      );
    },
  );

  it("rejects structured-only output without falling back", async () => {
    const input = completeModelInput();
    const client = new FakeAgentRuntimeClient({
      status: "completed",
      structuredOutput: { ...outputFor(input) },
      warnings: [],
      executionAttestation: productionExecutionAttestation({
        selectedOutputKind: "structured_output",
      }),
    });

    await expect(
      new AgentRuntimeReaderSummaryWeeklyTextModel({ client }).generate(input),
    ).rejects.toThrow(/returned no text/u);
  });
});

describe("reader summary weekly production runner", () => {
  it("writes a complete weekly artifact and proof from certified DB evidence", async () => {
    const model = new FakeWeeklyModel((input) => outputFor(input));
    const outputDirectory = tempDir();

    const result = await runReaderSummaryWeeklyProduction({
      dbState: completeDbState(),
      outputDirectory,
      model,
      replay: false,
      generatedAt: new Date("2026-07-27T06:30:00.000Z"),
    });

    expect(result.status).toBe("complete");
    expect(result.modelCallPerformed).toBe(true);
    expect(result.writePerformed).toBe(true);
    expect(result.artifactPath).toBe(
      join(
        outputDirectory,
        "reader-summary-weekly-production.2026-07-20.artifact.v1.json",
      ),
    );
    expect(result.proofPath).toBe(
      join(
        outputDirectory,
        "reader-summary-weekly-production.2026-07-20.proof.v1.json",
      ),
    );
    expect(result.replayCanaryPath).toBeNull();
    expect(result.replayCanaryWritePerformed).toBe(false);
    expect(model.calls).toBe(1);
    const artifact = JSON.parse(readFileSync(result.artifactPath!, "utf8"));
    const proof = JSON.parse(readFileSync(result.proofPath!, "utf8"));
    expect(artifact.status).toBe("complete");
    expect(artifact.editorialQuality.blockingPassed).toBe(true);
    expect(artifact.qualityGate).toEqual({
      schemaVersion: "reader_summary.weekly_production_quality_gate.v1",
      evaluator: "deterministic",
      decision: "allow",
      checks: {
        editorialPolicyPassed: true,
        weeklySynthesisIsCoherent: true,
        synthesisCitesAtLeastThreeDays: true,
        synthesisCitesMultipleProviders: true,
        synthesisDayDominanceIsControlled: true,
        synthesisProviderDominanceIsControlled: true,
      },
      metrics: {
        synthesisCitationCount: 12,
        synthesisCitedDayCount: 6,
        synthesisCitedProviderCount: 2,
        dominantSynthesisDayCitationShare: 1 / 6,
        dominantSynthesisProviderCitationShare: 1 / 2,
      },
    });
    expect(artifact.canary).toEqual({
      schemaVersion: "reader_summary.weekly_production_canary.v1",
      mode: "fail_closed",
      status: "passed",
      artifactWriteAuthorized: true,
      qualityGateSha256: proof.qualityGateSha256,
    });
    expect(proof.canarySha256).toBe(
      canonicalizeReaderSummaryWeeklyJson(artifact.canary).sha256,
    );
    expect(proof.certificationCount).toBe(7);
    expect(proof.model).toEqual({
      provider: "agent-runtime",
      agentProvider: "codex",
      model: "gpt-5.6-sol",
      reasoningEffort: "xhigh",
      runtimeOutput: "output_text",
    });
    expect(proof.zeroProviderCalls).toBe(true);
  });

  it("replays existing evidence into one immutable canary without model calls", async () => {
    const outputDirectory = tempDir();
    await runReaderSummaryWeeklyProduction({
      dbState: completeDbState(),
      outputDirectory,
      model: new FakeWeeklyModel((input) => outputFor(input)),
      replay: false,
      generatedAt: new Date("2026-07-27T06:30:00.000Z"),
    });
    const artifactPath = join(
      outputDirectory,
      "reader-summary-weekly-production.2026-07-20.artifact.v1.json",
    );
    const proofPath = join(
      outputDirectory,
      "reader-summary-weekly-production.2026-07-20.proof.v1.json",
    );
    const replayCanaryPath = join(
      outputDirectory,
      "reader-summary-weekly-production.2026-07-20.replay-canary.v1.json",
    );
    const artifactMtime = statSync(artifactPath).mtimeMs;
    const proofMtime = statSync(proofPath).mtimeMs;
    const replayModel = new FakeWeeklyModel((input) => outputFor(input));

    const result = await runReaderSummaryWeeklyProduction({
      dbState: completeDbState(),
      outputDirectory,
      model: replayModel,
      replay: true,
      generatedAt: new Date("2026-07-27T07:00:00.000Z"),
    });

    expect(result.status).toBe("complete");
    expect(result.replayed).toBe(true);
    expect(result.modelCallPerformed).toBe(false);
    expect(result.writePerformed).toBe(false);
    expect(result.replayCanaryWritePerformed).toBe(true);
    expect(result.replayCanaryPath).toBe(replayCanaryPath);
    expect(replayModel.calls).toBe(0);
    expect(statSync(artifactPath).mtimeMs).toBe(artifactMtime);
    expect(statSync(proofPath).mtimeMs).toBe(proofMtime);
    expect(statSync(replayCanaryPath).mode & 0o777).toBe(0o444);
    const replayCanary = JSON.parse(readFileSync(replayCanaryPath, "utf8"));
    expect(replayCanary).toMatchObject({
      schemaVersion: "reader_summary.weekly_production_replay_canary.v1",
      status: "passed",
      weekStartedOn: "2026-07-20",
      weekEndedOn: "2026-07-26",
      zeroModelCalls: true,
      zeroProviderCalls: true,
      zeroArtifactWrites: true,
    });
    expect(replayCanary.artifactSha256).toBe(
      canonicalizeReaderSummaryWeeklyJson(
        JSON.parse(readFileSync(artifactPath, "utf8")),
      ).sha256,
    );
    expect(replayCanary.proofSha256).toBe(
      canonicalizeReaderSummaryWeeklyJson(
        JSON.parse(readFileSync(proofPath, "utf8")),
      ).sha256,
    );
    const replayCanaryMtime = statSync(replayCanaryPath).mtimeMs;

    const secondReplay = await runReaderSummaryWeeklyProduction({
      dbState: completeDbState(),
      outputDirectory,
      model: replayModel,
      replay: true,
      generatedAt: new Date("2026-07-27T08:00:00.000Z"),
    });

    expect(secondReplay.status).toBe("complete");
    expect(secondReplay.replayCanaryWritePerformed).toBe(false);
    expect(statSync(replayCanaryPath).mtimeMs).toBe(replayCanaryMtime);
    expect(replayModel.calls).toBe(0);
  });

  it("does not call the model or write when replay is missing artifacts", async () => {
    const model = new FakeWeeklyModel((input) => outputFor(input));

    const result = await runReaderSummaryWeeklyProduction({
      dbState: completeDbState(),
      outputDirectory: tempDir(),
      model,
      replay: true,
      generatedAt: new Date("2026-07-27T07:00:00.000Z"),
    });

    expect(result.status).toBe("partial");
    expect(result.replayed).toBe(true);
    expect(result.modelCallPerformed).toBe(false);
    expect(result.writePerformed).toBe(false);
    expect(result.replayCanaryWritePerformed).toBe(false);
    expect(result.replayCanaryPath).toBeNull();
    expect(result.blockingReasons).toEqual([
      "replay requested but weekly artifact/proof is missing",
    ]);
    expect(model.calls).toBe(0);
  });

  it("rejects a canonical proof whose sealed daily evidence is divergent", async () => {
    const outputDirectory = tempDir();
    await runReaderSummaryWeeklyProduction({
      dbState: completeDbState(),
      outputDirectory,
      model: new FakeWeeklyModel((input) => outputFor(input)),
      replay: false,
      generatedAt: new Date("2026-07-27T06:30:00.000Z"),
    });
    const proofPath = join(
      outputDirectory,
      "reader-summary-weekly-production.2026-07-20.proof.v1.json",
    );
    const proof = JSON.parse(readFileSync(proofPath, "utf8")) as {
      dailyCertificationIds: string[];
    };
    proof.dailyCertificationIds[0] = "divergent-certification";
    chmodSync(proofPath, 0o644);
    writeFileSync(
      proofPath,
      canonicalizeReaderSummaryWeeklyJson(proof).toBytes(),
    );
    const replayModel = new FakeWeeklyModel((input) => outputFor(input));

    await expect(
      runReaderSummaryWeeklyProduction({
        dbState: completeDbState(),
        outputDirectory,
        model: replayModel,
        replay: true,
        generatedAt: new Date("2026-07-27T07:00:00.000Z"),
      }),
    ).rejects.toThrow(/does not match DB input/u);
    expect(replayModel.calls).toBe(0);
  });

  it("rejects seven daily summaries stitched into a weekly output", async () => {
    const outputDirectory = tempDir();
    await expect(
      runReaderSummaryWeeklyProduction({
        dbState: completeDbState(),
        outputDirectory,
        model: new FakeWeeklyModel((input) => stitchedDailyOutput(input)),
        replay: false,
        generatedAt: new Date("2026-07-27T06:30:00.000Z"),
      }),
    ).rejects.toThrow(/stitched daily|daily or dated/i);
    expect(productionArtifactExists(outputDirectory)).toBe(false);
  });

  it("fails closed when synthesis citations do not span the certified week", async () => {
    const outputDirectory = tempDir();

    await expect(
      runReaderSummaryWeeklyProduction({
        dbState: completeDbState(),
        outputDirectory,
        model: new FakeWeeklyModel((input) => narrowSynthesisOutput(input)),
        replay: false,
        generatedAt: new Date("2026-07-27T06:30:00.000Z"),
      }),
    ).rejects.toThrow(
      /Weekly synthesis citations must span at least three certified days.*Weekly synthesis day dominance is unresolved/i,
    );
    expect(productionArtifactExists(outputDirectory)).toBe(false);
  });

  it("deduplicates one stable story while retaining its cross-day observations", () => {
    const dbState = completeDbState();
    const repeatedStoryUrl = "https://example.com/rss/durable-story";
    const repeatedStoryState = Object.freeze({
      ...dbState,
      certifications: Object.freeze(
        dbState.certifications.map((certification) =>
          Object.freeze({
            ...certification,
            providerEvidence: Object.freeze(
              certification.providerEvidence.map((evidence) =>
                evidence.providerKey === "rss"
                  ? Object.freeze({
                      ...evidence,
                      canonicalUrl: repeatedStoryUrl,
                      title: "One durable story",
                    })
                  : evidence,
              ),
            ),
          }),
        ),
      ),
    });

    const built = buildModelInputFromDbState(repeatedStoryState);

    expect(built.status).toBe("complete");
    if (built.status !== "complete") {
      throw new Error(built.reasons.join("; "));
    }
    const repeatedObservations = built.input.observations.filter(
      (observation) => observation.providerKey === "rss",
    );
    expect(repeatedObservations).toHaveLength(6);
    expect(
      new Set(repeatedObservations.map((observation) => observation.storyId))
        .size,
    ).toBe(1);
    expect(
      new Set(repeatedObservations.map((observation) => observation.observedOn))
        .size,
    ).toBe(6);
    expect(
      built.input.stories.filter(
        (story) => story.storyId === repeatedObservations[0]!.storyId,
      ),
    ).toHaveLength(1);
  });
});

class FakeWeeklyModel implements ReaderSummaryWeeklyModelPort {
  calls = 0;

  constructor(
    private readonly build: (
      input: ReaderSummaryWeeklyModelInput,
    ) => ReaderSummaryWeeklyModelOutput,
  ) {}

  async generate(
    input: ReaderSummaryWeeklyModelInput,
  ): Promise<ReaderSummaryWeeklyModelOutput> {
    this.calls += 1;
    return this.build(input);
  }
}

class FakeAgentRuntimeClient implements AgentRuntimeClientPort {
  readonly commands: AgentRuntimeTaskCommand[] = [];

  constructor(private readonly result: AgentRuntimeTaskResult) {}

  async runTask(
    command: AgentRuntimeTaskCommand,
  ): Promise<AgentRuntimeTaskResult> {
    this.commands.push(command);
    return this.result;
  }

  async checkHealth(): Promise<AgentRuntimeHealthResult> {
    return {
      status: "serving",
      runtimeEngine: "subscription-runtime-cli",
      runtimeVersion: "1.0.0",
      warnings: [],
    };
  }
}

function productionExecutionAttestation(
  overrides: Partial<AgentRuntimeExecutionAttestation> = {},
): AgentRuntimeExecutionAttestation {
  return {
    schemaVersion: 1,
    requestId: "reader-summary-weekly:test",
    purpose: "social_monitor.reader_summary.weekly.generate",
    canonicalRequestSha256: sha("canonical-request"),
    provider: "codex",
    model: "gpt-5.6-sol",
    reasoningEffort: "xhigh",
    runtimeEngine: "subscription-runtime-cli",
    runtimePackageVersion: "1.0.0",
    launcherSha256: sha("launcher"),
    selectedOutputKind: "output_text",
    selectedOutputSha256: sha("output-text"),
    ...overrides,
  };
}

function completeModelInput(): ReaderSummaryWeeklyModelInput {
  const built = buildModelInputFromDbState(completeDbState());
  if (built.status !== "complete") {
    throw new Error(built.reasons.join("; "));
  }
  return built.input;
}

function completeDbState(): ReaderSummaryWeeklyProductionDbState {
  return Object.freeze({
    status: "complete" as const,
    scope: Object.freeze({
      tenantId,
      workspaceId,
      scope: Object.freeze({ type: "workspace" as const }),
    }),
    window,
    certifications: Object.freeze(window.dates.map(certificationFor)),
    missingDates: Object.freeze([]),
    blockingReasons: Object.freeze([]),
  });
}

function certificationFor(
  date: string,
  index: number,
): ReaderSummaryWeeklyProductionCertification {
  return Object.freeze({
    requestedUtcDate: date,
    tenantId,
    workspaceId,
    scope: Object.freeze({ type: "workspace" as const }),
    scopeKey: "workspace",
    publicationId: `publication:${date}`,
    artifactId: `artifact:${date}`,
    jobId: `job:${date}`,
    reportId: `report:${date}`,
    proofId: `proof:${date}`,
    semanticStatus: "COMPLETED" as const,
    periodStartedAt: `${date}T00:00:00.000Z`,
    periodEndedAt: `${nextDate(date)}T00:00:00.000Z`,
    providerCounts: Object.freeze(
      readerSummaryWeeklyCanonicalProviderKeys.map((providerKey) =>
        Object.freeze({
          providerKey,
          count:
            providerKey === "github-trending-page"
              ? 10
              : providerKey === "rss"
                ? 1
                : 0,
        }),
      ),
    ),
    githubEvidence: Object.freeze({
      schemaVersion: "reader_summary.weekly_publication_github_evidence.v1",
      mode: "verified",
      evidenceCount: 10,
      repositories: Array.from({ length: 10 }, (_, repoIndex) => ({
        rank: repoIndex + 1,
      })),
      sha256: sha(`github:${date}`),
    }),
    providerEvidence: Object.freeze([
      providerEvidence(date, "github-trending-page", index * 2),
      providerEvidence(date, "rss", index * 2 + 1),
    ]),
    report: Object.freeze({ status: "ok" }),
    exactProof: Object.freeze({ status: "ok" }),
    canonicalRecord: Object.freeze({ status: "ok" }),
    canonicalSha256: sha(`cert:${date}`),
    identity: `reader_summary.weekly_publication_evidence.v1:${sha(
      `cert:${date}`,
    )}`,
    recordedAt: `${date}T12:00:00.000Z`,
  });
}

function providerEvidence(date: string, providerKey: string, index: number) {
  const isDurableRssStory = providerKey === "rss";
  return Object.freeze({
    citationId: `citation:${date}:${providerKey}`,
    citationField: "title" as const,
    feedItemId: `feed:${date}:${index}`,
    sourceItemId: `source-item:${date}:${index}`,
    sourceBindingId: `binding:${date}:${index}`,
    providerKey,
    providerItemId: `provider-item:${date}:${index}`,
    canonicalUrl: isDurableRssStory
      ? "https://example.com/rss/durable-story"
      : `https://example.com/${providerKey}/${date}/${index}`,
    title: isDurableRssStory
      ? "One durable reader story"
      : `Durable evidence ${providerKey} ${date}`,
    sourceText:
      `Stable source text for ${providerKey} on ${date} with enough weekly context to cite.`,
    publishedAt: `${date}T08:00:00.000Z`,
    observedAt: `${date}T09:00:00.000Z`,
    sourceContentHash: sha(`${providerKey}:${date}:${index}`),
  });
}

function outputFor(
  input: ReaderSummaryWeeklyModelInput,
): ReaderSummaryWeeklyModelOutput {
  const citations = input.citations.map((citation) => citation.citationId);
  const stories = input.stories.map((story) => {
    const storyCitations = input.citations
      .filter((citation) => citation.storyId === story.storyId)
      .map((citation) => citation.citationId);
    const dates = storyCitations
      .map((citationId) => input.citations.find((item) => item.citationId === citationId)!)
      .map((citation) => citation.observedOn)
      .sort();
    return {
      storyId: story.storyId,
      headline: `Evidence theme ${story.storyId.slice(-8)} holds steady across the week`,
      summary:
        "The cited item captures one stable snapshot in the certified week, keeping the reader account grounded in observed facts without adding unsupported movement.",
      status: "watch" as const,
      observedFrom: dates[0]!,
      observedThrough: dates[dates.length - 1]!,
      citationIds: [...storyCitations],
    };
  });
  const leadCitationIds = citations.slice(0, 12).sort();
  const leadStory = stories.find((story) => story.citationIds.length >= 2);
  if (leadStory === undefined) {
    throw new Error("Positive weekly fixture requires one cross-day story");
  }
  return {
    schemaVersion: readerSummaryWeeklyModelOutputSchemaVersion,
    sealId: input.sealId,
    sealSha: input.sealSha,
    weekStartedOn: input.weekStartedOn,
    weekEndedOn: input.weekEndedOn,
    headline: "Certified reader evidence points to steady developer attention",
    headlineCitationIds: [...leadCitationIds],
    takeaway:
      "The certified week shows durable attention across developer records and feed records, with each cited signal staying tied to observed facts from the reviewed window.",
    takeawayCitationIds: [...leadCitationIds],
    synthesis:
      "Across the certified week, cited developer records and feed records show a steady reader-relevant picture. The facts give enough breadth to explain why the account matters to readers while staying tied to observed items. The text treats the week as one editorial unit and keeps every statement within the cited facts.",
    synthesisCitationIds: [...leadCitationIds],
    stories,
    sections: [
      {
        sectionId: "section:lead",
        storyId: leadStory.storyId,
        kind: "lead" as const,
        claimType: "snapshot" as const,
        heading: "Steady certified reader signal",
        text:
          "The lead item gives readers a grounded snapshot of the certified week, connecting developer and feed context without adding claims beyond the cited records.",
        observedFrom: leadStory.observedFrom,
        observedThrough: leadStory.observedThrough,
        citationIds: [...leadStory.citationIds],
      },
    ],
  };
}

function stitchedDailyOutput(
  input: ReaderSummaryWeeklyModelInput,
): ReaderSummaryWeeklyModelOutput {
  const output = outputFor(input);
  return {
    ...output,
    synthesis:
      "Monday: daily summary evidence starts the week. Tuesday: daily summary evidence continues. Wednesday: daily summary evidence continues. Thursday: daily summary evidence continues. Friday: daily summary evidence continues. Saturday: daily summary evidence continues. Sunday: daily summary evidence closes the week with seven daily summaries stitched together.",
  };
}

function narrowSynthesisOutput(
  input: ReaderSummaryWeeklyModelInput,
): ReaderSummaryWeeklyModelOutput {
  const output = outputFor(input);
  const firstDay = input.weekStartedOn;
  return {
    ...output,
    synthesisCitationIds: input.citations
      .filter((citation) => citation.observedOn === firstDay)
      .map((citation) => citation.citationId),
  };
}

function productionArtifactExists(outputDirectory: string): boolean {
  return (
    existsSync(
      join(
        outputDirectory,
        "reader-summary-weekly-production.2026-07-20.artifact.v1.json",
      ),
    ) ||
    existsSync(
      join(
        outputDirectory,
        "reader-summary-weekly-production.2026-07-20.proof.v1.json",
      ),
    ) ||
    existsSync(
      join(
        outputDirectory,
        "reader-summary-weekly-production.2026-07-20.replay-canary.v1.json",
      ),
    )
  );
}

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "reader-summary-weekly-production-"));
}

function nextDate(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function sha(input: string): string {
  return canonicalizeReaderSummaryWeeklyJson({ input }).sha256;
}
