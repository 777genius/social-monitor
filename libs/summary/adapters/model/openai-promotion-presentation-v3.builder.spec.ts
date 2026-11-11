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
      { status: "unavailable", reason: "invalid_presentation",
        validation: { stage: "headline_seal", code: "qualification_judgment" } },
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
  it("preserves the OpenAI wire format, isolated transport and exact request scope", async () => {
    let sentEndpoint: string | URL | undefined;
    let sentInit: RequestInit | undefined;
    const fetchFn = jest.fn(async (endpoint: string | URL, init?: RequestInit) => {
      sentEndpoint = endpoint;
      sentInit = init;
      return presentationResponse([proposal("candidate-1")]);
    });
    const builder = new OpenAiPromotionPresentationV3Builder({
      apiKey: "fixture",
      endpointUrl: "https://example.test/v1/responses",
      model: "gpt-5.4-mini",
      fetchFn,
    });
    await expect(builder.build([{ ...input(1), body: "Source body" }]))
      .resolves.toEqual([{ status: "unavailable", reason: "insufficient_support" }]);

    const sentBody = JSON.parse(String(sentInit?.body)) as {
      readonly model: string;
      readonly store: boolean;
      readonly max_output_tokens: number;
      readonly instructions: string;
      readonly input: string;
      readonly text: { readonly format: {
        readonly type: string;
        readonly name: string;
        readonly strict: boolean;
      } };
    };
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(sentEndpoint).toBe("https://example.test/v1/responses");
    expect(sentInit?.method).toBe("POST");
    expect(sentInit?.headers).toEqual({
      authorization: "Bearer fixture", "content-type": "application/json",
    });
    expect(sentInit?.signal).toBeInstanceOf(AbortSignal);
    expect(sentBody).toMatchObject({
      model: "gpt-5.4-mini", store: false, max_output_tokens: 2_400,
      text: { format: { type: "json_schema",
        name: "reader_post_presentation_v3", strict: true } },
    });
    expect(sentBody.instructions).toBe(
      "Create a short reader headline for every candidate using only its exact title and sourceText. Preserve every material qualification. Return unavailable when support is insufficient. Evidence offsets are JavaScript UTF-16 offsets into title or the complete sourceText, named bodyPreview. Never use outside knowledge, popularity, prior scores, or candidate order.",
    );
    expect(JSON.parse(sentBody.input)).toEqual({
      candidates: [{ candidateId: "candidate-1", title: "title-1", sourceText: "Source body" }],
    });
  });

  it("rejects non-success HTTP transport results before decoding output", async () => {
    const builder = new OpenAiPromotionPresentationV3Builder({
      apiKey: "fixture",
      fetchFn: async () => new Response("untrusted", { status: 503 }),
    });
    await expect(builder.build([{ ...input(1), body: "Source body" }]))
      .rejects.toThrow("V3 presentation failed with HTTP 503");
  });

  it("fails closed on incomplete provider envelopes", async () => {
    const builder = new OpenAiPromotionPresentationV3Builder({
      apiKey: "fixture",
      fetchFn: async () => new Response(JSON.stringify({ status: "incomplete", output: [] })),
    });
    await expect(builder.build([{ ...input(1), body: "Source body" }]))
      .rejects.toThrow("V3 presentation did not complete");
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
