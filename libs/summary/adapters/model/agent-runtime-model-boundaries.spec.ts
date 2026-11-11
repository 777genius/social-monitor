import type { AgentRuntimeTaskResult } from "../../ports";
import {
  buildAgentRuntimeRequestId,
  nonEmptyOrFallback,
  parsePositiveInteger,
  positiveIntegerOrFallback,
  readAgentRuntimeObjectOutput,
} from "./agent-runtime-model-support";
import { AgentRuntimeModelProviderError } from "./agent-runtime-model-failure";
import { readAgentRuntimeObjectOutput as decodeAgentOutput } from "./agent-runtime-model-output";
import {
  buildAgentRuntimeRequestId as createRequestId,
  nonEmptyOrFallback as sanitizeText,
  parsePositiveInteger as readPositiveInteger,
  positiveIntegerOrFallback as sanitizePositiveInteger,
} from "./agent-runtime-model-request";

const result = (overrides: Partial<AgentRuntimeTaskResult> = {}): AgentRuntimeTaskResult =>
  ({ status: "completed", warnings: [], ...overrides }) as AgentRuntimeTaskResult;

describe("agent runtime output trust and request identity boundaries", () => {
  it("preserves legacy entrypoint function identity", () => {
    expect(readAgentRuntimeObjectOutput).toBe(decodeAgentOutput);
    expect(buildAgentRuntimeRequestId).toBe(createRequestId);
    expect(nonEmptyOrFallback).toBe(sanitizeText);
    expect(positiveIntegerOrFallback).toBe(sanitizePositiveInteger);
    expect(parsePositiveInteger).toBe(readPositiveInteger);
  });

  it("rejects interactive tasks before reading structured output", () => {
    const parse = jest.fn();
    expect(() => decodeAgentOutput(result({
      status: "waiting_for_input",
      structuredOutput: { unsafe: true },
    }), parse, "Daily")).toThrow("Daily agent task requested interactive input");
    expect(parse).not.toHaveBeenCalled();
  });

  it("maps failed runtime results into the provider failure contract", () => {
    try {
      decodeAgentOutput(result({ status: "failed" }), JSON.parse, "Reader");
      throw new Error("expected provider failure");
    } catch (error) {
      expect(error).toBeInstanceOf(AgentRuntimeModelProviderError);
      expect((error as AgentRuntimeModelProviderError).failure).toEqual({
        kind: "provider_unavailable",
        retryable: true,
        message: "Reader agent task failed",
      });
    }
  });

  it("prefers structured completion over text and preserves parser ownership", () => {
    const parse = jest.fn(() => ({ fallback: true }));
    const structured = { approved: true };
    expect(decodeAgentOutput(result({
      structuredOutput: structured,
      outputText: "{\"fallback\":true}",
    }), parse, "Reader")).toBe(structured);
    expect(parse).not.toHaveBeenCalled();
    expect(decodeAgentOutput(result({ outputText: "{\"approved\":true}" }),
      (raw) => JSON.parse(raw) as Record<string, unknown>, "Reader"))
      .toEqual({ approved: true });
  });

  it("rejects absent output and propagates strict text parse failures", () => {
    expect(() => decodeAgentOutput(result(), JSON.parse, "Reader"))
      .toThrow("Reader agent task returned no structured output");
    expect(() => decodeAgentOutput(result({ outputText: "{" }), JSON.parse, "Reader"))
      .toThrow(SyntaxError);
  });

  it("keeps scope, timestamp, sanitization and 240-character request-id cap", () => {
    const date = new Date("2026-11-08T12:34:56.000Z");
    expect(createRequestId("reader task", "tenant/a", "workspace b", "daily", date))
      .toBe("reader_task:tenant_a:workspace_b:daily:2026-11-08T12:34:56.000Z");
    expect(createRequestId("a".repeat(300), "tenant", "workspace", "daily", date))
      .toHaveLength(240);
  });

  it("preserves unchanged config fallback semantics", () => {
    expect(sanitizeText("  supplied  ", "fallback")).toBe("supplied");
    expect(sanitizeText("  ", "fallback")).toBe("fallback");
    expect(sanitizeText(undefined, "fallback")).toBe("fallback");
    expect(sanitizePositiveInteger(4, 9)).toBe(4);
    expect(sanitizePositiveInteger(0, 9)).toBe(9);
    expect(sanitizePositiveInteger(Number.NaN, 9)).toBe(9);
    expect(readPositiveInteger("7")).toBe(7);
    expect(readPositiveInteger("0")).toBeUndefined();
    expect(readPositiveInteger("3.2")).toBeUndefined();
    expect(readPositiveInteger(undefined)).toBeUndefined();
  });
});
