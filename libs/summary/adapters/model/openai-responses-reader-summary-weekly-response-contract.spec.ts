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

  it.each([
    ["top-level error", { status: "completed", error: { code: "synthetic" } }, "response_state"],
    ["top-level refusal", { status: "completed", refusal: "synthetic" }, "refusal"],
    ["nested message error", { status: "completed", output: [{ type: "error" }] }, "response_state"],
    ["nested incomplete message", { status: "completed", output: [{ status: "in_progress" }] }, "response_state"],
    ["nested incomplete details", { status: "completed", output: [{ incomplete_details: { reason: "synthetic" } }] }, "response_state"],
  ] as const)("fails closed for %s without exposing provider data", async (_name, body, expectedKind) => {
    await expect(readCompletedResponse(completed(body))).rejects.toMatchObject({
      failure: { kind: expectedKind, retryable: false },
    });
  });

  it.each([
    ["non-array output", { output: {} }],
    ["empty output text", { output: [{ content: [{ type: "output_text", text: " " }] }] }],
    ["inconsistent aggregate", { output_text: "first", output: [{ content: [{ type: "output_text", text: "second" }] }] }],
    ["no text", { output: [{ content: [{ type: "metadata", text: "ignored" }] }] }],
  ] as const)("rejects %s as invalid response", (_name, response) => {
    try {
      extractSingleOutputText(response);
      throw new Error("Expected invalid response");
    } catch (error) {
      expect(failureOf(error)).toMatchObject({ kind: "invalid_response", retryable: false });
    }
  });

  it("contains transport read failures without leaking provider exception details", async () => {
    const response = { ok: true, status: 200, text: jest.fn().mockRejectedValue(new Error("synthetic-private-payload")) } as unknown as Response;
    await expect(readCompletedResponse(response)).rejects.toMatchObject({
      failure: {
        kind: "transport",
        retryable: true,
        message: "OpenAI reader summary weekly response transport failed",
      },
    });
  });

});
