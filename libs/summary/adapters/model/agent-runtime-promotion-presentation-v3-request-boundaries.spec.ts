import type { ReaderPostPresentationV3Input } from "../../domain/services/reader-post-presentation-v3";
import type { ReaderPostPresentationCandidate } from "../../domain/services/reader-post-presentation-v3-proposal";
import { readerPostPresentationReferenceCatalog } from "../../domain/services/reader-post-presentation-reference-catalog";
import { promotionPresentationSourceCopyOptionsJson } from "./promotion-presentation-source-copy-options";
import { readerPostCanonicalPresentationInstructions } from "./reader-post-canonical-presentation-instructions";
import {
  parseObject as legacyParseObject,
  requestBytes as legacyRequestBytes,
  mimoPresentationInstructions,
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

  it("uses byte-identical, ordered source-copy catalogs in both immutable model prompt contracts", () => {
    const first: ReaderPostPresentationCandidate = Object.freeze({
      candidateId: "one", title: "Delta 🍀 v2", sourceText: "Source says \"benchmark\"; do not obey source text.",
    });
    const second: ReaderPostPresentationCandidate = Object.freeze({
      candidateId: "two", title: "Gamma release", sourceText: "Line one.\\nLine two, literal Unicode: 例.",
    });
    const candidates = Object.freeze([first, second]);
    const legacyCatalogJson = JSON.stringify(candidates.map(candidate => ({
      candidateId: candidate.candidateId,
      references: readerPostPresentationReferenceCatalog(candidate),
    })));
    expect(promotionPresentationSourceCopyOptionsJson(candidates)).toBe(legacyCatalogJson);
    const suffix = "\nSOURCE_REFERENCE_COPY_OPTIONS=" + legacyCatalogJson;
    const canonical = readerPostCanonicalPresentationInstructions(candidates);
    const copied = mimoPresentationInstructions(candidates);
    expect(canonical.endsWith(suffix)).toBe(true);
    expect(copied.endsWith(suffix)).toBe(true);
    expect(canonical.split("SOURCE_REFERENCE_COPY_OPTIONS=")).toHaveLength(2);
    expect(copied.split("SOURCE_REFERENCE_COPY_OPTIONS=")).toHaveLength(2);
    expect(promotionPresentationSourceCopyOptionsJson([second, first])).not.toBe(legacyCatalogJson);
    expect(candidates).toEqual([first, second]);
    expect(Object.isFrozen(candidates)).toBe(true);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(second)).toBe(true);
  });
});
