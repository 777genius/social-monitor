import type { Result } from "@social-monitor/shared-kernel";
import type { XAdmission, XCurrentEvidence, XFailure, XObservation, XPermit, XSendOffer, XSendOutcome, XTargetOutcome } from "../../domain/x-observation/x-observation-contract";

// Implementations hold the exclusive fixed operation fence for this entire workflow.
export interface XAuthorityJournal {
  read(name: string): unknown | null;
  install(name: string, value: unknown): void;
  names(): readonly string[];
  assertHeld(): void;
}
export interface XObservationInventory { current(): Promise<XCurrentEvidence> }
export type XStart = Readonly<{ schemaVersion: 1; operationId: string; grantHash: string; inventoryHash: string;
  tenantId: string; workspaceId: string; batchId: string; day: string; queryPlanHash: string;
  accountRef: string; dependencyHash: string; manifestHash: string; deadlineAt: string; mode: "EXECUTE" | "REPLAY_ONLY" }>;
export type XFinished = Readonly<{ operationId: string; batchId: string; state: "COMPLETE" | "PARTIAL" | "FAILED" | "UNCERTAIN" | "CANCELLED";
  reaped: boolean; consumedSequences: readonly number[]; lastReceiptHash: string;
  targetOutcomeCounts: readonly { state: XTargetOutcome["state"]; count: number }[]; terminalError?: XFailure }>;
export type XEvent = { offer: XSendOffer } | { outcome: XSendOutcome } | { finished: XFinished };
export type XAck = Readonly<{ operationId: string; batchId: string; sequence: number; resultHash: string; receiptHash: string }>;
export interface XObservationSession {
  next(signal?: AbortSignal): Promise<XEvent>;
  permit(value: XPermit): Promise<void>;
  acknowledge(value: XAck): Promise<void>;
  cancel(reason: "USER" | "DEADLINE" | "BUDGET" | "JOURNAL_FAILURE" | "AUTHORITY_CHANGED"): Promise<void>;
  close(): Promise<void>;
}
export interface XObservationClient { open(start: XStart): Promise<XObservationSession> }
export type XProjectionEvidence = Readonly<{ key: string; targetKey: string; observedAt: string;
  state: "COMMITTED" | "RECONCILED" | "NO_EFFECT"; observationsAppended: number | null; chunkKey?: string; chunkObservationsAppended?: number }>;
export interface XObservationProjection {
  project(admission: XAdmission, observations: readonly XObservation[], keys: readonly string[], prior: readonly XObservation[]): Promise<Result<readonly XProjectionEvidence[], XFailure>>;
  reconcile(admission: XAdmission, observation: XObservation, key: string, prior: readonly XObservation[]): Promise<Result<XProjectionEvidence, XFailure>>;
}
