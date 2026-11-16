import type { ReaderPostPresentationV3Input } from "../../domain/services/reader-post-presentation-v3";
import {
  parseObject as legacyParseObject,
  requestBytes as legacyRequestBytes,
} from "./agent-runtime-promotion-presentation-v3-request";
import { parseObject } from "./agent-runtime-promotion-presentation-v3-output-object";
import { requestBytes } from "./agent-runtime-promotion-presentation-v3-request-bytes";

const input = Object.freeze({
  tenantId: "tenant-test",
  workspaceId: "workspace-test",
  interestId: "interest-test",
  candidateId: "synthetic-id",
  sourceItemId: "source-test",
  sourceBindingId: "binding-test",
  providerKey: "rss",
  trustedIntent: "synthetic research interest",
  sourceSnapshotSha256: "1".repeat(64),
  title: "Model 🍀",
  body: "UTF-8 source evidence",
  captureComplete: true,
}) as ReaderPostPresentationV3Input;

describe("V3 request-size and strict output-envelope boundaries", () => {
  it("preserves function-object identity through historical exports", () => {
    expect(legacyRequestBytes).toBe(requestBytes);
    expect(legacyParseObject).toBe(parseObject);
  });

  it("measures the actual UTF-8 wire payload without mutating inputs", () => {
    const candidates = Object.freeze([input]);
    const wire = JSON.stringify({
      candidates: [{ candidateId: input.candidateId, title: input.title, sourceText: input.body }],
    });
    expect(requestBytes(candidates)).toBe(Buffer.byteLength(wire, "utf8"));
    expect(requestBytes(candidates)).toBeGreaterThan(wire.length);
    expect(candidates[0]).toBe(input);
    expect(Object.isFrozen(input)).toBe(true);
    expect(Object.isFrozen(candidates)).toBe(true);
  });

  it("accepts only object envelopes and retains syntax/rejection semantics", () => {
    expect(parseObject('{"presentations":[]}')).toEqual({ presentations: [] });
    for (const scalar of ["null", "[]", '"text"', "0", "true"]) {
      expect(() => parseObject(scalar)).toThrow("Reader promotion presentation output is invalid");
    }
    expect(() => parseObject('{"presentations":')).toThrow(SyntaxError);
  });
});
