import {
  OpenAiReaderSummaryWeeklyModelError,
  extractSingleOutputText,
  isTimeoutError,
  readCompletedResponse,
} from "./openai-responses-reader-summary-weekly-response-contract";

const completed = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

const failureOf = (error: unknown) =>
  error instanceof OpenAiReaderSummaryWeeklyModelError
    ? error.failure
    : undefined;

describe("OpenAI weekly response contract", () => {
  it("accepts the same single, consistent output as the weekly model adapter", async () => {
    const text = JSON.stringify({ sealId: "synthetic-seal" });
    const body = {
      status: "completed",
      output_text: text,
      output: [{ content: [{ type: "output_text", text }] }],
    };

    const parsed = await readCompletedResponse(completed(body));

    expect(parsed).toEqual(body);
    expect(extractSingleOutputText(parsed)).toBe(text);
  });

  it.each([
    ["refusal", { status: "completed", output: [{ content: [{ type: "refusal" }] }] }, "refusal"],
    ["incomplete", { status: "incomplete" }, "response_state"],
    ["embedded-error", { status: "completed", output: [{ content: [{ type: "error" }] }] }, "response_state"],
  ] as const)("rejects %s even under otherwise well-formed JSON", async (_name, body, expectedKind) => {
    try {
      await readCompletedResponse(completed(body));
      throw new Error("Expected response contract rejection");
    } catch (error) {
      expect(failureOf(error)).toMatchObject({ kind: expectedKind, retryable: false });
    }
  });

  it("rejects stitched output instead of accepting arbitrary joined fragments", () => {
    expect(() => extractSingleOutputText({
      status: "completed",
      output: [{ content: [
        { type: "output_text", text: "part-one" },
        { type: "output_text", text: "part-two" },
      ] }],
    })).toThrow(OpenAiReaderSummaryWeeklyModelError);
  });

  it("keeps network timeout detection narrow", () => {
    const aborted = new Error("synthetic"); aborted.name = "AbortError";
    const deadline = new Error("synthetic"); deadline.name = "TimeoutError";
    expect(isTimeoutError(aborted)).toBe(true);
    expect(isTimeoutError(deadline)).toBe(true);
    expect(isTimeoutError(new Error("synthetic"))).toBe(false);
  });
});
