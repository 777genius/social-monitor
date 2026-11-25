import { activeReaderSummaryPurposes as purposes } from "@social-monitor/summary/adapters/model/active-reader-summary-generation-profile";
import type { AgentRuntimeTaskCommand } from "@social-monitor/summary/ports";
import { evaluateReaderSummaryTopicMapStructure } from "@social-monitor/summary/domain";
import { completedRefreshModelRequest, refreshModelCommand } from "./reader-summary-new-input-refresh-model.spec-support";
import { wiring, topicOutput, topicCommand, primaryInput, primaryOutput, primaryRoute,
  publicationProbe } from "./reader-summary-new-input-refresh-model-composition.spec-support";

type Decision = { sourceNodeId: string; targetNodeId: string; sameTopic: boolean; confidenceScore: number; rationale?: string };
const decisions = (command: AgentRuntimeTaskCommand): Decision[] =>
  (topicOutput(command, true) as { decisions: Decision[] }).decisions;
const invalidRelations = [
  { name: "missing", change: () => [] },
  { name: "duplicate", change: (values: Decision[]) => [...values, values[0]] },
  { name: "reversed duplicate", change: (values: Decision[]) => [...values,
    { ...values[0], sourceNodeId: values[0]!.targetNodeId, targetNodeId: values[0]!.sourceNodeId }] },
  { name: "malformed boolean", change: (values: Decision[]) => [{ ...values[0], sameTopic: "false" }] },
  { name: "malformed confidence", change: (values: Decision[]) => [{ ...values[0], confidenceScore: 1.1 }] },
  { name: "non-object", change: () => [null] },
  { name: "unknown pair", change: (values: Decision[]) => [{ ...values[0], targetNodeId: "unknown:synthetic" }] },
  { name: "extra unknown pair", change: (values: Decision[]) => [...values,
    { ...values[0], targetNodeId: "unknown:synthetic" }] },
];

describe("refresh actual adapter normalization failures", () => {
  describe.each([false, true])("initial label map has valid coverage: %s", (firstGood) => {
    it.each(invalidRelations)("poisons $name relation decisions before workflow fallback", async ({ change }) => {
      const test = wiring((command) => {
        if (command.purpose !== purposes.topicRelations) {
          return completedRefreshModelRequest(command, topicOutput(command, firstGood || command.metadata?.attemptNumber === "2"));
        }
        const values = decisions(command);
        expect(values).toHaveLength(1); // Reproduce the reviewer's exact one-pair trigger.
        return completedRefreshModelRequest(command, { decisions: change(values) });
      });
      await test.model.topicMap.execute(topicCommand(true));
      // The real use case may catch the verifier error and return a fallback map.
      // Its outcome cannot restore runtime/publication authority.
      expect(() => test.runtime.assertUsable()).toThrow(/reconciliation/);
      expect(test.commands.map((command) => [command.purpose, command.metadata?.attemptNumber])).toEqual([
        [purposes.topicLabel, "1"], [purposes.topicRelations, "1"],
      ]);
      expect(test.events.filter((event) => event.status === "completed")).toHaveLength(2);
      expect(test.events).toContainEqual(expect.objectContaining({ status: "requires_reconciliation", taskRole: "topic_relation" }));
      expect(test.sink.record).toHaveBeenCalledTimes(1); // Only the label adapter accepted normalization.
      await expectPermanentlyPoisoned(test);
    });
  });

  it.each(["missing", "duplicate", "unknown"])("poisons %s labels rejected by the real label adapter", async (kind) => {
    const test = wiring((command) => {
      const output = topicOutput(command, true) as { nodeLabels: Record<string, unknown>[] };
      return completedRefreshModelRequest(command, { ...output, nodeLabels: kind === "missing" ? []
        : kind === "duplicate" ? [...output.nodeLabels, output.nodeLabels[0]]
        : output.nodeLabels.map((value, index) => index === 0 ? { ...value, nodeId: "unknown:synthetic" } : value) });
    });
    const result = await test.model.topicMap.execute(topicCommand(true));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected label normalization failure");
    expect(result.error.message).toContain("label every requested node exactly once");
    expect(test.commands).toHaveLength(1);
    expect(test.events.filter((event) => event.status === "completed")).toHaveLength(1);
    expect(test.sink.record).not.toHaveBeenCalled();
    await expectPermanentlyPoisoned(test);
  });

  it.each(["headline", "executiveSummary"])("poisons primary %s normalization failure", async (field) => {
    const test = wiring((command) => completedRefreshModelRequest(command, { ...primaryOutput(), [field]: null }));
    await expect(test.model.model.generate(primaryInput(), primaryRoute(test.model.model))).rejects.toThrow(/must be a non-empty string/u);
    expect(test.commands.map((command) => command.purpose)).toEqual([purposes.generate]);
    expect(test.events.filter((event) => event.status === "completed")).toHaveLength(1);
    expect(test.sink.record).not.toHaveBeenCalled();
    await expectPermanentlyPoisoned(test);
  });

  it("does not admit the primary adapter's internal narrative repair", async () => {
    const test = wiring((command) => completedRefreshModelRequest(command, { ...primaryOutput(), narrativeSections: [{ kind: "watch", title: "Watch",
      text: "Quartz runtime still needs monitoring.", citationIds: ["c1"], storyClusterId: null }] }));
    await expect(test.model.model.generate(primaryInput(), primaryRoute(test.model.model))).rejects.toThrow(/budget/u);
    expect(test.commands.map((command) => command.purpose)).toEqual([purposes.generate]);
    await expectPermanentlyPoisoned(test);
  });

  it("poisons a typed primary response validation failure", async () => {
    const test = wiring((command) => completedRefreshModelRequest(command, primaryOutput()));
    const primary = await test.model.model.generate(primaryInput(), primaryRoute(test.model.model));
    const result = test.model.model.validateRawProviderResponse({ ...primary, draft: { ...primary.draft, headline: "" } });
    expect(result).toMatchObject({ ok: false, failure: { kind: "invalid_schema" } });
    await expectPermanentlyPoisoned(test);
  });
});

