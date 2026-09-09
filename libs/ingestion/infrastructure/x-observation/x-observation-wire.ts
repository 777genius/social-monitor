import { XObservationEvent as WireEvent } from "@social-monitor/contracts/generated/grpc/x_collector/v1/x_collector";
import { BinaryReader, BinaryWriter } from "@bufbuild/protobuf/wire";
import type { XEvent } from "../../features/observe-retained-x/x-observation.contracts";
import type { XSendOutcome } from "../../domain/x-observation/x-observation-contract";
import { xUtf8Bytes, xExactKeys } from "../../domain/x-observation/x-observation-acquisition-contract";
import { xCanonicalJson } from "./x-observation-digest";

const enumPrefix = /^X_OBSERVATION_(?:MODE|STAGE|CURSOR_STATE|METRIC_STATE|IDENTITY_STATE|TARGET_STATE|FINISH_STATE|CANCEL_REASON|EFFECTS|FAILURE_CODE|OUTCOME_KIND|REASON_CODE)_/u;
const enumFields = new Set(["stage", "outcome", "cursorState", "identityState", "reasonCode", "state", "code", "effects", "mode", "reason", "contentKind"]);
function semantic(value: unknown, field = ""): unknown {
  if (field === "stage" && value === 0) throw new Error("PROTOCOL_ERROR");
  if (Array.isArray(value)) return value.map((item) => semantic(item));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, semantic(item, key)]));
  // Public text and identifiers are data, even if they happen to spell an enum token.
  if (typeof value !== "string" || !enumFields.has(field)) return value;
  if (value === "UNRECOGNIZED" || value.endsWith("_UNSPECIFIED")) throw new Error("PROTOCOL_ERROR");
  return value.replace(enumPrefix, "").replace(/^X_POST_CONTENT_KIND_/u, "");
}
// Generated toJSON omits protobuf defaults. Restore scalar zero/false and empty lists
// from the decoded structure while keeping its enum names and timestamp spelling.
function completeJson(raw: unknown, json: unknown): unknown {
  if (raw instanceof Date) return raw.toISOString();
  if (Array.isArray(raw)) return raw.map((item, index) => completeJson(item, (json as unknown[] | undefined)?.[index]));
  if (raw && typeof raw === "object") return Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== undefined).map(([key, value]) =>
    [key, completeJson(value, (json as Record<string, unknown> | undefined)?.[key])]));
  return json ?? raw;
}
function canonicalEvent(bytes: Buffer, wire: WireEvent): boolean {
  const canonical = Buffer.from(WireEvent.encode(wire).finish());
  if (canonical.equals(bytes)) return true;
  if (!wire.finished || wire.sendOffer || wire.sendOutcome || wire.finished.consumedSequences.length !== 0) return false;
  // Inspect only generated canonical bytes. Python omits the empty packed field5.
  const envelope = new BinaryReader(canonical);
  if (envelope.uint32() !== 26) return false;
  const body = envelope.bytes();
  if (envelope.pos !== envelope.len) return false;
  const reader = new BinaryReader(body), retained: Uint8Array[] = [];
  let removed = false;
  while (reader.pos < reader.len) {
    const start = reader.pos, tag = reader.uint32();
    reader.skip(tag & 7);
    if (tag >>> 3 === 5) {
      if (removed || tag !== 42 || reader.pos - start !== 2 || body[start + 1] !== 0) return false;
      removed = true;
    } else retained.push(body.subarray(start, reader.pos));
  }
  return removed && Buffer.from(new BinaryWriter().uint32(26).bytes(Buffer.concat(retained)).finish()).equals(bytes);
}
export function decodeXEvent(bytes: Buffer): XEvent {
  if (bytes.length > 256 * 1024) throw new Error("PROTOCOL_ERROR");
  const wire = WireEvent.decode(bytes);
  // Reject unknown fields, duplicate scalar/oneof fields and noncanonical timestamp encodings.
  if (!canonicalEvent(bytes, wire)) throw new Error("PROTOCOL_ERROR");
  const data = semantic(completeJson(wire, WireEvent.toJSON(wire))) as Record<string, unknown>;
  const keys = Object.keys(data);
  if (keys.length !== 1) throw new Error("PROTOCOL_ERROR");
  if (keys[0] === "sendOffer") return { offer: data.sendOffer } as XEvent;
  if (keys[0] === "sendOutcome") return { outcome: data.sendOutcome } as XEvent;
  if (keys[0] === "finished") return { finished: data.finished } as XEvent;
  throw new Error("PROTOCOL_ERROR");
}
export class XOutcomeChunks {
  private chunks: XSendOutcome[] = [];
  private bytes = 0;
  accept(chunk: XSendOutcome): XSendOutcome | null {
    const size = xUtf8Bytes(xCanonicalJson(chunk));
    // The decoder enforces the encoded 256KiB frame bound; this is the durable aggregate bound.
    if (this.bytes + size > 8 * 1024 * 1024 ||
        (chunk.acquisition !== undefined && (!xExactKeys(chunk.acquisition, "schemaVersion,acquiredPosts") || chunk.acquisition.schemaVersion !== 2 ||
          chunk.acquisition.acquiredPosts.length > 100))) throw new Error("PROTOCOL_ERROR");
    if (chunk.chunkIndex !== this.chunks.length || chunk.reducedObservations.length > 100 || chunk.targetOutcomes.length > 100 || this.chunks.length >= 20) throw new Error("PROTOCOL_ERROR");
    const header = (value: XSendOutcome) => Object.fromEntries(Object.entries(value).filter(([key]) => !["reducedObservations", "targetOutcomes", "chunkIndex", "finalChunk", "acquisition"].includes(key)));
    if (this.chunks[0] && xCanonicalJson(header(chunk)) !== xCanonicalJson(header(this.chunks[0]))) throw new Error("PROTOCOL_ERROR");
    if (this.chunks[0] && (this.chunks[0].acquisition === undefined) !== (chunk.acquisition === undefined)) throw new Error("PROTOCOL_ERROR");
    this.bytes += size;
    this.chunks.push(chunk);
    if (!chunk.finalChunk) return null;
    const result = { ...chunk, ...(chunk.acquisition ? { acquisition: { schemaVersion: 2 as const, acquiredPosts: this.chunks.flatMap((c) => c.acquisition!.acquiredPosts) } } : {}), chunkIndex: 0, finalChunk: true, reducedObservations: this.chunks.flatMap((item) => item.reducedObservations), targetOutcomes: this.chunks.flatMap((item) => item.targetOutcomes) };
    this.chunks = []; this.bytes = 0;
    if (result.reducedObservations.length > 1000 || result.targetOutcomes.length > 1000) throw new Error("PROTOCOL_ERROR");
    return result;
  }
  get pending() { return this.chunks.length > 0; }
}
