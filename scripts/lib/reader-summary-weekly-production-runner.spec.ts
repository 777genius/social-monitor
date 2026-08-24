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
import { evaluateReaderSummaryWeeklyEditorialQuality } from "../../libs/summary/domain/policies/reader-summary-weekly-editorial-quality-policy";
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
import { ReaderSummaryWeeklySubscriptionRuntimeFailureError } from "./reader-summary-weekly-execution-receipt";
import {
  admittedRunnerInput,
  completeDbState,
  reviewManifestFor,
  sha,
} from "./reader-summary-weekly-production-test-fixture";

describe("agent-runtime reader summary weekly text model", () => {
  it("accepts exact gpt-5.6-sol high output_text runtime execution", async () => {
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
        reasoningEffort: "high",
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
    ).rejects.toThrow(/attestation must prove codex gpt-5\.6-sol high output_text/u);
  });

  it.each([
    ["provider", { provider: "claude" as const }],
    ["model", { model: "gpt-5.5" }],
    ["reasoning effort", { reasoningEffort: "xhigh" }],
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
        /attestation must prove codex gpt-5\.6-sol high output_text/u,
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

  it.each([
    ["transient", true, "backend_unavailable", "runtime_backend"],
    ["terminal", false, "permission_required", "subscription_auth"],
  ])(
    "preserves typed %s subscription-runtime failure metadata",
    async (_label, retryable, code, causeCategory) => {
      const client = new FakeAgentRuntimeClient({
        status: "failed",
        warnings: [],
        failure: {
          code,
          safeMessage: "safe runtime failure",
          retryable,
          reconnectRequired: false,
          causeCategory,
          details: {},
        },
      });
      let thrown: unknown;
      try {
        await new AgentRuntimeReaderSummaryWeeklyTextModel({ client }).generate(
          completeModelInput(),
        );
      } catch (error: unknown) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(
        ReaderSummaryWeeklySubscriptionRuntimeFailureError,
      );
      expect(
        (thrown as ReaderSummaryWeeklySubscriptionRuntimeFailureError).failure,
      ).toMatchObject({ retryable, code, causeCategory });
    },
  );
});

describe("reader summary weekly production runner", () => {
  it("writes a complete weekly artifact and proof from certified DB evidence", async () => {
    const model = new FakeWeeklyModel((input) => outputFor(input));
    const outputDirectory = tempDir();

    const result = await runReaderSummaryWeeklyProduction({
      ...admittedRunnerInput(),
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
    expect(artifact.qualityGate).toMatchObject({
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
    });
    expect(artifact.qualityGate.metrics).toEqual(artifact.editorialQuality.metrics);
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
    expect(artifact.modelInput.manifestSealId).toBe(
      completeDbState().weeklyCertificationSeal?.sealId,
    );
    expect(proof.manifestSealId).toBe(
      completeDbState().weeklyCertificationSeal?.sealId,
    );
    expect(proof.manifestSealSha).toBe(
      completeDbState().weeklyCertificationSeal?.sealSha256,
    );
    const reviewManifest = reviewManifestFor();
    expect(artifact.reviewManifestId).toBe(reviewManifest.manifestId);
    expect(artifact.reviewManifestSha256).toBe(reviewManifest.manifestSha256);
    expect(proof.reviewManifestId).toBe(reviewManifest.manifestId);
    expect(proof.reviewManifestSha256).toBe(reviewManifest.manifestSha256);
    expect(proof.model).toEqual({
      provider: "agent-runtime",
      agentProvider: "codex",
      model: "gpt-5.6-sol",
      reasoningEffort: "high",
      runtimeOutput: "output_text",
    });
    expect(proof.zeroProviderCalls).toBe(true);
  });

  it("keeps a valid pair on DB failure and republishes it with zero model calls", async () => {
    const outputDirectory = tempDir();
    const firstModel = new FakeWeeklyModel((input) => outputFor(input));
    let firstPublisherCalls = 0;
    const durablePairs: { artifactSha256: string; proofSha256: string }[] = [];
    await expect(runReaderSummaryWeeklyProduction({
      ...admittedRunnerInput(),
      outputDirectory,
      model: firstModel,
      replay: false,
      generatedAt: new Date("2026-07-27T06:30:00.000Z"),
      onDurableArtifactPair: async (pair) => { durablePairs.push(pair); },
      publisher: {
        publish: async () => {
          firstPublisherCalls += 1;
          expect(productionArtifactExists(outputDirectory)).toBe(true);
          throw new Error("database unavailable");
        },
      },
    })).rejects.toThrow(/database unavailable/u);
    expect(firstModel.calls).toBe(1);
    expect(firstPublisherCalls).toBe(1);
    expect(productionArtifactExists(outputDirectory)).toBe(true);

    const retryModel = new FakeWeeklyModel((input) => outputFor(input));
    let retryPublisherCalls = 0;
    const retried = await runReaderSummaryWeeklyProduction({
      ...admittedRunnerInput(),
      outputDirectory,
      model: retryModel,
      replay: false,
      generatedAt: new Date("2026-07-27T07:00:00.000Z"),
      onDurableArtifactPair: async (pair) => { durablePairs.push(pair); },
      publisher: {
        publish: async ({ artifact, modelInput }) => {
          retryPublisherCalls += 1;
          expect(artifact.toSnapshot().output.sealId).toBe(modelInput.sealId);
          return { databasePublicationVerified: true };
        },
      },
    });
    expect(retried.databasePublicationVerified).toBe(true);
    expect(retried.replayed).toBe(true);
    expect(retried.modelCallPerformed).toBe(false);
    expect(retried.writePerformed).toBe(false);
    expect(retryModel.calls).toBe(0);
    expect(retryPublisherCalls).toBe(1);
    expect(durablePairs).toHaveLength(2);
    expect(durablePairs[1]).toEqual(durablePairs[0]);
  });

  it("replays existing evidence with zero calls and zero writes", async () => {
    const outputDirectory = tempDir();
    await runReaderSummaryWeeklyProduction({
      ...admittedRunnerInput(),
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
    const artifactMtime = statSync(artifactPath).mtimeMs;
    const proofMtime = statSync(proofPath).mtimeMs;
    const replayModel = new FakeWeeklyModel((input) => outputFor(input));
    const replayPublisher = fakePublisher();

    const result = await runReaderSummaryWeeklyProduction({
      ...admittedRunnerInput(),
      outputDirectory,
      model: replayModel,
      replay: true,
      generatedAt: new Date("2026-07-27T07:00:00.000Z"),
      publisher: replayPublisher,
    });

    expect(result.status).toBe("complete");
    expect(result.replayed).toBe(true);
    expect(result.modelCallPerformed).toBe(false);
    expect(result.writePerformed).toBe(false);
    expect(result.replayCanaryWritePerformed).toBe(false);
    expect(result.replayCanaryPath).toBeNull();
    expect(replayModel.calls).toBe(0);
    expect(replayPublisher.publish).not.toHaveBeenCalled();
    expect(statSync(artifactPath).mtimeMs).toBe(artifactMtime);
    expect(statSync(proofPath).mtimeMs).toBe(proofMtime);

    const secondReplay = await runReaderSummaryWeeklyProduction({
      ...admittedRunnerInput(),
      outputDirectory,
      model: replayModel,
      replay: true,
      generatedAt: new Date("2026-07-27T08:00:00.000Z"),
      publisher: replayPublisher,
    });

    expect(secondReplay.status).toBe("complete");
    expect(secondReplay.replayCanaryWritePerformed).toBe(false);
    expect(secondReplay.replayCanaryPath).toBeNull();
    expect(replayModel.calls).toBe(0);
    expect(replayPublisher.publish).not.toHaveBeenCalled();
  });

  it("does not call the model or write when replay is missing artifacts", async () => {
    const model = new FakeWeeklyModel((input) => outputFor(input));
    const publisher = fakePublisher();

    const result = await runReaderSummaryWeeklyProduction({
      ...admittedRunnerInput(),
      outputDirectory: tempDir(),
      model,
      replay: true,
      generatedAt: new Date("2026-07-27T07:00:00.000Z"),
      publisher,
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
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it("fails closed without an admitted review manifest before model, artifact, or publication", async () => {
    const outputDirectory = tempDir();
    const model = new FakeWeeklyModel((input) => outputFor(input));
    const publisher = fakePublisher();

    const result = await runReaderSummaryWeeklyProduction({
      dbState: completeDbState(),
      reviewManifest: null,
      outputDirectory,
      model,
      replay: false,
      generatedAt: new Date("2026-07-27T07:00:00.000Z"),
      publisher,
    });

    expect(result.status).toBe("partial");
    expect(result.blockingReasons).toEqual([
      "missing authorized weekly review manifest",
    ]);
    expect(result.modelCallPerformed).toBe(false);
    expect(result.writePerformed).toBe(false);
    expect(model.calls).toBe(0);
    expect(publisher.publish).not.toHaveBeenCalled();
    expect(productionArtifactExists(outputDirectory)).toBe(false);
  });

  it("fails closed when replay uses another valid review manifest", async () => {
    const outputDirectory = tempDir();
    const dbState = completeDbState();
    await runReaderSummaryWeeklyProduction({
      ...admittedRunnerInput(dbState),
      outputDirectory,
      model: new FakeWeeklyModel((input) => outputFor(input)),
      replay: false,
      generatedAt: new Date("2026-07-27T06:30:00.000Z"),
    });
    const replayModel = new FakeWeeklyModel((input) => outputFor(input));

    await expect(runReaderSummaryWeeklyProduction({
      dbState,
      reviewManifest: reviewManifestFor(dbState, { responseSalt: "other" }),
      outputDirectory,
      model: replayModel,
      replay: true,
      generatedAt: new Date("2026-07-27T07:00:00.000Z"),
      publisher: fakePublisher(),
    })).rejects.toThrow(/does not match admitted input/u);
    expect(replayModel.calls).toBe(0);
  });

  it("never publishes unavailable DB state", async () => {
    const model = new FakeWeeklyModel((input) => outputFor(input));
    const publisher = fakePublisher();
    const result = await runReaderSummaryWeeklyProduction({
      dbState: Object.freeze({
        ...completeDbState(),
        status: "unavailable" as const,
        blockingReasons: Object.freeze(["database unavailable"]),
      }),
      reviewManifest: null,
      outputDirectory: tempDir(),
      model,
      replay: false,
      generatedAt: new Date("2026-07-27T07:00:00.000Z"),
      publisher,
    });

    expect(result.status).toBe("unavailable");
    expect(model.calls).toBe(0);
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it("fails closed before model or filesystem writes without the persisted seal", async () => {
    const model = new FakeWeeklyModel((input) => outputFor(input));
    const publisher = fakePublisher();
    const dbState = completeDbState();
    const result = await runReaderSummaryWeeklyProduction({
      dbState: Object.freeze({
        ...dbState,
        weeklyCertificationSeal: null,
      }),
      reviewManifest: null,
      outputDirectory: tempDir(),
      model,
      replay: false,
      generatedAt: new Date("2026-07-27T06:30:00.000Z"),
      publisher,
    });

    expect(result.status).toBe("partial");
    expect(result.blockingReasons).toEqual([
      "missing persisted DB weekly certification seal",
    ]);
    expect(result.modelCallPerformed).toBe(false);
    expect(result.writePerformed).toBe(false);
    expect(model.calls).toBe(0);
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it("fails closed before model or filesystem writes for a stale seal", async () => {
    const model = new FakeWeeklyModel((input) => outputFor(input));
    const dbState = completeDbState();
    const seal = dbState.weeklyCertificationSeal!;
    const result = await runReaderSummaryWeeklyProduction({
      dbState: Object.freeze({
        ...dbState,
        weeklyCertificationSeal: Object.freeze({
          ...seal,
          days: Object.freeze([
            Object.freeze({ ...seal.days[0]!, publicationId: "stale" }),
            ...seal.days.slice(1),
          ]),
        }),
      }),
      reviewManifest: null,
      outputDirectory: tempDir(),
      model,
      replay: false,
      generatedAt: new Date("2026-07-27T06:30:00.000Z"),
    });

    expect(result.status).toBe("partial");
    expect(result.blockingReasons).toEqual([
      "persisted DB weekly certification seal is stale or mismatched",
    ]);
    expect(model.calls).toBe(0);
  });

  it("rejects a canonical proof whose sealed daily evidence is divergent", async () => {
    const outputDirectory = tempDir();
    await runReaderSummaryWeeklyProduction({
      ...admittedRunnerInput(),
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
        ...admittedRunnerInput(),
        outputDirectory,
        model: replayModel,
        replay: true,
        generatedAt: new Date("2026-07-27T07:00:00.000Z"),
      }),
    ).rejects.toThrow(/does not match admitted input/u);
    expect(replayModel.calls).toBe(0);
  });

  it("rejects self-consistent hashes when the stored quality gate is not recomputed", async () => {
    const outputDirectory = tempDir();
    await runReaderSummaryWeeklyProduction({
      ...admittedRunnerInput(),
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
    const artifact = JSON.parse(readFileSync(artifactPath, "utf8")) as {
      qualityGate: { metrics: { citedDayCount: number } };
      canary: { qualityGateSha256: string };
    };
    const proof = JSON.parse(readFileSync(proofPath, "utf8")) as {
      qualityGateSha256: string;
      canarySha256: string;
      artifactSha256: string;
    };
    artifact.qualityGate.metrics.citedDayCount += 1;
    const qualityGateSha256 = canonicalizeReaderSummaryWeeklyJson(
      artifact.qualityGate,
    ).sha256;
    artifact.canary.qualityGateSha256 = qualityGateSha256;
    proof.qualityGateSha256 = qualityGateSha256;
    proof.canarySha256 = canonicalizeReaderSummaryWeeklyJson(
      artifact.canary,
    ).sha256;
    proof.artifactSha256 = canonicalizeReaderSummaryWeeklyJson(artifact).sha256;
    chmodSync(artifactPath, 0o644);
    chmodSync(proofPath, 0o644);
    writeFileSync(
      artifactPath,
      canonicalizeReaderSummaryWeeklyJson(artifact).toBytes(),
    );
    writeFileSync(proofPath, canonicalizeReaderSummaryWeeklyJson(proof).toBytes());
    const replayModel = new FakeWeeklyModel((input) => outputFor(input));

    await expect(
      runReaderSummaryWeeklyProduction({
        ...admittedRunnerInput(),
        outputDirectory,
        model: replayModel,
        replay: true,
        generatedAt: new Date("2026-07-27T07:00:00.000Z"),
      }),
    ).rejects.toThrow(/does not match admitted input/u);
    expect(replayModel.calls).toBe(0);
  });

  it("rejects self-consistent replay hashes with semantically invalid output", async () => {
    const outputDirectory = tempDir();
    await writeProductionArtifactPair(outputDirectory);
    const { artifactPath, proofPath } = productionPaths(outputDirectory);
    const artifact = JSON.parse(readFileSync(artifactPath, "utf8")) as {
      output: { headlineCitationIds: string[] };
    };
    const proof = JSON.parse(readFileSync(proofPath, "utf8")) as {
      artifactSha256: string;
    };
    artifact.output.headlineCitationIds = ["citation:forged"];
    rewriteArtifactProofPair(artifactPath, proofPath, artifact, proof);
    const replayModel = new FakeWeeklyModel((input) => outputFor(input));

    await expect(runReaderSummaryWeeklyProduction({
      ...admittedRunnerInput(), outputDirectory, model: replayModel, replay: true,
      generatedAt: new Date("2026-07-27T07:00:00.000Z"),
    })).rejects.toThrow(/headline cites unknown evidence/u);
    expect(replayModel.calls).toBe(0);
  });

  it("rejects self-consistent replay hashes when editorial quality denies output", async () => {
    const outputDirectory = tempDir();
    await writeProductionArtifactPair(outputDirectory);
    const { artifactPath, proofPath } = productionPaths(outputDirectory);
    const artifact = JSON.parse(readFileSync(artifactPath, "utf8")) as {
      modelInput: ReaderSummaryWeeklyModelInput;
      output: ReaderSummaryWeeklyModelOutput;
      editorialQuality: unknown;
    };
    const proof = JSON.parse(readFileSync(proofPath, "utf8")) as {
      artifactSha256: string;
    };
    artifact.output = narrowSynthesisOutput(artifact.modelInput);
    artifact.editorialQuality = evaluateReaderSummaryWeeklyEditorialQuality(
      artifact.modelInput,
      artifact.output,
    );
    rewriteArtifactProofPair(artifactPath, proofPath, artifact, proof);
    const replayModel = new FakeWeeklyModel((input) => outputFor(input));

    await expect(runReaderSummaryWeeklyProduction({
      ...admittedRunnerInput(), outputDirectory, model: replayModel, replay: true,
      generatedAt: new Date("2026-07-27T07:00:00.000Z"),
    })).rejects.toThrow(/editorial output is blocked/u);
    expect(replayModel.calls).toBe(0);
  });

  it("rejects seven daily summaries stitched into a weekly output", async () => {
    const outputDirectory = tempDir();
    await expect(
      runReaderSummaryWeeklyProduction({
        ...admittedRunnerInput(),
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
        ...admittedRunnerInput(),
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

    const built = buildModelInputFromDbState(
      repeatedStoryState,
      reviewManifestFor(repeatedStoryState),
    );

    expect(built.status).toBe("complete");
    if (built.status !== "complete") {
      throw new Error(built.reasons.join("; "));
    }
    const repeatedObservations = built.input.observations.filter(
      (observation) => observation.providerKey === "rss",
    );
    expect(repeatedObservations).toHaveLength(7);
    expect(
      new Set(repeatedObservations.map((observation) => observation.storyId))
        .size,
    ).toBe(1);
    expect(
      new Set(repeatedObservations.map((observation) => observation.observedOn))
        .size,
    ).toBe(7);
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
    purpose: "social_monitor.reader_summary.weekly.generate.v2",
    canonicalRequestSha256: sha("canonical-request"),
    provider: "codex",
    model: "gpt-5.6-sol",
    reasoningEffort: "high",
    runtimeEngine: "subscription-runtime-cli",
    runtimePackageVersion: "1.0.0",
    launcherSha256: sha("launcher"),
    selectedOutputKind: "output_text",
    selectedOutputSha256: sha("output-text"),
    ...overrides,
  };
}

function completeModelInput(): ReaderSummaryWeeklyModelInput {
  const dbState = completeDbState();
  const built = buildModelInputFromDbState(dbState, reviewManifestFor(dbState));
  if (built.status !== "complete") {
    throw new Error(built.reasons.join("; "));
  }
  return built.input;
}

const fakePublisher = () => ({
  publish: jest.fn(async () => ({ databasePublicationVerified: true as const })),
});

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

function productionPaths(outputDirectory: string): {
  artifactPath: string;
  proofPath: string;
} {
  const prefix = "reader-summary-weekly-production.2026-07-20";
  return {
    artifactPath: join(outputDirectory, `${prefix}.artifact.v1.json`),
    proofPath: join(outputDirectory, `${prefix}.proof.v1.json`),
  };
}

async function writeProductionArtifactPair(outputDirectory: string): Promise<void> {
  await runReaderSummaryWeeklyProduction({
    ...admittedRunnerInput(),
    outputDirectory,
    model: new FakeWeeklyModel((input) => outputFor(input)),
    replay: false,
    generatedAt: new Date("2026-07-27T06:30:00.000Z"),
  });
}

function rewriteArtifactProofPair(
  artifactPath: string,
  proofPath: string,
  artifact: unknown,
  proof: { artifactSha256: string },
): void {
  proof.artifactSha256 = canonicalizeReaderSummaryWeeklyJson(artifact).sha256;
  chmodSync(artifactPath, 0o644);
  chmodSync(proofPath, 0o644);
  writeFileSync(artifactPath, canonicalizeReaderSummaryWeeklyJson(artifact).toBytes());
  writeFileSync(proofPath, canonicalizeReaderSummaryWeeklyJson(proof).toBytes());
}

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "reader-summary-weekly-production-"));
}
