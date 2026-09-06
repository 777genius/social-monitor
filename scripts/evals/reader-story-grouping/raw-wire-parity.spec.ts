import Ajv from "ajv";
import { AgentRuntimeReaderSummaryStoryRelationVerifier } from
  "@social-monitor/summary/adapters/model/agent-runtime-reader-summary-story-relation-verifier.adapter";
import { assertStoryRelationResponseSchema } from
  "@social-monitor/summary/adapters/model/story-relation-response-schema";
import { withTestExecutionAttestation } from
  "@social-monitor/summary/adapters/model/reader-summary-execution-attestation.spec-support";
import { canonicalJsonSha256 } from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import { loadDataset } from "./dataset";
import { prepareBlock } from "./replay";
import { captureRequest, canonicalRequestFor, normalizeCapturedResponse } from "./requests";

const specialKeys = ["__proto__", "constructor", "prototype", "toString"];
const failure = { kind: "invalid_schema", retryable: false };

describe.each(["binary", "related_topic"] as const)("%s raw wire parity", (lane) => {
  it("rejects raw own keys and malformed envelopes in structured and text outputs without retry or mutation", async () => {
    const data = loadDataset();
    const base = await prepareBlock(data, data.blocks[0]!);
    const prepared = lane === "binary" ? base : { ...base, verifierInput: {
      ...base.verifierInput, verificationLane: "related_topic" as const,
      candidates: base.verifierInput.candidates.map((c) => ({ ...c,
        subjectFeedItemId: c.leftFeedItemId, officialAnchorFeedItemId: c.rightFeedItemId })),
    } };
    const envelope = (await captureRequest(prepared))!;
    const candidate = prepared.verifierInput.candidates[0]!;
    const decision = { leftFeedItemId: candidate.leftFeedItemId, rightFeedItemId: candidate.rightFeedItemId,
      ...(lane === "binary" ? { sameStory: false } : { relation: "unrelated" }),
      confidenceScore: 0.5, rationale: " TEST uncertain evidence. " };
    const withKey = (raw: object, key: string): unknown =>
      JSON.parse(JSON.stringify(raw).slice(0, -1) + `,"${key}":{}}`) as unknown;
    const invalid: unknown[] = [null, [], true, false, 42, "fixture", {},
      { decisions: null }, { decisions: {} }, { decisions: [null] },
      ...specialKeys.flatMap((key) => [withKey({ decisions: [] }, key),
        withKey({ decisions: [decision] }, key), { decisions: [withKey(decision, key)] }])];
    for (const key of Object.keys(decision)) {
      const missing: Record<string, unknown> = { ...decision }; delete missing[key];
      invalid.push({ decisions: [missing] });
    }
    for (const value of [-Number.MIN_VALUE, 1 + Number.EPSILON, "0.5", null]) {
      invalid.push({ decisions: [{ ...decision, confidenceScore: value }] });
    }
    const oracle = new Ajv({ allErrors: true }).compile(envelope.command.outputSchema);
    for (const raw of invalid) {
      const bytes = JSON.stringify(raw);
      expect(oracle(raw)).toBe(false);
      expect(() => assertStoryRelationResponseSchema(raw, envelope.command.outputSchema)).toThrow();
      for (const textOnly of [false, true]) {
        const result = withTestExecutionAttestation(envelope.command, {
          status: "completed", warnings: [], outputText: bytes,
          ...(textOnly ? {} : { structuredOutput: raw as Record<string, unknown> }),
        });
        const original = JSON.stringify(result);
        const runTask = jest.fn().mockResolvedValue(result);
        const record = jest.fn();
        const native = new AgentRuntimeReaderSummaryStoryRelationVerifier({
          client: { runTask, checkHealth: jest.fn() }, verifiedAttestationSink: { record },
        });
        const nativeError: unknown = await native.verify(prepared.verifierInput).catch((e: unknown) => e);
        const replayError: unknown = await normalizeCapturedResponse(prepared, envelope, result).catch((e: unknown) => e);
        expect(nativeError).toMatchObject({ failure });
        expect(replayError).toMatchObject({ failure });
        if (!textOnly) expect(replayError).toMatchObject({ message: (nativeError as Error).message });
        expect(runTask).toHaveBeenCalledTimes(1);
        expect(record).not.toHaveBeenCalled();
        expect(JSON.stringify(result)).toBe(original);
      }
      expect(JSON.stringify(raw)).toBe(bytes);
    }
    const raw = { decisions: [decision] };
    const bytes = JSON.stringify(raw);
    expect(oracle(raw)).toBe(true);
    assertStoryRelationResponseSchema(raw, envelope.command.outputSchema);
    const result = withTestExecutionAttestation(envelope.command, {
      status: "completed", warnings: [], structuredOutput: raw,
    });
    const attested = { ...result, executionAttestation: { ...result.executionAttestation!,
      canonicalRequestSha256: canonicalJsonSha256(canonicalRequestFor(envelope.command)),
    } };
    await expect(normalizeCapturedResponse(prepared, envelope, attested)).resolves.toHaveLength(1);
    expect(JSON.stringify(raw)).toBe(bytes);
  });
});
