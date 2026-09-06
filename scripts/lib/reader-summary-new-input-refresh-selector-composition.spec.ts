import { AgentRuntimeModelProviderError } from "@social-monitor/summary/adapters/model/agent-runtime-model-support";
import { canonicalJsonSha256 } from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import { AgentRuntimeReaderSummaryStoryRelationVerifier } from "@social-monitor/summary/adapters/model/agent-runtime-reader-summary-story-relation-verifier.adapter";
import { activeReaderSummaryPurposes as purposes } from "@social-monitor/summary/adapters/model/active-reader-summary-generation-profile";
import { evaluateReaderSummaryTopicMapStructure } from "@social-monitor/summary/domain";
import { refreshModelCommand } from "./reader-summary-new-input-refresh-model.spec-support";
import { primaryInput, primaryRoute, publicationProbe, topicCommand } from "./reader-summary-new-input-refresh-model-composition.spec-support";
import { selectorOutput, selectorWiring } from "./reader-summary-new-input-refresh-selector-composition.spec-support";

const malformed = [
  { name: "missing decisions", output: {} },
  { name: "unknown envelope property", output: { decisions: [], unexpected: true } },
];

afterEach(() => jest.restoreAllMocks());

describe("refresh canonical selector adapter exceptions", () => {
  it.each(malformed)("permanently poisons $name before selector fallback", async ({ output }) => {
    const verify = jest.spyOn(AgentRuntimeReaderSummaryStoryRelationVerifier.prototype, "verify");
    const test = await selectorWiring({ output: (command) => command.purpose === purposes.relatedTopicRelations
      ? output : selectorOutput(command) });
    const selection = await test.select();
    expect(selection.selectedEvidence).toHaveLength(2);
    expect(selection.relatedTopicRelations).toEqual([]);
    expect(verify.mock.calls.map(([query]) => [query.verificationLane, query.candidates.length]))
      .toEqual([[undefined, 1], ["related_topic", 1]]);
    await expectInvalidWireSchema(verify.mock.results[1]!.value);
    expect(test.commands.map((command) => command.purpose)).toEqual([purposes.storyRelations, purposes.relatedTopicRelations]);
    expect(test.events.filter((event) => event.status === "completed")).toHaveLength(2);
    expect(test.sink.record.mock.calls.map(([value]) => value.taskRole)).toEqual(["story_relation"]);
    expect(() => test.runtime.assertUsable()).toThrow(/reconciliation/u);
    expect(test.events).toContainEqual(expect.objectContaining({ status: "requires_reconciliation",
      phase: "adapter_validation", taskRole: "related_topic_relation" }));
    await expectPermanentlyPoisoned(test);
  });

  it("poisons missing story decisions before attestation or another model call", async () => {
    const verify = jest.spyOn(AgentRuntimeReaderSummaryStoryRelationVerifier.prototype, "verify");
    const test = await selectorWiring({ output: (command) => command.purpose === purposes.storyRelations
      ? {} : selectorOutput(command) });
    const selection = await test.select();
    expect(selection.selectedEvidence).toHaveLength(2);
    expect(selection.clusters).toHaveLength(2);
    expect(selection.approvedSameStoryRelations).toEqual([]);
    expect(selection.relatedTopicRelations).toEqual([]);
    await expectInvalidWireSchema(verify.mock.results[0]!.value);
    expect(test.commands.map((command) => command.purpose)).toEqual([purposes.storyRelations]);
    expect(test.sink.record).not.toHaveBeenCalled();
    expect(test.events).toContainEqual(expect.objectContaining({ status: "requires_reconciliation",
      phase: "adapter_validation", taskRole: "story_relation" }));
    await expectPermanentlyPoisoned(test);
  });

  it.each(["story_relation", "related_topic_relation"] as const)("poisons residual %s sink exceptions", async (taskRole) => {
    const verify = jest.spyOn(AgentRuntimeReaderSummaryStoryRelationVerifier.prototype, "verify");
    const failure = new Error(`synthetic ${taskRole} sink failure`);
    const test = await selectorWiring({ onAttestation: async (value) => {
      if (value.taskRole === taskRole) throw failure;
    } });
    await test.select();
    await expect(verify.mock.results[taskRole === "story_relation" ? 0 : 1]!.value).rejects.toBe(failure);
    expect(test.commands.map((command) => command.purpose)).toEqual(taskRole === "story_relation"
      ? [purposes.storyRelations] : [purposes.storyRelations, purposes.relatedTopicRelations]);
    expect(test.events).toContainEqual(expect.objectContaining({ status: "requires_reconciliation", taskRole }));
    await expectPermanentlyPoisoned(test);
  });

  it.each(["story_relation", "related_topic_relation"] as const)("keeps %s poison if reconciliation recording throws", async (taskRole) => {
    const test = await selectorWiring({ onAttestation: async (value) => {
      if (value.taskRole === taskRole) throw new Error("synthetic sink failure");
    }, onEvent: (event) => {
      if (event.status === "requires_reconciliation") throw new Error("synthetic journal failure");
    } });
    await test.select();
    expect(test.commands).toHaveLength(taskRole === "story_relation" ? 1 : 2);
    await expectPermanentlyPoisoned(test);
  });

  it.each(["story_relation", "related_topic_relation"] as const)("poisons source drift during %s normalization", async (taskRole) => {
    let sourceChanged = false;
    const test = await selectorWiring({ assertSource: () => {
      if (sourceChanged) throw new Error("synthetic source drift");
    }, onAttestation: (value) => { if (value.taskRole === taskRole) sourceChanged = true; } });
    await test.select();
    // Restoring a source check cannot restore consumed refresh authority.
    sourceChanged = false;
    expect(test.commands).toHaveLength(taskRole === "story_relation" ? 1 : 2);
    await expectPermanentlyPoisoned(test);
  });
});

