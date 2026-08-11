import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  assertDailyOutputCitationsMatchSourceAuthority,
  canonicalJsonBytes,
  canonicalRecoveryAmbiguityRetryDate,
  canonicalRecoveryAmbiguityRetryModelJobIdentity,
  canonicalRecoveryAmbiguityRetrySourceAuthoritySha256,
  canonicalRecoveryDates,
  canonicalRecoverySignalCount,
  canonicalRecoveryUnavailableReason,
  DailyCanonicalRecoveryRuntimeAbortedError,
  DailyCanonicalRecoveryRuntimeFailureError,
  DailyCanonicalRecoveryRuntimeTransportError,
  parseStrictDailyOutputText,
  sha256,
  type CanonicalRecoveryPublication,
  type CanonicalRecoveryTerminal,
  type CanonicalRecoveryUnavailable,
  type CanonicalRecoveryWork,
} from "./reader-summary-daily-canonical-recovery-v4";
import { ReaderSummaryDailyCanonicalRecoveryV4Executor } from "./reader-summary-daily-canonical-recovery-v4-executor";
import {
  assertPgCatalogOnlySecurityDefinerSearchPaths,
  assertReaderSummaryDailyCanonicalRecoveryV4MigrationContract,
} from "./reader-summary-daily-canonical-recovery-v4-postgres-contract";
import {
  assertReaderSummaryDailyCanonicalRecoveryV4HistoricalUnavailableMigrationContract,
} from "./reader-summary-daily-canonical-recovery-v4-historical-unavailable-postgres-contract";
import {
  assertReaderSummaryDailyCanonicalRecoveryV4InvalidRuntimeMigrationContract,
} from "./reader-summary-daily-canonical-recovery-v4-invalid-runtime-postgres-contract";
import {
  readerSummaryDailyCanonicalHistoricalGithubOmissionReason,
} from "./reader-summary-daily-source-authority-snapshot";
import { GrpcReaderSummaryDailyCanonicalRecoveryRuntime } from "./grpc-reader-summary-daily-subscription-runtime";

