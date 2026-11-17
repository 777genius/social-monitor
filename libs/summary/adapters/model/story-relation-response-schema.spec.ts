import Ajv from "ajv";
import { assertStoryRelationResponseSchema } from "./story-relation-response-schema";
import { rejectStoryRelationSchemaIssues } from "./story-relation-response-schema-failure";
import { agentRuntimeReaderSummaryStoryRelationVerifierJsonSchema as schema } from
  "./agent-runtime-reader-summary-story-relation-verifier-prompt";
import { AgentRuntimeModelProviderError } from "./agent-runtime-model-support";

const decision = { leftFeedItemId: "a", rightFeedItemId: "b", sameStory: false,
  confidenceScore: 0.5, rationale: " Uncertain fixture evidence. " };

it("accepts the unchanged schema without mutating valid raw output", () => {
  const raw = { decisions: [decision] }; const bytes = JSON.stringify(raw);
  assertStoryRelationResponseSchema(raw, schema);
  expect(JSON.stringify(raw)).toBe(bytes);
});

it("aggregates bounded paths/properties without output values or repair", () => {
  const raw = { decisions: Array.from({ length: 30 }, () => ({
    leftFeedItemId: 123, rightFeedItemId: "b", sameStory: false,
    confidenceScore: 4, extra: "never-log-this-payload",
  })) };
  const bytes = JSON.stringify(raw);
  try {
    assertStoryRelationResponseSchema(raw, schema);
    throw new Error("Expected rejection");
  } catch (error) {
    expect(error).toBeInstanceOf(AgentRuntimeModelProviderError);
    const failure = (error as AgentRuntimeModelProviderError).failure;
    expect(failure).toMatchObject({ kind: "invalid_schema", retryable: false });
    expect(failure.message).toContain(".decisions[0].rationale");
    expect(failure.message).toContain('"properties":["extra"]');
    expect(failure.message).toContain('.decisions[0].confidenceScore');
    expect(failure.message).toContain("120 errors (100 omitted)");
    expect(failure.message).not.toContain("never-log-this-payload");
    expect(failure.message.length).toBeLessThan(6000);
  }
  expect(JSON.stringify(raw)).toBe(bytes);
});

// The requested JSON schema is unchanged; compare the production compiler with
// the importer's former Ajv check on JSON values, including every schema field.
it("matches exact Ajv schema validation for JSON response cases", () => {
  const ajv = new Ajv({ allErrors: true }).compile(schema);
  const values: unknown[] = [null, [], {}, { decisions: null }, { decisions: [] },
    { decisions: [decision], extra: true }, { decisions: [null] }];
  for (const key of Object.keys(decision)) {
    const missing: Record<string, unknown> = { ...decision }; delete missing[key];
    values.push({ decisions: [missing] });
    for (const value of [null, [], {}, true, false, 0, -0.1, 1, 1.1, "", "fixture"]) {
      values.push({ decisions: [{ ...decision, [key]: value }] });
    }
  }
  for (const raw of values) {
    let accepted = true;
    try { assertStoryRelationResponseSchema(raw, schema); } catch { accepted = false; }
    expect(accepted).toBe(ajv(raw));
  }
});

it("bounds raw own-key diagnostics and retains the rejected input bytes", () => {
  const raw = { decisions: Array.from({ length: 30 }, () =>
    JSON.parse(JSON.stringify(decision).slice(0, -1) + ',"__proto__":"never-log-this-payload"}')) };
  const bytes = JSON.stringify(raw);
  try {
    assertStoryRelationResponseSchema(raw, schema);
    throw new Error("Expected rejection");
  } catch (error) {
    expect(error).toBeInstanceOf(AgentRuntimeModelProviderError);
    const failure = (error as AgentRuntimeModelProviderError).failure;
    expect(failure).toMatchObject({ kind: "invalid_schema", retryable: false });
    expect(failure.message).toContain('"properties":["__proto__"]');
    expect(failure.message).toContain("30 errors (10 omitted)");
    expect(failure.message).not.toContain("never-log-this-payload");
    expect(failure.message.length).toBeLessThan(6000);
  }
  expect(JSON.stringify(raw)).toBe(bytes);
});

it("bounds standalone schema diagnostics and preserves all source issues", () => {
  const longKey = "synthetic-unknown-key-".repeat(10);
  const issues = Array.from({ length: 23 }, (_, index) => ({
    code: "unrecognized_keys" as const,
    path: ["decisions", index],
    keys: [longKey],
  }));
  const before = JSON.stringify(issues);
  try {
    rejectStoryRelationSchemaIssues(issues);
    throw new Error("Expected rejection");
  } catch (error) {
    expect(error).toBeInstanceOf(AgentRuntimeModelProviderError);
    const failure = (error as AgentRuntimeModelProviderError).failure;
    expect(failure).toMatchObject({ kind: "invalid_schema", retryable: false });
    expect(failure.message).toContain("23 errors (3 omitted)");
    expect(failure.message).toContain(".decisions[0]");
    expect(failure.message).not.toContain(longKey);
    expect(failure.message).toContain(longKey.slice(0, 160));
    expect(failure.message.length).toBeLessThan(6000);
  }
  expect(JSON.stringify(issues)).toBe(before);
});

it("reports truncated unknown-property counts without including property values", () => {
  const issues = [{
    code: "unrecognized_keys" as const,
    path: [] as (string | number)[],
    keys: Array.from({ length: 24 }, (_, index) => `unexpected${index}`),
  }];
  try {
    rejectStoryRelationSchemaIssues(issues);
    throw new Error("Expected rejection");
  } catch (error) {
    expect(error).toBeInstanceOf(AgentRuntimeModelProviderError);
    const failure = (error as AgentRuntimeModelProviderError).failure;
    expect(failure.message).toContain('"path":"/"');
    expect(failure.message).toContain('"omittedProperties":4');
    expect(failure.message).not.toContain("unexpected23");
  }
});