describe("canonical selector accepted deterministic decisions", () => {
  it.each(["unrelated", "same_story", "empty related decisions", "empty story decisions"])(
    "preserves %s and normalized attestations", async (kind) => {
      const test = await selectorWiring({ output: (command) => {
        if ((command.purpose === purposes.relatedTopicRelations && kind === "empty related decisions") ||
            (command.purpose === purposes.storyRelations && kind === "empty story decisions")) return { decisions: [] };
        const output = selectorOutput(command);
        return command.purpose === purposes.relatedTopicRelations && kind === "same_story"
          ? { decisions: (output.decisions as Record<string, unknown>[]).map((decision) => ({ ...decision, relation: "same_story" })) }
          : output;
      } });
      const selection = await test.select();
      expect(selection.selectedEvidence).toHaveLength(2);
      expect(selection.clusters).toHaveLength(2);
      expect(selection.relatedTopicRelations).toEqual([]);
      expect(test.commands.map((command) => command.purpose)).toEqual([purposes.storyRelations, purposes.relatedTopicRelations]);
      expect(test.sink.record.mock.calls.map(([value]) => [value.taskRole, value.attempt]))
        .toEqual([["story_relation", "primary"], ["related_topic_relation", "related-topic"]]);
      if (kind.startsWith("empty")) {
        const role = kind === "empty related decisions" ? "related_topic_relation" : "story_relation";
        expect(test.sink.record.mock.calls.find(([value]) => value.taskRole === role)?.[0].normalizedOutputSha256)
          .toBe(canonicalJsonSha256([]));
      }
      await expectAcceptedPrimaryAndPublication(test);
    },
  );

  it("retains approved same-story reclustering", async () => {
    const test = await selectorWiring({ sameStory: true });
    const selection = await test.select();
    expect(selection.clusters).toHaveLength(1);
    expect(selection.approvedSameStoryRelations).toHaveLength(1);
    expect(test.commands.map((command) => command.purpose)).toEqual([purposes.storyRelations]);
    await expectAcceptedPrimaryAndPublication(test);
  });

  it("retains coverage-only topic attempt 2 after selection and exactly one primary", async () => {
    const test = await selectorWiring();
    await test.select();
    const primary = await test.model.model.generate(primaryInput(), primaryRoute(test.model.model));
    expect(test.model.model.validateRawProviderResponse(primary)).toEqual({ ok: true });
    const topicMap = await test.model.topicMap.execute(topicCommand(true));
    expect(topicMap.ok).toBe(true);
    if (!topicMap.ok) throw topicMap.error;
    expect(evaluateReaderSummaryTopicMapStructure(topicMap.value).passed).toBe(true);
    expect(test.commands.map((command) => [command.purpose, command.metadata?.attemptNumber])).toEqual([
      [purposes.storyRelations, undefined], [purposes.relatedTopicRelations, undefined], [purposes.generate, undefined],
      [purposes.topicLabel, "1"], [purposes.topicRelations, "1"], [purposes.topicLabel, "2"], [purposes.topicRelations, "2"],
    ]);
    expect(JSON.parse(test.commands[5]!.prompt).retryFeedback).toMatchObject({ reason: "grouped_coverage_below_minimum" });
    expect(test.sink.record).toHaveBeenCalledTimes(7);
    expect(test.events.filter((event) => event.status === "requires_reconciliation")).toEqual([]);
    const publication = publicationProbe(test.runtime);
    await publication.attempt();
    expect(publication.publish).toHaveBeenCalledTimes(1);
    await expect(test.model.model.generate(primaryInput(), primaryRoute(test.model.model))).rejects.toThrow(/budget/u);
    expect(test.commands).toHaveLength(7);
  });

  it.each(malformed)("leaves ordinary daily fallback unchanged for $name without the optional guard", async ({ output }) => {
    const verify = jest.spyOn(AgentRuntimeReaderSummaryStoryRelationVerifier.prototype, "verify");
    const test = await selectorWiring({ guardAdapter: false, output: (command) => command.purpose === purposes.relatedTopicRelations
      ? output : selectorOutput(command) });
    expect((await test.select()).selectedEvidence).toHaveLength(2);
    await expectInvalidWireSchema(verify.mock.results[1]!.value);
    expect(test.sink.record.mock.calls.map(([value]) => value.taskRole)).toEqual(["story_relation"]);
    await expectAcceptedPrimaryAndPublication(test);
    expect(test.commands.map((command) => command.purpose)).toEqual([purposes.storyRelations, purposes.relatedTopicRelations, purposes.generate]);
  });
});