describe("reader-summary daily canonical recovery v4", () => {
  it("fixes exactly Jul23 through Jul30", () => {
    expect(canonicalRecoveryDates).toEqual([
      "2026-07-23",
      "2026-07-24",
      "2026-07-25",
      "2026-07-26",
      "2026-07-27",
      "2026-07-28",
      "2026-07-29",
      "2026-07-30",
    ]);
    expect(canonicalRecoveryDates).not.toContain("2026-07-21");
    expect(canonicalRecoveryDates).not.toContain("2026-07-22");
    expect(canonicalRecoveryDates).not.toContain("2026-07-31");
  });
  it("pins the one historical failed attempt binding", () => {
    expect(canonicalRecoveryAmbiguityRetryDate).toBe("2026-07-23");
    expect(canonicalRecoveryAmbiguityRetryModelJobIdentity).toBe(
      "241cc317da26fe2125ccf0590f99cee9d1694c91b4a019b036c9619c61e3672a",
    );
    expect(canonicalRecoveryAmbiguityRetrySourceAuthoritySha256).toBe(
      "010fd4f8da8aa2e4b332601e145e49549ff41c34b7ea498024b7449f9c827bbb",
    );
  });
  it("accepts only exact canonical output_text bytes", () => {
    const bytes = canonicalJsonBytes(validOutput());
    expect(parseStrictDailyOutputText(bytes.toString("utf8"))).toEqual(bytes);
    expect(() => parseStrictDailyOutputText(` ${bytes.toString("utf8")}`))
      .toThrow(/framing/u);
    expect(() => parseStrictDailyOutputText(JSON.stringify({
      ...validOutput(),
      unbound: true,
    }))).toThrow(/fields/u);
  });
  it("rejects any SECURITY DEFINER path other than pg_catalog", () => {
    const safe = `CREATE FUNCTION public.safe() RETURNS BOOLEAN
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $function$
      BEGIN RETURN TRUE; END; $function$`;
    expect(() => assertPgCatalogOnlySecurityDefinerSearchPaths(safe)).not.toThrow();
    expect(() => assertPgCatalogOnlySecurityDefinerSearchPaths(
      safe.replace("pg_catalog AS", "pg_catalog, public AS"),
    )).toThrow(/unsafe/u);
  });
  it("preserves legacy canonicalizers and enforces the owned unavailable migration", () => {
    expect(() => assertReaderSummaryDailyCanonicalRecoveryV4MigrationContract())
      .not.toThrow();
    expect(() =>
      assertReaderSummaryDailyCanonicalRecoveryV4HistoricalUnavailableMigrationContract(),
    ).not.toThrow();
    expect(() => assertReaderSummaryDailyCanonicalRecoveryV4InvalidRuntimeMigrationContract())
      .not.toThrow();
  });
  it.each([
    ["non-completed product", "invalid_or_non_completed_runtime_result"],
    ["transport", "runtime_transport_failure"],
    ["abort", "runtime_aborted"],
  ] as const)("keeps gRPC %s failures sanitized and distinct", async (_label, code) => {
    const claimed = work({ requestedUtcDate: "2026-07-24" });
    const abort = new AbortController();
    const client = { runTask: jest.fn(async () => {
      if (code === "invalid_or_non_completed_runtime_result") return { status: "failed" } as never;
      if (code === "runtime_aborted") abort.abort();
      throw new Error("transport");
    }) };
    await expect(new GrpcReaderSummaryDailyCanonicalRecoveryRuntime(client as never).run({
      tenantId: claimed.tenantId, workspaceId: claimed.workspaceId,
      modelJobIdentity: claimed.modelJobIdentity, requestedUtcDate: claimed.requestedUtcDate,
      sourceAuthorityBytes: claimed.sourceAuthorityBytes, signal: abort.signal,
    })).rejects.toMatchObject({ code });
  });
  it("binds citation ordinals and source identities to frozen evidence", () => {
    const authority = authorityBytes();
    const output = {
      ...validOutput(),
      citationMap: [{
        citationId: "c1",
        feedItemId: "30000000-0000-4000-8000-000000000003",
        sourceItemId: "40000000-0000-4000-8000-000000000004",
        providerKey: "rss",
        field: "canonicalUrl",
      }],
    };
    expect(() => assertDailyOutputCitationsMatchSourceAuthority(
      output,
      authority,
      200,
    )).not.toThrow();
    expect(() => assertDailyOutputCitationsMatchSourceAuthority({
      ...output,
      citationMap: [{ ...output.citationMap[0], sourceItemId: "forged" }],
    }, authority, 200)).toThrow(/frozen authority/u);
  });
  it("allows empty legacy bodyPreview but keeps citation authority text strict", () => {
    const output = {
      ...validOutput(),
      citationMap: [{
        citationId: "c1",
        feedItemId: "30000000-0000-4000-8000-000000000003",
        sourceItemId: "40000000-0000-4000-8000-000000000004",
        providerKey: "rss",
        field: "canonicalUrl",
      }],
    };
    const authority = JSON.parse(authorityBytes().toString("utf8")) as {
      items: Array<Record<string, unknown>>;
    };
    authority.items[0]!.bodyPreview = "";
    const legacyEmpty = Buffer.from(JSON.stringify(authority), "utf8");
    expect(() => assertDailyOutputCitationsMatchSourceAuthority(output, legacyEmpty, 200))
      .not.toThrow();
    authority.items[0]!.bodyPreview = null;
    expect(() => assertDailyOutputCitationsMatchSourceAuthority(
      output, Buffer.from(JSON.stringify(authority), "utf8"), 200,
    )).toThrow(/frozen authority/u);
    authority.items[0]!.bodyPreview = 1;
    expect(() => assertDailyOutputCitationsMatchSourceAuthority(
      output, Buffer.from(JSON.stringify(authority), "utf8"), 200,
    )).toThrow(/frozen authority/u);
    authority.items[0]!.bodyPreview = "Frozen body";
    authority.items[0]!.title = "";
    expect(() => assertDailyOutputCitationsMatchSourceAuthority(
      output, Buffer.from(JSON.stringify(authority), "utf8"), 200,
    )).toThrow(/frozen authority/u);
  });
  it("marks running after the irreversible claim and before one model call", async () => {
    const events: string[] = [];
    const publication = published();
    const responseBytes = canonicalJsonBytes(validOutput());
    const authority = {
      claim: jest.fn(async () => {
        events.push("claim-pre-model-consumed");
        return { kind: "claimed" as const, work: work() };
      }),
      markRunning: jest.fn(async () => { events.push("running"); }),
      renew: jest.fn(async (claimed: CanonicalRecoveryWork) => {
        events.push(`renew:${claimed.state}`);
        return claimed;
      }),
      complete: jest.fn(async (claimed: CanonicalRecoveryWork) => {
        events.push("complete");
        return {
          ...claimed,
          state: "COMPLETED" as const,
          completedAt: "2026-08-02T23:45:00.000Z",
          responseBytes,
          receiptBytes: Buffer.from("receipt"),
        };
      }),
      readFinalized: jest.fn(async () => {
        events.push("read-after-commit");
        return [publication];
      }),
      terminalizeUnavailable: jest.fn(async () => unavailableTerminal()),
      readUnavailable: jest.fn(async () => unavailableTerminal()),
      readTerminals: jest.fn(),
    };
    const runtime = {
      runtimeEngine: "subscription-runtime-cli" as const,
      run: jest.fn(async () => {
        events.push("model");
        return {
          responseBytes,
          executionAttestation: attestation(responseBytes),
        };
      }),
    };
    const finalizer = {
      finalize: jest.fn(async () => {
        events.push("finalize-commit");
        return publication;
      }),
    };
    await expect(new ReaderSummaryDailyCanonicalRecoveryV4Executor({
      authority,
      runtime,
      finalizer,
      now: () => new Date("2026-08-02T23:45:00.000Z"),
    }).runOne(input())).resolves.toMatchObject({ kind: "completed", publication });
    expect(events).toEqual([
      "claim-pre-model-consumed",
      "running",
      "renew:RESERVED",
      "model",
      "complete",
      "renew:COMPLETED",
      "finalize-commit",
      "read-after-commit",
    ]);
    expect(runtime.run).toHaveBeenCalledTimes(1);
  });
  it("uses the refreshed fenced lease for completion after renewal", async () => {
    const responseBytes = canonicalJsonBytes(validOutput());
    const claimed = work();
    const refreshed = {
      ...claimed,
      leaseExpiresAt: "2026-08-03T00:20:00.000Z",
    };
    let renewCallback: (() => void) | undefined;
    const authority = {
      claim: jest.fn(async () => ({ kind: "claimed" as const, work: claimed })),
      markRunning: jest.fn(async () => undefined),
      renew: jest.fn(async (active: CanonicalRecoveryWork) => ({
        ...active,
        leaseExpiresAt: refreshed.leaseExpiresAt,
      })),
      complete: jest.fn(async (active: CanonicalRecoveryWork) => ({
        ...active,
        state: "COMPLETED" as const,
        completedAt: "2026-08-02T23:46:00.000Z",
        responseBytes,
        receiptBytes: Buffer.from("receipt"),
      })),
      readFinalized: jest.fn(async () => [published()]),
      terminalizeUnavailable: jest.fn(async () => unavailableTerminal()),
      readUnavailable: jest.fn(async () => unavailableTerminal()),
      readTerminals: jest.fn(),
    };
    const finalizer = { finalize: jest.fn(async () => published()) };
    const executor = new ReaderSummaryDailyCanonicalRecoveryV4Executor({
      authority,
      runtime: {
        runtimeEngine: "subscription-runtime-cli" as const,
        run: jest.fn(async () => {
          renewCallback?.();
          await Promise.resolve();
          return { responseBytes, executionAttestation: attestation(responseBytes) };
        }),
      },
      finalizer,
      now: () => new Date("2026-08-02T23:45:00.000Z"),
      schedule: (callback) => {
        renewCallback = callback;
        return { stop: jest.fn() };
      },
    });
    await expect(executor.runOne(input())).resolves.toMatchObject({ kind: "completed" });
    expect(authority.renew).toHaveBeenCalledWith(claimed, "2026-08-02T23:45:00.000Z");
    expect(authority.renew).toHaveBeenCalledWith(
      expect.objectContaining({ state: "COMPLETED" }),
      "2026-08-02T23:45:00.000Z",
    );
    expect(authority.complete).toHaveBeenCalledWith(
      expect.objectContaining({ leaseExpiresAt: "2026-08-03T00:20:00.000Z" }),
      expect.any(Object),
    );
    expect(finalizer.finalize).toHaveBeenCalledWith(expect.objectContaining({
      work: expect.objectContaining({
        state: "COMPLETED",
        leaseExpiresAt: "2026-08-03T00:20:00.000Z",
      }),
    }));
  });
  it("does not call the model when the source authority hash has changed", async () => {
    const corrupted = work({ sourceAuthoritySha256: "b".repeat(64) });
    const runtime = { runtimeEngine: "subscription-runtime-cli" as const, run: jest.fn() };
    const authority = {
      claim: jest.fn(async () => ({ kind: "claimed" as const, work: corrupted })),
      markRunning: jest.fn(),
      renew: jest.fn(async (claimed: CanonicalRecoveryWork) => claimed),
      complete: jest.fn(),
      readFinalized: jest.fn(),
      terminalizeUnavailable: jest.fn(async () => unavailableTerminal()),
      readUnavailable: jest.fn(async () => unavailableTerminal()),
      readTerminals: jest.fn(),
    };
    await expect(new ReaderSummaryDailyCanonicalRecoveryV4Executor({
      authority,
      runtime,
      finalizer: { finalize: jest.fn() },
      now: () => new Date("2026-08-02T23:45:00.000Z"),
    }).runOne(input())).rejects.toThrow(/SHA-256 diverged/u);
    expect(authority.markRunning).not.toHaveBeenCalled();
    expect(runtime.run).not.toHaveBeenCalled();
  });
  it("fails closed without terminalizing a renewal failure before the model", async () => {
    const claimed = work();
    const runtime = { runtimeEngine: "subscription-runtime-cli" as const, run: jest.fn() };
    const finalizer = { finalize: jest.fn() };
    const authority = {
      claim: jest.fn(async () => ({ kind: "claimed" as const, work: claimed })),
      markRunning: jest.fn(async () => undefined),
      renew: jest.fn(async () => { throw new Error("renewal failed"); }),
      complete: jest.fn(),
      readFinalized: jest.fn(),
      terminalizeUnavailable: jest.fn(async () => unavailableTerminal()),
      readUnavailable: jest.fn(async () => unavailableTerminal()),
      readTerminals: jest.fn(),
    };
    await expect(new ReaderSummaryDailyCanonicalRecoveryV4Executor({
      authority,
      runtime,
      finalizer,
      now: () => new Date("2026-08-02T23:45:00.000Z"),
    }).runOne(input())).rejects.toThrow("renewal failed");
    expect(runtime.run).not.toHaveBeenCalled();
    expect(authority.terminalizeUnavailable).not.toHaveBeenCalled();
    expect(finalizer.finalize).not.toHaveBeenCalled();
  });
  it.each([
    ["terminalizes", 0],
    ["rejects a forged signal count from", 1],
  ] as const)("%s a typed invalid runtime result", async (_case, signalCountDelta) => {
    const claimed = work({ requestedUtcDate: "2026-07-24" });
    const runtime = {
      runtimeEngine: "subscription-runtime-cli" as const,
      run: jest.fn(async () => {
        throw new DailyCanonicalRecoveryRuntimeFailureError(false);
      }),
    };
    const authority = {
      claim: jest
        .fn()
        .mockResolvedValueOnce({ kind: "claimed" as const, work: claimed })
        .mockResolvedValueOnce({ kind: "leased" as const, requestedUtcDate: "2026-07-25" }),
      markRunning: jest.fn(async () => undefined),
      renew: jest.fn(async (claimed: CanonicalRecoveryWork) => claimed),
      complete: jest.fn(),
      readFinalized: jest.fn(),
      terminalizeUnavailable: jest.fn(async (active: CanonicalRecoveryWork) => ({
        ...unavailableFor(active),
        signalCount: canonicalRecoverySignalCount(active.sourceAuthorityBytes) + signalCountDelta,
      })),
      readUnavailable: jest.fn(),
      readTerminals: jest.fn(),
    };
    const executor = new ReaderSummaryDailyCanonicalRecoveryV4Executor({
      authority,
      runtime,
      finalizer: { finalize: jest.fn() },
      now: () => new Date("2026-08-02T23:45:00.000Z"),
    });
    const first = executor.runOne(input());
    if (signalCountDelta !== 0) {
      await expect(first).rejects.toThrow(/fenced work binding/u);
      expect(runtime.run).toHaveBeenCalledTimes(1);
      expect(authority.terminalizeUnavailable).toHaveBeenCalledTimes(1);
      expect(authority.complete).not.toHaveBeenCalled();
      return;
    }
    await expect(first).rejects.toMatchObject({
      name: "DailyCanonicalRecoveryRuntimeFailureError",
      terminalized: true,
    });
    await expect(executor.runAll(input())).resolves.toEqual({
      kind: "leased",
      requestedUtcDate: "2026-07-25",
    });
    expect(runtime.run).toHaveBeenCalledTimes(1);
    expect(authority.terminalizeUnavailable).toHaveBeenCalledTimes(1);
    expect(authority.complete).not.toHaveBeenCalled();
  });
  it("reconciles the known expired Jul24 terminal with zero model calls", async () => {
    const expired = work({ requestedUtcDate: "2026-07-24" });
    const authority = {
      claim: jest.fn()
        .mockResolvedValueOnce({ kind: "failed_ambiguous" as const,
          requestedUtcDate: expired.requestedUtcDate,
          modelJobIdentity: expired.modelJobIdentity,
          sourceAuthoritySha256: expired.sourceAuthoritySha256,
          attemptOrdinal: 1 })
        .mockResolvedValueOnce({ kind: "leased" as const, requestedUtcDate: "2026-07-25" }),
      markRunning: jest.fn(), renew: jest.fn(), complete: jest.fn(),
      terminalizeUnavailable: jest.fn(), readUnavailable: jest.fn(),
      reconcileExpiredUnavailable: jest.fn(async () => unavailableFor(expired)),
      readFinalized: jest.fn(), readTerminals: jest.fn(),
    };
    const runtime = { runtimeEngine: "subscription-runtime-cli" as const, run: jest.fn() };
    await expect(new ReaderSummaryDailyCanonicalRecoveryV4Executor({
      authority, runtime, finalizer: { finalize: jest.fn() },
      now: () => new Date("2026-08-02T23:45:00.000Z"),
    }).runAll(input())).resolves.toEqual({ kind: "leased", requestedUtcDate: "2026-07-25" });
    expect(runtime.run).not.toHaveBeenCalled();
    expect(authority.reconcileExpiredUnavailable).toHaveBeenCalledTimes(1);
    expect(authority.reconcileExpiredUnavailable).toHaveBeenCalledWith(expect.objectContaining({
      attemptOrdinal: 1,
    }));
  });
  it.each([
    ["transport", new DailyCanonicalRecoveryRuntimeTransportError(), "runtime_transport_failure"],
    ["abort", new DailyCanonicalRecoveryRuntimeAbortedError(), "runtime_aborted"],
    ["pre-result ambiguity", new Error("pre-result ambiguity"), undefined],
  ] as const)("does not terminalize %s", async (_label, failure, code) => {
    const authority = {
      claim: jest.fn(async () => ({ kind: "claimed" as const, work: work() })),
      markRunning: jest.fn(), renew: jest.fn(async (current: CanonicalRecoveryWork) => current),
      complete: jest.fn(), terminalizeUnavailable: jest.fn(), readUnavailable: jest.fn(),
      readFinalized: jest.fn(), readTerminals: jest.fn(),
    };
    await expect(new ReaderSummaryDailyCanonicalRecoveryV4Executor({
      authority,
      runtime: { runtimeEngine: "subscription-runtime-cli" as const,
        run: jest.fn(async () => { throw failure; }) },
      finalizer: { finalize: jest.fn() }, now: () => new Date("2026-08-02T23:45:00.000Z"),
    }).runAll(input())).rejects.toMatchObject(
      code === undefined ? { message: "pre-result ambiguity" } : { code },
    );
    expect(authority.terminalizeUnavailable).not.toHaveBeenCalled();
  });
  it("does no model, finalization, or filesystem-facing work on a finalized replay", async () => {
    const runtime = { runtimeEngine: "subscription-runtime-cli" as const, run: jest.fn() };
    const finalizer = { finalize: jest.fn() };
    const terminalPublications = allPublications();
    const authority = {
      claim: jest.fn(async () => ({ kind: "caught_up" as const })),
      markRunning: jest.fn(),
      renew: jest.fn(),
      complete: jest.fn(),
      readFinalized: jest.fn(async () => [published()]),
      terminalizeUnavailable: jest.fn(async () => unavailableTerminal()),
      readUnavailable: jest.fn(async () => unavailableTerminal()),
      readTerminals: jest.fn(async () => terminalOutcomes({
        publications: terminalPublications,
      })),
    };
    await expect(new ReaderSummaryDailyCanonicalRecoveryV4Executor({
      authority,
      runtime,
      finalizer,
      now: () => new Date("2026-08-02T23:45:00.000Z"),
    }).runOne(input())).resolves.toEqual({
      kind: "caught_up",
      publications: terminalPublications,
      unavailable: [],
    });
    expect(runtime.run).not.toHaveBeenCalled();
    expect(finalizer.finalize).not.toHaveBeenCalled();
    expect(authority.markRunning).not.toHaveBeenCalled();
    expect(authority.complete).not.toHaveBeenCalled();
    expect(authority.readTerminals).toHaveBeenCalledTimes(1);
  });
  it("converges after a committed finalization loses its client acknowledgement", async () => {
    const directory = mkdtempSync(join(tmpdir(), "daily-finalization-ack-loss-"));
    const publicEvidencePath = join(
      directory,
      "durable-reader-summary-2026-07-23.v1.json",
    );
    const evidenceBytes = Buffer.from("immutable public evidence");
    const publication = published();
    const terminalPublications = allPublications();
    const responseBytes = canonicalJsonBytes(validOutput());
    let committed = false;
    const runtime = {
      runtimeEngine: "subscription-runtime-cli" as const,
      run: jest.fn(async () => ({
        responseBytes,
        executionAttestation: attestation(responseBytes),
      })),
    };
    const finalizer = {
      finalize: jest.fn(async () => {
        writeFileSync(publicEvidencePath, evidenceBytes);
        // Failpoint: the FINALIZED transaction committed, then its client lost
        // the acknowledgement before the executor could read it back.
        committed = true;
        throw new Error("finalization acknowledgement lost after commit");
      }),
    };
    const authority = {
      claim: jest.fn(async () => committed
        ? { kind: "caught_up" as const }
        : { kind: "claimed" as const, work: work() }),
      markRunning: jest.fn(async () => undefined),
      renew: jest.fn(async (claimed: CanonicalRecoveryWork) => claimed),
      complete: jest.fn(async (claimed: CanonicalRecoveryWork) => ({
        ...claimed,
        state: "COMPLETED" as const,
        completedAt: "2026-08-02T23:45:00.000Z",
        responseBytes,
        receiptBytes: Buffer.from("receipt"),
      })),
      readFinalized: jest.fn(async () => [publication]),
      terminalizeUnavailable: jest.fn(async () => unavailableTerminal()),
      readUnavailable: jest.fn(async () => unavailableTerminal()),
      readTerminals: jest.fn(async () => terminalOutcomes({
        publications: terminalPublications,
      })),
    };
    const executor = new ReaderSummaryDailyCanonicalRecoveryV4Executor({
      authority,
      runtime,
      finalizer,
      now: () => new Date("2026-08-02T23:45:00.000Z"),
    });
    try {
      await expect(executor.runOne(input())).rejects.toThrow(
        "finalization acknowledgement lost after commit",
      );
      await expect(executor.runOne(input())).resolves.toEqual({
        kind: "caught_up",
        publications: terminalPublications,
        unavailable: [],
      });
      expect(readFileSync(publicEvidencePath)).toEqual(evidenceBytes);
      expect(runtime.run).toHaveBeenCalledTimes(1);
      expect(finalizer.finalize).toHaveBeenCalledTimes(1);
      expect(authority.readTerminals).toHaveBeenCalledTimes(1);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it("finishes a completed crash replay without a second model call", async () => {
    const publication = published();
    const responseBytes = canonicalJsonBytes(validOutput());
    const completed = {
      ...work(),
      state: "COMPLETED" as const,
      completedAt: "2026-08-02T23:45:00.000Z",
      responseBytes,
      receiptBytes: Buffer.from("receipt"),
    };
    const runtime = { runtimeEngine: "subscription-runtime-cli" as const, run: jest.fn() };
    const finalizer = { finalize: jest.fn(async () => publication) };
    const authority = {
      claim: jest.fn(async () => ({ kind: "claimed" as const, work: completed })),
      markRunning: jest.fn(),
      renew: jest.fn(async (claimed: CanonicalRecoveryWork) => claimed),
      complete: jest.fn(),
      readFinalized: jest.fn(async () => [publication]),
      terminalizeUnavailable: jest.fn(async () => unavailableTerminal()),
      readUnavailable: jest.fn(async () => unavailableTerminal()),
      readTerminals: jest.fn(),
    };
    await expect(new ReaderSummaryDailyCanonicalRecoveryV4Executor({
      authority,
      runtime,
      finalizer,
      now: () => new Date("2026-08-02T23:45:00.000Z"),
    }).runOne(input())).resolves.toEqual({ kind: "replayed", publication });
    expect(runtime.run).not.toHaveBeenCalled();
    expect(authority.complete).not.toHaveBeenCalled();
    expect(finalizer.finalize).toHaveBeenCalledTimes(1);
  });
  it("drains only the eight canonical dates in deterministic order", async () => {
    const dates = [...canonicalRecoveryDates];
  const publications = dates.map((requestedUtcDate) => ({
      ...published(requestedUtcDate),
    }));
  let index = 0;
  const finalizedDates: CanonicalRecoveryWork["requestedUtcDate"][] = [];
  const responseBytes = canonicalJsonBytes(validOutput());
    const executor = new ReaderSummaryDailyCanonicalRecoveryV4Executor({
      authority: {
        claim: jest.fn(async () => index === dates.length
          ? { kind: "caught_up" as const }
          : { kind: "claimed" as const, work: work({
            requestedUtcDate: dates[index]!,
          }) }),
        markRunning: jest.fn(async () => undefined),
        renew: jest.fn(async (claimed: CanonicalRecoveryWork) => claimed),
        complete: jest.fn(async (claimed) => ({
          ...claimed,
          state: "COMPLETED" as const,
          completedAt: "2026-08-02T23:45:00.000Z",
          responseBytes,
          receiptBytes: Buffer.from("receipt"),
        })),
        readFinalized: jest.fn(async () => publications),
        terminalizeUnavailable: jest.fn(async () => unavailableTerminal()),
        readUnavailable: jest.fn(async () => unavailableTerminal()),
        readTerminals: jest.fn(async () => terminalOutcomes({ publications })),
      },
      runtime: {
        runtimeEngine: "subscription-runtime-cli" as const,
        run: jest.fn(async () => ({
          responseBytes,
          executionAttestation: attestation(responseBytes),
        })),
      },
      finalizer: {
        finalize: jest.fn(async ({ work: finalizedWork }: {
          work: CanonicalRecoveryWork;
        }) => {
          finalizedDates.push(finalizedWork.requestedUtcDate);
          return publications[index++]!;
        }),
      },
      now: () => new Date("2026-08-02T23:45:00.000Z"),
    });
    await expect(executor.runAll(input())).resolves.toEqual({
      kind: "caught_up",
      publications,
      unavailable: [],
    });
    expect(publications.map((entry) => entry.requestedUtcDate)).toEqual(dates);
    expect(finalizedDates).toEqual(dates);
  });
  it("records the terminal Jul23 unavailable outcome, calls only Jul24-Jul30, and replays with zero writes", async () => {
    const dates = [...canonicalRecoveryDates];
    const publications = dates.slice(1).map((requestedUtcDate) =>
      published(requestedUtcDate));
    const unavailable = unavailableTerminal();
    const responseBytes = canonicalJsonBytes(validOutput());
    const claimedDates: CanonicalRecoveryWork["requestedUtcDate"][] = [];
    let firstClaim = true;
    const authority = {
      claim: jest.fn(async () => {
        if (firstClaim) {
          firstClaim = false;
          return {
            kind: "failed_ambiguous" as const,
            requestedUtcDate: unavailable.requestedUtcDate,
            modelJobIdentity: unavailable.modelJobIdentity,
            sourceAuthoritySha256: unavailable.sourceAuthoritySha256,
            attemptOrdinal: unavailable.attemptOrdinal,
          };
        }
        const requestedUtcDate = dates.slice(1)[claimedDates.length];
        return requestedUtcDate === undefined
          ? { kind: "caught_up" as const }
          : { kind: "claimed" as const, work: work({ requestedUtcDate }) };
      }),
      markRunning: jest.fn(async () => undefined),
      renew: jest.fn(async (claimed: CanonicalRecoveryWork) => claimed),
      complete: jest.fn(async (claimed: CanonicalRecoveryWork) => ({
        ...claimed,
        state: "COMPLETED" as const,
        completedAt: "2026-08-02T23:45:00.000Z",
        responseBytes,
        receiptBytes: Buffer.from("receipt"),
      })),
      readFinalized: jest.fn(async () => publications),
      terminalizeUnavailable: jest.fn(async () => unavailable),
      readUnavailable: jest.fn(async () => unavailable),
      readTerminals: jest.fn(async () => terminalOutcomes({
        publications,
        unavailable: [unavailable],
      })),
    };
    const runtime = {
      runtimeEngine: "subscription-runtime-cli" as const,
      run: jest.fn(async () => ({
        responseBytes,
        executionAttestation: attestation(responseBytes),
      })),
    };
    const finalizer = {
      finalize: jest.fn(async ({ work: finalizedWork }: {
        work: CanonicalRecoveryWork;
      }) => {
        claimedDates.push(finalizedWork.requestedUtcDate);
        const publication = publications.find(
          (entry) => entry.requestedUtcDate === finalizedWork.requestedUtcDate,
        );
        if (publication === undefined) throw new Error("unexpected finalization date");
        return publication;
      }),
    };
    const executor = new ReaderSummaryDailyCanonicalRecoveryV4Executor({
      authority,
      runtime,
      finalizer,
      now: () => new Date("2026-08-02T23:45:00.000Z"),
    });
    const first = await executor.runAll(input());
    const writesAfterFirst = {
      runtime: runtime.run.mock.calls.length,
      markRunning: authority.markRunning.mock.calls.length,
      renew: authority.renew.mock.calls.length,
      complete: authority.complete.mock.calls.length,
      finalize: finalizer.finalize.mock.calls.length,
    };
    expect(first).toEqual({
      kind: "caught_up",
      publications,
      unavailable: [unavailable],
    });
    expect(authority.claim).toHaveBeenCalledTimes(9);
    const replay = await executor.runAll(input());
    expect(replay).toEqual(first);
    expect(authority.claim).toHaveBeenCalledTimes(10);
    expect(claimedDates).toEqual(dates.slice(1));
    expect(runtime.run).toHaveBeenCalledTimes(7);
    expect(authority.markRunning).toHaveBeenCalledTimes(7);
    expect(authority.complete).toHaveBeenCalledTimes(7);
    expect(finalizer.finalize).toHaveBeenCalledTimes(7);
    expect({
      runtime: runtime.run.mock.calls.length,
      markRunning: authority.markRunning.mock.calls.length,
      renew: authority.renew.mock.calls.length,
      complete: authority.complete.mock.calls.length,
      finalize: finalizer.finalize.mock.calls.length,
    }).toEqual(writesAfterFirst);
  });
  it.each([
    {
      requestedUtcDate: "2026-07-24",
      modelJobIdentity: canonicalRecoveryAmbiguityRetryModelJobIdentity,
      sourceAuthoritySha256:
        canonicalRecoveryAmbiguityRetrySourceAuthoritySha256,
      attemptOrdinal: 1,
    },
    {
      requestedUtcDate: "2026-07-23",
      modelJobIdentity: "b".repeat(64),
      sourceAuthoritySha256:
        canonicalRecoveryAmbiguityRetrySourceAuthoritySha256,
      attemptOrdinal: 2,
    },
    {
      requestedUtcDate: "2026-07-23",
      modelJobIdentity: canonicalRecoveryAmbiguityRetryModelJobIdentity,
      sourceAuthoritySha256: "a".repeat(64),
      attemptOrdinal: 2,
    },
    {
      requestedUtcDate: "2026-07-23",
      modelJobIdentity: "not-a-sha",
      sourceAuthoritySha256: "a".repeat(64),
      attemptOrdinal: 2,
    },
  ] as const)("fails closed for noncanonical ambiguity %o", async (ambiguity) => {
    const authority = {
      claim: jest.fn(async () => ({ kind: "failed_ambiguous" as const, ...ambiguity })),
      markRunning: jest.fn(),
      renew: jest.fn(),
      complete: jest.fn(),
      readFinalized: jest.fn(),
      terminalizeUnavailable: jest.fn(async () => unavailableTerminal()),
      readUnavailable: jest.fn(async () => unavailableTerminal()),
      readTerminals: jest.fn(),
    };
    const runtime = { runtimeEngine: "subscription-runtime-cli" as const, run: jest.fn() };
    const finalizer = { finalize: jest.fn() };
    await expect(new ReaderSummaryDailyCanonicalRecoveryV4Executor({
      authority,
      runtime,
      finalizer,
      now: () => new Date("2026-08-02T23:45:00.000Z"),
    }).runAll(input())).rejects.toThrow(/not an unavailable terminal/u);
    expect(runtime.run).not.toHaveBeenCalled();
    expect(authority.markRunning).not.toHaveBeenCalled();
    expect(authority.complete).not.toHaveBeenCalled();
    expect(finalizer.finalize).not.toHaveBeenCalled();
  });
});
const input = () => ({
  tenantId: "00000000-0000-7000-8000-000000000901",
  workspaceId: "00000000-0000-7000-8000-000000000902",
  workerId: "worker",
});
const authorityBytes = (
  requestedUtcDate: CanonicalRecoveryWork["requestedUtcDate"] = "2026-07-23",
) => {
  const nextDate = nextUtcDate(requestedUtcDate);
  const rss = {
    feedItemId: "30000000-0000-4000-8000-000000000003",
    sourceItemId: "40000000-0000-4000-8000-000000000004",
    sourceBindingId: "50000000-0000-4000-8000-000000000005",
    interestId: "60000000-0000-4000-8000-000000000006",
    providerKey: "rss",
    canonicalUrl: "https://example.test/one",
    title: "Frozen title",
    bodyPreview: "Frozen body",
    authorHandle: null,
    publishedAt: `${requestedUtcDate}T12:00:00.000Z`,
    observedAt: `${requestedUtcDate}T12:01:00.000Z`,
    contentHash: "a".repeat(64),
    providerContentHash: null,
  };
  const github = Array.from({ length: 10 }, (_, index) => {
    const rank = index + 1;
    const suffix = String(rank).padStart(12, "0");
    const second = String(rank).padStart(2, "0");
    return {
      feedItemId: `31000000-0000-4000-8000-${suffix}`,
      sourceItemId: `41000000-0000-4000-8000-${suffix}`,
      sourceBindingId: "51000000-0000-4000-8000-000000000005",
      interestId: "61000000-0000-4000-8000-000000000006",
      providerKey: "github-trending-page",
      canonicalUrl: `https://github.com/example/frozen-${rank}`,
      title: `Frozen GitHub title ${rank}`,
      bodyPreview: `Frozen GitHub body ${rank}`,
      authorHandle: null,
      publishedAt: `${requestedUtcDate}T12:00:${second}.000Z`,
      observedAt: `${requestedUtcDate}T12:01:${second}.000Z`,
      contentHash: sha256(Buffer.from(`github-content:${rank}`, "utf8")),
      providerContentHash: sha256(Buffer.from(`github-provider:${rank}`, "utf8")),
    };
  });
  const historicalOmission = ["2026-07-23", "2026-07-28", "2026-07-29", "2026-07-30"]
    .includes(requestedUtcDate);
  return canonicalJsonBytes({
    schemaVersion: 2,
    tenantId: input().tenantId,
    workspaceId: input().workspaceId,
    requestedUtcDate,
    ingestionCutoff: `${nextDate}T00:00:00.000Z`,
    items: historicalOmission ? [rss] : [...github, rss],
    githubProjection: historicalOmission
      ? {
          mode: "historical_omission",
          reason: readerSummaryDailyCanonicalHistoricalGithubOmissionReason,
          authorizedAt: `${nextDate}T00:00:00.000Z`,
        }
      : {
          mode: "checked_at_collection_anchor",
          unavailableField: "fetchStartedAt",
          anchorField: "checkedAtCollectionAnchor",
          allowedRequestedUtcDates: [
            "2026-07-24", "2026-07-25", "2026-07-26", "2026-07-27", "2026-07-29",
          ],
          eligibleBindingIds: [github[0]!.sourceBindingId],
          items: github.map((item, index) => ({
            feedItemId: item.feedItemId,
            sourceItemId: item.sourceItemId,
            sourceBindingId: item.sourceBindingId,
            providerKey: "github-trending-page",
            canonicalUrl: item.canonicalUrl,
            publishedAt: item.publishedAt,
            observedAt: item.observedAt,
            sourceContentHash: item.contentHash,
            sourceProviderContentHash: item.providerContentHash,
            scanJobId: "71000000-0000-4000-8000-000000000007",
            repositoryFullName: `example/frozen-${index + 1}`,
            rank: index + 1,
            checkedAtCollectionAnchor: item.publishedAt,
          })),
          pageCount: 2,
        },
  });
};
const nextUtcDate = (date: string): string => {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
};
const work = (patch: Partial<CanonicalRecoveryWork> = {}): CanonicalRecoveryWork => {
  const requestedUtcDate = patch.requestedUtcDate ?? "2026-07-23";
  const bytes = authorityBytes(requestedUtcDate);
  return {
    tenantId: input().tenantId,
    workspaceId: input().workspaceId,
    requestedUtcDate,
    sourceAuthorityBytes: bytes,
    sourceAuthoritySha256: sha256(bytes),
    modelJobIdentity: "b".repeat(64),
    attemptOrdinal: 1,
    state: "RESERVED",
    workerId: input().workerId,
    fencingToken: 1n,
    leasedAt: "2026-08-02T23:40:00.000Z",
    leaseExpiresAt: "2026-08-03T00:00:00.000Z",
    absoluteExpiresAt: "2026-08-03T06:40:00.000Z",
    ...patch,
  };
};
const published = (
  requestedUtcDate: CanonicalRecoveryWork["requestedUtcDate"] = "2026-07-23",
): CanonicalRecoveryPublication => ({
  requestedUtcDate,
  sourceAuthoritySha256: sha256(authorityBytes(requestedUtcDate)),
  modelJobIdentity: "b".repeat(64),
  readerSummaryJobId: "30000000-0000-4000-8000-000000000003",
  readerSummaryArtifactId: "40000000-0000-4000-8000-000000000004",
  publicationId: "40000000-0000-4000-8000-000000000004",
  reportSha256: "c".repeat(64),
  proofSha256: "d".repeat(64),
  weeklyEvidenceSha256: "e".repeat(64),
  publicEvidenceSha256: "2".repeat(64),
  publicFrontendSha256: "3".repeat(64),
});
const allPublications = (): CanonicalRecoveryPublication[] =>
  canonicalRecoveryDates.map((requestedUtcDate) => published(requestedUtcDate));
const unavailableTerminal = (): CanonicalRecoveryUnavailable => ({
  requestedUtcDate: canonicalRecoveryAmbiguityRetryDate,
  reasonCode: canonicalRecoveryUnavailableReason,
  signalCount: 342,
  sourceAuthoritySha256:
    canonicalRecoveryAmbiguityRetrySourceAuthoritySha256,
  modelJobIdentity: canonicalRecoveryAmbiguityRetryModelJobIdentity,
  attemptOrdinal: 2,
});
const unavailableFor = (claimed: CanonicalRecoveryWork): CanonicalRecoveryUnavailable => ({
  requestedUtcDate: claimed.requestedUtcDate,
  reasonCode: canonicalRecoveryUnavailableReason,
  signalCount: canonicalRecoverySignalCount(claimed.sourceAuthorityBytes),
  sourceAuthoritySha256: claimed.sourceAuthoritySha256,
  modelJobIdentity: claimed.modelJobIdentity,
  attemptOrdinal: claimed.attemptOrdinal === 2 ? 2 : 1,
});
const terminalOutcomes = (input: Readonly<{
  publications: readonly CanonicalRecoveryPublication[];
  unavailable?: readonly CanonicalRecoveryUnavailable[];
}>): readonly CanonicalRecoveryTerminal[] => {
  const publications = new Map(
    input.publications.map((publication) => [publication.requestedUtcDate, publication]),
  );
  const unavailable = new Map(
    (input.unavailable ?? []).map((entry) => [entry.requestedUtcDate, entry]),
  );
  return canonicalRecoveryDates.map((requestedUtcDate) => {
    const publication = publications.get(requestedUtcDate);
    const unavailableEntry = unavailable.get(requestedUtcDate);
    if ((publication === undefined) === (unavailableEntry === undefined)) {
      throw new Error("terminal fixture must contain exactly one outcome per date");
    }
    return publication === undefined
      ? { kind: "unavailable" as const, unavailable: unavailableEntry! }
      : { kind: "finalized" as const, publication };
  });
};
const validOutput = () => ({
  headline: "Canonical day",
  executiveSummary: "Immutable evidence only.",
  narrativeSections: [],
  content: {
    headline: "Canonical day",
    oneLineTakeaway: "Immutable evidence only.",
    bullets: [],
    interestSections: [],
    sourceMix: [],
    topReads: [],
    claimBoard: [],
    reliabilityReport: {
      mode: "shadow",
      policyVersion: "reader_summary.reliability.v1",
      riskLevel: "low",
      riskScore: 0,
      risks: [],
    },
    trendDelta: {
      newSignals: [],
      growingSignals: [],
      repeatedSignals: [],
      fadingSignals: [],
    },
    openQuestions: [],
    risks: [],
    nextActions: [],
  },
  topStories: [],
  interestHighlights: [],
  repeatedSignals: [],
  risksAndUnknowns: [],
  citationMap: [],
  qualityFlags: ["no_signal"],
  confidence: {
    level: "low",
    score: 0,
    rationale: "No invented evidence.",
  },
  noSignalReason: "No immutable signal was selected.",
});
const attestation = (response: Buffer) => ({
  schemaVersion: 1,
  requestId: "recovery",
  purpose: "social_monitor.reader_summary.weekly.generate",
  canonicalRequestSha256: "f".repeat(64),
  provider: "codex",
  model: "gpt-5.6-sol",
  reasoningEffort: "xhigh",
  runtimeEngine: "subscription-runtime-cli",
  runtimePackageVersion: "1.2.3",
  launcherSha256: "1".repeat(64),
  selectedOutputKind: "output_text",
  selectedOutputSha256: sha256(response),
});
