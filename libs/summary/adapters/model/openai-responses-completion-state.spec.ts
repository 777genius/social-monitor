import { openAiResponsesCompletionIssue } from "./openai-responses-completion-state";

describe("paid OpenAI Responses completion admission", () => {
  it.each([
    ["invalid output collection", { output: {} }],
    ["null output collection", { output: null }],
    ["invalid message content", { output: [{ type: "message", content: { text: "{}" } }] }],
    ["invalid text payload", { output: [{
      type: "message", content: [{ type: "output_text", text: 10 }],
    }] }],
    ["empty text payload", { output: [{
      type: "message", content: [{ type: "output_text", text: " " }],
    }] }],
    ["conflicting aggregate", { output_text: '{"ok":1}', output: [{
      type: "message", content: [{ type: "output_text", text: '{"ok":2}' }],
    }] }],
    ["stitched JSON output", { output: [{
      type: "message", content: [
        { type: "output_text", text: '{"ok":' }, { type: "output_text", text: 'true}' },
      ],
    }] }],
  ])("rejects %s despite explicit HTTP-successful completion", (_, patch) => {
    expect(openAiResponsesCompletionIssue({ status: "completed", ...patch }))
      .toBe("not_completed");
  });

  it("retains one exact nested output and optional reasoning metadata", () => {
    const body = '{"summary":"synthetic"}';
    expect(openAiResponsesCompletionIssue({
      status: "completed", output_text: body,
      output: [
        { type: "reasoning", summary: [] },
        { type: "message", status: "completed",
          content: [{ type: "output_text", text: body }] },
      ],
    })).toBeNull();
    expect(openAiResponsesCompletionIssue({ output_text: body })).toBeNull();
  });

  it("rejects refusal and nested errors without echoing provider text", () => {
    const secret = "SYNTHETIC_PRIVATE_SOURCE_CONTENT";
    expect(openAiResponsesCompletionIssue({
      status: "completed", output_text: '{"ok":true}',
      output: [{ type: "message", content: [{ type: "refusal", refusal: secret }] }],
    })).toBe("refusal");
    expect(openAiResponsesCompletionIssue({
      status: "completed", output_text: '{"ok":true}',
      output: [{ type: "error", error: { message: secret } }],
    })).toBe("error");
  });
});