async function expectPermanentlyPoisoned(test: Awaited<ReturnType<typeof selectorWiring>>) {
  expect(() => test.runtime.assertUsable()).toThrow(/reconciliation/u);
  const before = test.commands.length;
  for (const purpose of [purposes.generate, purposes.storyRelations, purposes.relatedTopicRelations, purposes.topicLabel, purposes.topicRelations]) {
    await expect(test.runtime.runTask({ ...refreshModelCommand(purpose), requestId: `after-selector:${purpose}` })).rejects.toThrow(/budget/u);
  }
  await expect(test.model.model.generate(primaryInput(), primaryRoute(test.model.model))).rejects.toThrow(/budget/u);
  await test.model.topicMap.execute(topicCommand(true));
  await test.select();
  expect(test.commands).toHaveLength(before);
  const publication = publicationProbe(test.runtime);
  await expect(publication.attempt()).rejects.toThrow(/reconciliation/u);
  expect(publication.assertProtected).not.toHaveBeenCalled();
  expect(publication.assertCurrent).not.toHaveBeenCalled();
  expect(publication.publish).not.toHaveBeenCalled();
}

async function expectAcceptedPrimaryAndPublication(test: Awaited<ReturnType<typeof selectorWiring>>) {
  expect(() => test.runtime.assertUsable()).not.toThrow();
  const primary = await test.model.model.generate(primaryInput(), primaryRoute(test.model.model));
  expect(test.model.model.validateRawProviderResponse(primary)).toEqual({ ok: true });
  expect(test.events.filter((event) => event.status === "requires_reconciliation")).toEqual([]);
  const publication = publicationProbe(test.runtime);
  await publication.attempt();
  expect(publication.publish).toHaveBeenCalledTimes(1);
  const before = test.commands.length;
  await expect(test.model.model.generate(primaryInput(), primaryRoute(test.model.model))).rejects.toThrow(/budget/u);
  expect(test.commands).toHaveLength(before);
}

async function expectInvalidWireSchema(result: Promise<unknown>) {
  // Wire validation runs before domain envelope parsing and attestation recording.
  await expect(result).rejects.toBeInstanceOf(AgentRuntimeModelProviderError);
  await expect(result).rejects.toMatchObject({ failure: { kind: "invalid_schema", retryable: false } });
}
