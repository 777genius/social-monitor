import { BinaryReader } from "@bufbuild/protobuf/wire";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import * as wire from "@social-monitor/contracts/generated/grpc/x_collector/v1/x_collector";
import { acquisitionFixture, outcomeFixture } from "../../domain/x-observation/x-observation.spec-support";
import { xSemanticDigest } from "./x-observation-digest";
import { decodeXEvent, XOutcomeChunks } from "./x-observation-wire";

// Frozen using the actual f338 donor generated codec, isolated in a test namespace.
const vectors = [
  {"hex": "0a710a0973796e746865746963120a323032362d30382d33301801200128013240616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161613a04686f6d6542076669787475726568904e", "sha256": "7fe3afbcb0437b69f93a55ba85dff426660f0af787bbb8f8a8c73f42255adb7f"},
  {"hex": "0a730a0973796e746865746963120a323032362d30382d33301801200128063240616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161613a04686f6d65420766697874757265500068904e", "sha256": "d5015e2559c56809eb204166fb41fff8ddd61ee6a8fd05f90f5a4e9032f33ae7"},
  {"hex": "1283020a0973796e746865746963120a323032362d30382d333018012240616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161612a406161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616130063a0608c0f1ffd406420608c0f1ffd4064a0608c0f1ffd406500158007800880101b2014061616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161", "sha256": "0c98c36c072e87bdad9e0dce3612afe22e69657f94301b7eb16b579cf3a34ed9"},
  {"hex": "1a250a0973796e746865746963120a323032362d30382d333018022a0042080809100118002001", "sha256": "86042dc47d6bec6f81c5631aa92f294778a5aac7666ef114b73333be0d9634da"},
  {"hex": "1286020a0973796e746865746963120a323032362d30382d333018012240616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161612a406161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616130063a0608c0f1ffd406420608c0f1ffd4064a0608c0f1ffd406500158007800880101b2014061616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161ba0100", "sha256": "927ab1e1b5c6d28b5b83e88fec99cc32ffd5ddbe1fc3e188035ed2b3edf6b771"},
  {"hex": "1288020a0973796e746865746963120a323032362d30382d333018012240616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161612a406161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616130063a0608c0f1ffd406420608c0f1ffd4064a0608c0f1ffd406500158007800880101b2014061616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161ba01020802", "sha256": "a7fc55cb5bde40f756c9c2f7d6fabf27090575355b80f6729d8e8ee7d0b5aa68"},
  {"hex": "12c7040a0973796e746865746963120a323032362d30382d333018012240616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161612a406161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616130063a0608c0f1ffd406420608c0f1ffd4064a0608c0f1ffd406500158007800880101b2014061616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161ba01c0020802129e010a03323031122068747470733a2f2f782e636f6d2f666978747572652f7374617475732f3230311a0608c0f1ffd40622002801322a554e5245434f474e495a454420f09f988020585f4f42534552564154494f4e5f53544147455f484f4d453a290a050801120130121408011210393030373139393235343734303939331a020802220208022a020802420608c0f1ffd4064a0171520762696e64696e67129a010a03323031122068747470733a2f2f782e636f6d2f666978747572652f7374617475732f3230311a0608c0f1ffd406322a554e5245434f474e495a454420f09f988020585f4f42534552564154494f4e5f53544147455f484f4d453a290a050801120130121408011210393030373139393235343734303939331a020802220208022a020802420608c0f1ffd4064a0171520762696e64696e67", "sha256": "b10a33daaaf885f32c2b5eae4a4bc7f88691459ae5c645a7909314d3a4baa9c5"},
];
const collection = [
  {"name": "CollectDailySearchRequest", "json": {"schemaVersion": 1, "requestId": "synthetic", "query": "fixture", "searchProducts": [1, 2], "windowEnd": "2026-09-08T12:00:00.000Z"}, "hex": "0801120973796e7468657469634207666978747572655a0608c0f1ffd40662020102"},
  {"name": "CollectDailySearchResponse", "json": {"schemaVersion": 1, "posts": [{"tweetId": "201", "text": "\ud83d\ude00", "contentKind": 3, "metrics": {"likes": "9007199254740993", "retweets": "18446744073709551615", "likesObserved": true}}]}, "hex": "080112250a033230311a04f09f98803a1608818080808080801010ffffffffffffffffff0140015803"},
  {"name": "CheckHealthRequest", "json": {"service": "fixture"}, "hex": "0a0766697874757265"},
  {"name": "CheckHealthResponse", "json": {"status": 1, "collectorEngine": "fixture"}, "hex": "0801120766697874757265"},
];
const v3 = "{\"authorityHash\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\",\"eventIndex\":1,\"eventKind\":\"INVOCATION_CLOSED\",\"kind\":\"x-canonical-capture\",\"operationId\":\"seven-day-6101-6102/x-canonical-capture-v3\",\"payload\":{\"captureClock\":{\"clockDomainId\":\"synthetic-clock\",\"evidenceHash\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\",\"executionEpochId\":\"synthetic-execution\",\"tickMs\":1,\"writerEpochId\":\"synthetic-writer\"},\"evidenceHash\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\",\"invocationId\":\"synthetic-invocation\",\"passStates\":[],\"returnedRecordHash\":null,\"status\":\"PARTIAL_CAPTURE\"},\"payloadHash\":\"951811ca88186943a21be228eca5ae5270fb73fbecf3b4568b1fe63d4b6f9fa5\",\"schemaVersion\":3}";
const bytes = (index: number) => Buffer.from(vectors[index]!.hex, "hex");
function protocol(raw: Buffer) { expect(() => decodeXEvent(raw)).toThrow("PROTOCOL_ERROR"); }
function parserOrProtocol(raw: Buffer) {
  let error: unknown;
  try { decodeXEvent(raw); } catch (caught) { error = caught; }
  expect(error).toBeInstanceOf(Error);
  expect(error).not.toBeInstanceOf(TypeError);
  expect((error as Error).message).toMatch(/PROTOCOL_ERROR|premature EOF|invalid wire type|cant skip wire type [0-7]|illegal tag: field no \d+ wire type \d+|invalid varint|out of range|index out of range/u);
}
const envelope = (tag: number, nested: Uint8Array) => {
  const length: number[] = []; let n = nested.length;
  do { length.push((n & 127) | (n > 127 ? 128 : 0)); n >>>= 7; } while (n);
  return Buffer.concat([Buffer.from([tag, ...length]), nested]);
};
describe("legacy event schema compatibility", () => {
  it("admits exactly the frozen and Python empty packed spellings", () => {
    if (process.env.X_OBSERVATION_PYTHON_ARTIFACT) {
      const artifact = JSON.parse(readFileSync(process.env.X_OBSERVATION_PYTHON_ARTIFACT, "utf8")) as { producer: string; vectors: { hex: string }[] };
      expect(artifact.producer).toBe("independent-python-constructors"); expect(artifact.vectors).toHaveLength(7);
      artifact.vectors.forEach((item, index) => {
        const raw = Buffer.from(item.hex, "hex"), expected = bytes(index);
        expect(raw).toEqual(index === 3 ? Buffer.from("1a230a0973796e746865746963120a323032362d30382d3330180242080809100118002001", "hex") : expected);
        expect(decodeXEvent(raw)).toEqual(decodeXEvent(expected));
        expect(xSemanticDigest(decodeXEvent(raw))).toBe(xSemanticDigest(decodeXEvent(expected)));
        expect(Buffer.from(wire.XObservationEvent.encode(wire.XObservationEvent.decode(raw)).finish())).toEqual(expected);
      });
    }
    const python = Buffer.from("1a230a0973796e746865746963120a323032362d30382d3330180242080809100118002001", "hex");
    expect(createHash("sha256").update(python).digest("hex")).toBe("dc829e979a6b433a5f7e7d97e98b7382a670ef77885b4547c82d98d2d99a07e4");
    const good = () => {
      expect(decodeXEvent(python)).toEqual(decodeXEvent(bytes(3)));
      expect(decodeXEvent(bytes(0))).toHaveProperty("offer");
      expect(decodeXEvent(bytes(1))).toHaveProperty("offer");
    };
    good();
    expect(Buffer.from(wire.XObservationEvent.encode(wire.XObservationEvent.decode(python)).finish())).toEqual(bytes(3));
    for (const raw of [python, bytes(3)]) {
      for (const extra of [[0x78, 1], [0x20, 0], [0x18, 2], [0x2a, 0]]) {
        protocol(envelope(26, Buffer.concat([raw.subarray(2), Buffer.from(extra)])));
      }
      protocol(Buffer.concat([raw, Buffer.from([0x78, 1])])); protocol(Buffer.concat([raw, raw]));
      protocol(Buffer.concat([bytes(0), raw]));
    }
    for (const consumedSequences of [[0], [1], [0, 1, 127, 128, 4294967295]]) {
      const finished = { ...wire.XObservationEvent.decode(bytes(3)).finished!, consumedSequences };
      const raw = Buffer.from(wire.XObservationEvent.encode({ finished }).finish());
      expect(decodeXEvent(raw)).toMatchObject({ finished: { consumedSequences } });
    }
    const fields = (raw: Uint8Array) => {
      const reader = new BinaryReader(raw), result: Buffer[] = [];
      while (reader.pos < reader.len) { const start = reader.pos; reader.skip(reader.uint32() & 7); result.push(Buffer.from(raw.subarray(start, reader.pos))); }
      return result;
    };
    const parts = fields(python.subarray(2)), prefix = Buffer.concat(parts.slice(0, 3)), terminal = parts[3]!;
    for (const packed of ["2a002a00", "2a002a0101", "2a01002a0101", "2800", "2a028000", "2a058080808010", "2a8000"]) {
      protocol(envelope(26, Buffer.concat([prefix, Buffer.from(packed, "hex"), terminal])));
    }
    for (const body of [Buffer.concat([...parts].reverse()), Buffer.concat([prefix, terminal, Buffer.from("2a00", "hex")]),
      Buffer.concat([prefix, envelope(66, Buffer.concat([terminal.subarray(2), Buffer.from("7801", "hex")]))]),
      Buffer.concat([prefix, Buffer.from("3200", "hex"), terminal]),
      Buffer.concat([parts[0]!, parts[1]!, Buffer.from("188200", "hex"), terminal])]) protocol(envelope(26, body));
    protocol(Buffer.concat([Buffer.from("9a0023", "hex"), python.subarray(2)]));
    protocol(Buffer.concat([Buffer.from("1aa300", "hex"), python.subarray(2)]));
    for (const length of [127, 128, 16383, 16384]) {
      // Choose padding from the actual generated body length, covering envelope varint transitions.
      const base = wire.XObservationEvent.fromJSON({ finished: { operationId: "*\u0000", state: 2, reaped: true,
        targetOutcomeCounts: [{ state: 1, count: 2 }], lastReceiptHash: "x" } }).finished!;
      let body = Buffer.from(wire.XObservationFinished.encode(base).finish());
      base.lastReceiptHash = "x".repeat(length - body.length + 1);
      body = Buffer.from(wire.XObservationFinished.encode(base).finish());
      base.lastReceiptHash = base.lastReceiptHash.slice(0, base.lastReceiptHash.length + length - body.length);
      body = Buffer.from(wire.XObservationFinished.encode(base).finish()); expect(body).toHaveLength(length);
      const literal = envelope(26, body), omitted = envelope(26, Buffer.concat(fields(body).filter(field => field[0] !== 42)));
      expect(decodeXEvent(omitted)).toEqual(decodeXEvent(literal));
      expect(decodeXEvent(omitted)).toMatchObject({ finished: { operationId: "*\u0000", reaped: true,
        consumedSequences: [], targetOutcomeCounts: [{ state: "OBSERVED", count: 2 }] } });
    }
    for (const stage of [-1, 0, 99]) {
      const outcome = wire.XObservationEvent.decode(bytes(2)).sendOutcome!;
      protocol(Buffer.from(wire.XObservationEvent.encode({ sendOutcome: { ...outcome, stage } }).finish()));
      const finished = wire.XObservationEvent.decode(bytes(3)).finished!;
      protocol(Buffer.from(wire.XObservationEvent.encode({ finished: { ...finished, terminalError: { ...finished.terminalError!, stage } } }).finish()));
    }
    good();
  });
  it("roundtrips frozen HOME, SEARCH, outcome, finished and field23 presence vectors", () => {
    for (let i = 0; i < vectors.length; i++) {
      const raw = bytes(i), decoded = wire.XObservationEvent.decode(raw);
      expect(createHash("sha256").update(raw).digest("hex")).toBe(vectors[i]!.sha256);
      expect(Buffer.from(wire.XObservationEvent.encode(decoded).finish())).toEqual(raw);
      expect(decodeXEvent(raw)).toBeDefined();
    }
    const homeZero = wire.XObservationEvent.decode(bytes(0)); homeZero.sendOffer!.pageIndex = 0;
    expect(decodeXEvent(Buffer.from(wire.XObservationEvent.encode(homeZero).finish()))).toMatchObject({ offer: { stage: "HOME", pageIndex: 0 } });
    const millis = wire.XObservationEvent.decode(bytes(2)); millis.sendOutcome!.startedAt = new Date("2026-09-08T12:00:00.123Z");
    expect(decodeXEvent(Buffer.from(wire.XObservationEvent.encode(millis).finish()))).toMatchObject({ outcome: { startedAt: "2026-09-08T12:00:00.123Z" } });
    const home = decodeXEvent(bytes(0)), search = decodeXEvent(bytes(1));
    expect(home).toMatchObject({ offer: { stage: "HOME", timeoutMs: 10000 } });
    expect(search).toMatchObject({ offer: { stage: "SEARCH", pageIndex: 0 } });
    if (!("offer" in home) || !("offer" in search)) throw new Error("fixture");
    expect(home.offer).not.toHaveProperty("pageIndex");
    for (const key of ["queryId", "cursorHash", "parentSequence"]) expect(search.offer).not.toHaveProperty(key);
    expect(decodeXEvent(bytes(2))).toMatchObject({ outcome: { encodedBytes: 0, decodedBytes: 0, headerBytes: 0,
      candidateCount: 0, statusCode: 0, finalChunk: false, reducedObservations: [], targetOutcomes: [],
      startedAt: "2026-09-08T12:00:00.000Z", resultHash: "a".repeat(64) } });
    expect(decodeXEvent(bytes(3))).toMatchObject({ finished: { reaped: false, consumedSequences: [],
      targetOutcomeCounts: [], terminalError: { sequence: 0, retryable: false, code: "CANCELLED" } } });
    expect(wire.XObservationEvent.decode(bytes(2)).sendOutcome?.acquisition).toBeUndefined();
    expect(bytes(4).subarray(-3)).toEqual(Buffer.from([0xba, 1, 0]));
    expect(wire.XObservationEvent.decode(bytes(4)).sendOutcome?.acquisition).toEqual({ schemaVersion: 0, acquiredPosts: [] });
    expect(wire.XObservationEvent.decode(bytes(5)).sendOutcome?.acquisition).toEqual({ schemaVersion: 2, acquiredPosts: [] });
    const posts = wire.XObservationEvent.decode(bytes(6)).sendOutcome!.acquisition!.acquiredPosts;
    expect(posts[0]).toMatchObject({ authorHandle: "", contentKind: 1, text: "UNRECOGNIZED 😀 X_OBSERVATION_STAGE_HOME",
      metrics: { likes: { valueDecimal: "0" }, reposts: { valueDecimal: "9007199254740993" } } });
    expect(posts[1]!.authorHandle).toBeUndefined(); expect(posts[1]!.contentKind).toBeUndefined();
    expect(posts[1]!.metrics!.replies!.valueDecimal).toBeUndefined();
  });
  it("preserves ordinary collection bytes, defaults, unknown fields and only two methods", () => {
    for (const fixture of collection) {
      const codec = wire[fixture.name as "CollectDailySearchRequest"];
      const raw = Buffer.from(fixture.hex, "hex");
      expect(Buffer.from(codec.encode(codec.fromJSON(fixture.json)).finish())).toEqual(raw);
      expect(Buffer.from(codec.encode(codec.decode(raw)).finish())).toEqual(raw);
      expect(codec.decode(Buffer.concat([raw, Buffer.from([0xf8, 0x07, 1])]))).toEqual(codec.decode(raw));
      expect(codec.toJSON(codec.fromJSON({}))).toEqual({});
    }
    expect(Object.keys(wire.XCollectorServiceService)).toEqual(["collectDailySearch", "checkHealth"]);
    const metrics = wire.CollectDailySearchResponse.decode(Buffer.from(collection[1]!.hex, "hex")).posts[0]!.metrics!;
    expect(metrics.likes).toBe("9007199254740993"); expect(metrics.retweets).toBe("18446744073709551615");
  });
  it("distinguishes permissive protobuf parsing from canonical legacy admission", () => {
    const valid = bytes(0), offer = wire.XObservationEvent.decode(valid).sendOffer!;
    const nested = Buffer.from(wire.XObservationSendOffer.encode(offer).finish());
    const good = () => expect(decodeXEvent(valid)).toMatchObject({ offer: { stage: "HOME" } });
    good();
    const unknown = Buffer.concat([valid, Buffer.from([0x78, 1])]);
    expect(wire.XObservationEvent.decode(unknown)).toEqual(wire.XObservationEvent.decode(valid));
    const firstFieldLength = 2 + Buffer.byteLength(offer.operationId);
    for (const bad of [unknown, envelope(10, Buffer.concat([nested, Buffer.from([0x78, 1])])),
      Buffer.concat([valid, valid]), Buffer.concat([valid, bytes(3)]),
      envelope(10, Buffer.concat([nested, Buffer.from([0x18, 1])])),
      envelope(10, Buffer.concat([nested.subarray(firstFieldLength), nested.subarray(0, firstFieldLength)])),
      envelope(10, Buffer.concat([nested, Buffer.from([0x68, 0])]))]) protocol(bad);
    for (const stage of [-1, 99]) protocol(Buffer.from(wire.XObservationEvent.encode({ sendOffer: { ...offer, stage } }).finish()));
    good();
    const outcome = wire.XObservationEvent.decode(bytes(2)).sendOutcome!;
    const rawOutcome = Buffer.from(wire.XObservationSendOutcome.encode(outcome).finish());
    // Replace only started_at, preserving field order and avoiding duplicate fields.
    const offset = rawOutcome.indexOf(Buffer.from([0x3a, 6]));
    expect(offset).toBeGreaterThan(0);
    const timestamp = rawOutcome.subarray(offset + 2, offset + 8);
    for (const nanos of [0, 1]) {
      const replaced = envelope(0x3a, Buffer.concat([timestamp, Buffer.from([0x10, nanos])]));
      protocol(envelope(18, Buffer.concat([rawOutcome.subarray(0, offset), replaced, rawOutcome.subarray(offset + 8)])));
    }
    good();
    for (const bad of [Buffer.alloc(0), Buffer.from([10, 128]), Buffer.from([10, 2, 8]),
      Buffer.from([15]), Buffer.from([0x80]), Buffer.alloc(262145), Buffer.from(v3)]) parserOrProtocol(bad);
    good();
  });
  it("rejects UNSPECIFIED enum values even when generated JSON omits their defaults", () => {
    expect(decodeXEvent(bytes(0))).toMatchObject({ offer: { stage: "HOME" } });
    const offer = wire.XObservationEvent.decode(bytes(0)).sendOffer!;
    protocol(Buffer.from(wire.XObservationEvent.encode({ sendOffer: { ...offer, stage: 0 } }).finish()));
    const outcome = wire.XObservationEvent.decode(bytes(2)).sendOutcome!;
    protocol(Buffer.from(wire.XObservationEvent.encode({ sendOutcome: { ...outcome, stage: 0 } }).finish()));
    const finished = wire.XObservationEvent.decode(bytes(3)).finished!;
    protocol(Buffer.from(wire.XObservationEvent.encode({ finished: { ...finished, terminalError: { ...finished.terminalError!, stage: 0 } } }).finish()));
    expect(decodeXEvent(bytes(1))).toMatchObject({ offer: { stage: "SEARCH", pageIndex: 0 } });
  });
  it("retains all structural chunk limits and resets after successful final merge", () => {
    const base = outcomeFixture(), { post } = acquisitionFixture();
    for (const key of ["reducedObservations", "targetOutcomes"] as const) {
      expect(() => new XOutcomeChunks().accept({ ...base, [key]: Array(101).fill({}) })).toThrow("PROTOCOL_ERROR");
      const chunks = new XOutcomeChunks();
      for (let i = 0; i < 10; i++) expect(chunks.accept({ ...base, [key]: Array(100).fill({}), chunkIndex: i, finalChunk: false })).toBeNull();
      expect(() => chunks.accept({ ...base, [key]: [{}], chunkIndex: 10 })).toThrow("PROTOCOL_ERROR");
    }
    const chunks = new XOutcomeChunks();
    expect(chunks.accept({ ...base, acquisition: { schemaVersion: 2, acquiredPosts: Array(100).fill(post) } })?.acquisition?.acquiredPosts).toHaveLength(100);
    expect(chunks.pending).toBe(false); expect(chunks.accept(base)).toEqual(base);
    for (const key of ["operationId", "batchId", "resultHash", "requestDigest"] as const) {
      const aggregate = new XOutcomeChunks(); aggregate.accept({ ...base, finalChunk: false });
      expect(() => aggregate.accept({ ...base, chunkIndex: 1, [key]: "changed" })).toThrow("PROTOCOL_ERROR");
    }
    expect(() => new XOutcomeChunks().accept({ ...base, reservationHash: "x".repeat(8 * 1024 * 1024) })).toThrow("PROTOCOL_ERROR");
    const renamed = { ...base, acquisition: { schemaVersion: 3, acquiredPosts: [] } };
    expect(() => new XOutcomeChunks().accept(renamed as unknown as Parameters<XOutcomeChunks["accept"]>[0])).toThrow("PROTOCOL_ERROR");
    expect(JSON.parse(v3)).toMatchObject({ kind: "x-canonical-capture", schemaVersion: 3, operationId: "seven-day-6101-6102/x-canonical-capture-v3" });
    expect(decodeXEvent(bytes(0))).toHaveProperty("offer"); parserOrProtocol(Buffer.from(v3));
  });
});
