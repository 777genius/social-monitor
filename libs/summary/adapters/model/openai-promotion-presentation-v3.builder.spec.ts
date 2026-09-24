import { READER_POST_PRESENTATION_V3_MAX_REQUEST_BYTES,
  type ReaderPostPresentationV3Input } from
  "../../domain/services/reader-post-presentation-v3";
import { OpenAiPromotionPresentationV3Builder } from
  "./openai-promotion-presentation-v3.builder";

const input = (index: number): ReaderPostPresentationV3Input => ({
  tenantId: "tenant", workspaceId: "workspace", interestId: "interest",
  candidateId: `candidate-${index}`, sourceItemId: `source-${index}`,
  sourceBindingId: `binding-${index}`, providerKey: "reddit",
  trustedIntent: "intent", sourceSnapshotSha256: "1".repeat(64),
  title: `title-${index}`, body: "\u0000".repeat(64_000),
  captureComplete: true,
});

describe("OpenAI Promotion V3 presentation builder", () => {
  it("splits batches by the complete encoded wire request budget", async () => {
    const requestSizes: number[] = [];
    const fetchFn = jest.fn(async (_url: string | URL, init?: RequestInit) => {
      const body = String(init?.body ?? "");
      requestSizes.push(Buffer.byteLength(body, "utf8"));
      const request = JSON.parse(body) as { readonly input: string };
      const candidates = (JSON.parse(request.input) as {
        readonly candidates: readonly { readonly candidateId: string }[];
      }).candidates;
      const output = JSON.stringify({ presentations: candidates.map((candidate) => ({
        candidateId: candidate.candidateId, status: "unavailable", kind: "subject_label",
        text: "", support: [], qualifications: [], confidence: 0,
        qualificationJudgment: "none",
      })) });
      return new Response(JSON.stringify({ status: "completed", output: [{
        type: "message", content: [{ type: "output_text", text: output }],
      }] }));
    });
    const builder = new OpenAiPromotionPresentationV3Builder({
      apiKey: "fixture", fetchFn,
    });
    const result = await builder.build([input(1), input(2), input(3), input(4)]);
    expect(result).toHaveLength(4);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(requestSizes.every((size) =>
      size <= READER_POST_PRESENTATION_V3_MAX_REQUEST_BYTES)).toBe(true);
  });

  it("rejects an oversized response body", async () => {
    const builder = new OpenAiPromotionPresentationV3Builder({ apiKey: "fixture",
      fetchFn: async () => new Response("x".repeat(256 * 1024 + 1)) });
    await expect(builder.build([{ ...input(1), body: "body" }]))
      .rejects.toThrow(/256 KiB/u);
  });

  it("applies the shared headline contract to model output", async () => {
    const source = { ...input(1), title: "Orion model", body: "Supported body" };
    const proposal = {
      candidateId: source.candidateId, status: "available", kind: "claim",
      text: "Supported claim", support: [{ field: "bodyPreview", start: 0,
        end: 9, quote: "Supported" }], qualifications: [], confidence: 0.9,
      qualificationJudgment: "subject_only",
    };
    const builder = new OpenAiPromotionPresentationV3Builder({ apiKey: "fixture",
      fetchFn: async () => new Response(JSON.stringify({ status: "completed", output: [{
        type: "message", content: [{ type: "output_text", text: JSON.stringify({
          presentations: [proposal],
        }) }],
      }] })) });

    await expect(builder.build([source])).resolves.toEqual([
      { status: "unavailable", reason: "invalid_presentation" },
    ]);
  });

  it.each([
    ["wrong identity", [proposal("candidate-1"), proposal("candidate-wrong")]],
    ["missing identity", [proposal("candidate-1")]],
    ["extra identity", [proposal("candidate-1"), proposal("candidate-2"),
      proposal("candidate-extra")]],
    ["duplicate identity", [proposal("candidate-1"), proposal("candidate-1")]],
    ["unknown status", [proposal("candidate-1"),
      { ...proposal("candidate-2"), status: "unknown" }]],
  ])("rejects the whole multi-item batch for %s", async (_label, presentations) => {
    const builder = new OpenAiPromotionPresentationV3Builder({ apiKey: "fixture",
      fetchFn: async () => presentationResponse(presentations) });

    await expect(builder.build([{ ...input(1), body: "body" },
      { ...input(2), body: "body" }])).rejects.toThrow(/presentation/u);
  });

  it.each([
    ["extra root member", { presentations: [proposal("candidate-1"),
      proposal("candidate-2")], unexpected: true }],
    ["missing root member", { unexpected: true }],
    ["null root", null],
    ["array root", [proposal("candidate-1"), proposal("candidate-2")]],
    ["malformed collection", { presentations: {} }],
  ])("rejects the whole multi-item batch for %s", async (_label, root) => {
    const builder = new OpenAiPromotionPresentationV3Builder({ apiKey: "fixture",
      fetchFn: async () => presentationRootResponse(root) });

    await expect(builder.build([{ ...input(1), body: "body" },
      { ...input(2), body: "body" }])).rejects.toThrow(/presentation/u);
  });
});

function proposal(candidateId: string) { return { candidateId, status: "unavailable",
  kind: "subject_label", text: "", support: [], qualifications: [], confidence: 0,
  qualificationJudgment: "none" }; }

const presentationResponse = (presentations: readonly unknown[]): Response =>
  presentationRootResponse({ presentations });

const presentationRootResponse = (root: unknown): Response =>
  new Response(JSON.stringify({ status: "completed", output: [{ type: "message",
    content: [{ type: "output_text", text: JSON.stringify(root) }] }] }));