describe("refresh accepted adapter normalization", () => {
  it.each(["distinct", "same topic", "reversed and padded", "zero confidence"])("accepts %s relation decisions", async (kind) => {
    const test = wiring((command) => completedRefreshModelRequest(command, command.purpose === purposes.topicRelations
      ? { decisions: decisions(command).map((value) => ({ ...value,
        sameTopic: kind === "same topic", confidenceScore: kind === "zero confidence" ? 0 : value.confidenceScore,
        ...(kind === "reversed and padded" ? { sourceNodeId: ` ${value.targetNodeId} `,
          targetNodeId: ` ${value.sourceNodeId} `, rationale: undefined } : {}),
      })) } : topicOutput(command, true)));
    const result = await test.model.topicMap.execute(topicCommand(true));
    expect(result.ok).toBe(true);
    expect(test.commands.map((command) => command.purpose)).toEqual([purposes.topicLabel, purposes.topicRelations]);
    expect(test.sink.record).toHaveBeenCalledTimes(2);
    expect(() => test.runtime.assertUsable()).not.toThrow();
    const publication = publicationProbe(test.runtime);
    await publication.attempt();
    expect(publication.publish).toHaveBeenCalledTimes(1);
  });

  it("keeps two valid coverage attempts and exactly one actual primary generation", async () => {
    const test = wiring((command) => completedRefreshModelRequest(command, command.purpose === purposes.generate
      ? primaryOutput() : topicOutput(command, command.metadata?.attemptNumber === "2")));
    const route = primaryRoute(test.model.model);
    const primary = await test.model.model.generate(primaryInput(), route);
    expect(test.model.model.validateRawProviderResponse(primary)).toEqual({ ok: true });
    const result = await test.model.topicMap.execute(topicCommand(true));
    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(evaluateReaderSummaryTopicMapStructure(result.value).passed).toBe(true);
    expect(test.commands.map((command) => [command.purpose, command.metadata?.attemptNumber])).toEqual([
      [purposes.generate, undefined], [purposes.topicLabel, "1"], [purposes.topicRelations, "1"],
      [purposes.topicLabel, "2"], [purposes.topicRelations, "2"],
    ]);
    expect(JSON.parse(test.commands[3]!.prompt).retryFeedback).toMatchObject({ reason: "grouped_coverage_below_minimum" });
    expect(test.events.filter((event) => event.status === "requires_reconciliation")).toHaveLength(0);
    expect(test.sink.record).toHaveBeenCalledTimes(5);
    const publication = publicationProbe(test.runtime);
    await publication.attempt();
    expect(publication.publish).toHaveBeenCalledTimes(1);
    await expect(test.model.model.generate(primaryInput(), route)).rejects.toThrow(/budget/u);
    expect(test.commands).toHaveLength(5);
  });
});

async function expectPermanentlyPoisoned(test: ReturnType<typeof wiring>) {
  expect(() => test.runtime.assertUsable()).toThrow(/reconciliation/);
  const before = test.commands.length;
  for (const purpose of [purposes.generate, purposes.topicLabel, purposes.topicRelations, purposes.storyRelations, purposes.relatedTopicRelations]) {
    await expect(test.runtime.runTask({ ...refreshModelCommand(purpose), requestId: `after-normalization:${purpose}` })).rejects.toThrow(/budget/u);
  }
  await test.model.topicMap.execute(topicCommand(true));
  await expect(test.model.model.generate(primaryInput(), primaryRoute(test.model.model))).rejects.toThrow(/budget/u);
  expect(test.commands).toHaveLength(before);
  const publication = publicationProbe(test.runtime);
  await expect(publication.attempt()).rejects.toThrow(/reconciliation/u);
  expect(publication.assertProtected).not.toHaveBeenCalled();
  expect(publication.assertCurrent).not.toHaveBeenCalled();
  expect(publication.publish).not.toHaveBeenCalled();
}
