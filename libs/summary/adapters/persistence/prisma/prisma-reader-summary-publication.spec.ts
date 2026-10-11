import {
  causationId,
  correlationId,
  eventId,
  tenantId,
  workspaceId,
} from "@social-monitor/shared-kernel";

import { ReaderSummaryJob, buildReaderSummaryPeriod } from "../../../domain";
import {
  evaluateGitHubProjection,
  githubBoardArtifact,
  githubProjectionInput,
} from "../../../domain/policies/reader-summary-github-projection-policy.spec-support";
import type { ReaderSummaryPublicationCommand } from "../../../ports";
import type { ReaderSummaryAuthorizedPublication } from "../../../ports";
import { runWithTenantDatabaseAccess } from "@social-monitor/platform-persistence";
import { guardRootClientDuringInteractiveTransaction } from "../../../../platform/persistence/src/postgres-runtime-pool-transaction-guard";
import { readerSummaryFirstPublicationPrefix } from "../../../application/contracts/reader-summary-first-publication-authority";
import { PrismaReaderSummaryPublication } from "./prisma-reader-summary-publication";
import type { PrismaReaderSummaryClient } from "./prisma-reader-summary-client";
import type { PrismaSummaryClient } from "./prisma-summary-client";

describe("PrismaReaderSummaryPublication", () => {
  it("commits DB-owned weekly authority without comparing caller report hashes", async () => {
    const command = publicationCommand();
    const authorizedPublication = {
      kind: "daily",
      command,
    } satisfies ReaderSummaryAuthorizedPublication;
    const artifactId = command.finalJob.toSnapshot().readerSummaryId!;
    let serializedRequest = "";
    const publicationQuery = jest.fn(
      async (_query: TemplateStringsArray, serialized: unknown) => {
        if (_query.join("").includes("set_config")) return [];
        serializedRequest = String(serialized);
        return [
          {
            outcome: "published",
            publication_id: artifactId,
            report_sha256: "c".repeat(64),
            proof_sha256: "d".repeat(64),
          },
        ];
      },
    );
    const transactionClient = Object.assign({} as PrismaReaderSummaryClient, {
      $queryRaw: publicationQuery,
    });
    const transaction = jest.fn(
      async (
        operation: (client: PrismaReaderSummaryClient) => Promise<unknown>,
      ) => operation(transactionClient),
    );
    const publication = new PrismaReaderSummaryPublication(
      prismaClient(transaction, publicationQuery),
    );

    await expect(
      publication.publish(authorizedPublication.command),
    ).resolves.toBe("published");

    expect(JSON.parse(serializedRequest)).toEqual({
      schemaVersion: "reader_summary.publication_command.v2",
      tenantId: command.finalJob.toSnapshot().tenantId,
      workspaceId: command.finalJob.toSnapshot().workspaceId,
      readerSummaryJobId: command.finalJob.toSnapshot().id,
      readerSummaryArtifactId: artifactId,
    });
    expect(serializedRequest).not.toContain(
      command.artifact.toSnapshot().headline,
    );
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 30_000,
      timeout: 300_000,
      isolationLevel: "Serializable",
    });
  });

  it("rolls back before publication when the transaction guard rejects", async () => {
    const command = publicationCommand();
    const publicationQuery = jest.fn();
    const transactionClient = Object.assign({} as PrismaReaderSummaryClient, {
      $queryRaw: publicationQuery,
    });
    const transaction = jest.fn(
      async (
        operation: (client: PrismaReaderSummaryClient) => Promise<unknown>,
      ) => operation(transactionClient),
    );
    const guard = jest.fn(async () => {
      throw new Error("Reader summary dataset changed at before_publication");
    });
    const publication = new PrismaReaderSummaryPublication(
      prismaClient(transaction, publicationQuery),
      guard,
    );

    await expect(publication.publish(command)).rejects.toThrow(
      "Reader summary dataset changed at before_publication",
    );
    expect(guard).toHaveBeenCalledWith(transactionClient, command);
    expect(publicationQuery).toHaveBeenCalledTimes(1);
    expect(publicationQuery.mock.calls[0]![0].join("")).toContain("set_config");
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 30_000,
      timeout: 300_000,
      isolationLevel: "Serializable",
    });
  });

  it("sets the server deadline before each guard and retries only the same publication", async () => {
    const command = publicationCommand();
    const calls: string[] = [];
    const requests: string[] = [];
    const query = jest.fn(async (sql: TemplateStringsArray, value: unknown) => {
      if (sql.join("").includes("set_config")) {
        calls.push("deadline");
        expect(value).toBe(300_000);
        expect(sql.join("")).toContain("true)");
        return [];
      }
      calls.push("publish");
      requests.push(String(value));
      if (requests.length === 1) throw {
        code: "P2010", meta: { driverAdapterError: { cause: { originalCode: "40001" } } },
      };
      return [{ outcome: "replayed", publication_id: command.artifact.toSnapshot().readerSummaryId,
        report_sha256: "c".repeat(64), proof_sha256: "d".repeat(64) }];
    });
    const transactionClient = Object.assign({} as PrismaReaderSummaryClient, { $queryRaw: query });
    const transaction = jest.fn(async (operation: (client: PrismaReaderSummaryClient) => Promise<unknown>) =>
      operation(transactionClient));
    const guard = jest.fn(async () => { calls.push("guard"); });
    const publication = new PrismaReaderSummaryPublication(prismaClient(transaction, query), guard);
    await expect(publication.publish(command)).resolves.toBe("replayed");
    expect(calls).toEqual(["deadline", "guard", "publish", "deadline", "guard", "publish"]);
    expect(requests[0]).toBe(requests[1]);
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it("fails before publication if the server deadline cannot be configured", async () => {
    const error = { code: "42501" };
    const query = jest.fn().mockRejectedValue(error);
    const guard = jest.fn();
    const transaction = jest.fn(async (operation: (client: PrismaReaderSummaryClient) => Promise<unknown>) =>
      operation(Object.assign({} as PrismaReaderSummaryClient, { $queryRaw: query })));
    await expect(new PrismaReaderSummaryPublication(prismaClient(transaction, query), guard)
      .publish(publicationCommand())).rejects.toBe(error);
    expect(guard).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(1);
    expect(transaction).toHaveBeenCalledTimes(1);
  });
  it("firstpub runs tenant middleware and deadline before its fresh-snapshot lock protocol", async () => {
    const command = publicationCommand(true);
    const calls: string[] = [];
    let isolation: string | undefined;
    const tx = {
      $executeRawUnsafe: async (sql: string) => { calls.push(sql.includes("social_monitor.tenant_id") ? "tenant-context" : sql); return 0; },
      $queryRaw: async (query: TemplateStringsArray) => {
        const sql = query.join("");
        if (sql.includes("set_config")) { calls.push("deadline"); return []; }
        if (sql.includes("lock_reader_summary_first_publication_dataset")) {
          calls.push("dataset-lock");
          if (isolation !== "ReadCommitted") throw new Error("snapshot pinned before dataset lock");
          return [{ locked: true }];
        }
        calls.push("publication");
        return [{ outcome: "published", publication_id: command.finalJob.toSnapshot().readerSummaryId,
          report_sha256: "c".repeat(64), proof_sha256: "d".repeat(64) }];
      },
    };
    const raw = { $transaction: async (operation: (client: PrismaReaderSummaryClient) => Promise<unknown>,
      options: { isolationLevel: string; timeout: number }) => {
      isolation = options.isolationLevel;
      expect(options.timeout).toBe(300_000);
      return operation(tx as unknown as PrismaReaderSummaryClient);
    } };
    const client = guardRootClientDuringInteractiveTransaction(raw) as unknown as PrismaSummaryClient;
    const guard = async (transaction: PrismaReaderSummaryClient) => {
      await transaction.$queryRaw`select public.lock_reader_summary_first_publication_dataset()`;
    };
    const snapshot = command.finalJob.toSnapshot();
    await expect(runWithTenantDatabaseAccess(snapshot, () => new PrismaReaderSummaryPublication(
      client, guard, "first_publication_sep29").publish(command))).resolves.toBe("published");
    expect(calls).toEqual(["tenant-context", "deadline", "dataset-lock", "publication"]);
  });

  it("refuses opt-in for an ordinary route or without a transaction guard", async () => {
    const tx = jest.fn();
    const client = prismaClient(tx, jest.fn());
    await expect(new PrismaReaderSummaryPublication(client, async () => undefined, "first_publication_sep29")
      .publish(publicationCommand())).rejects.toThrow("guarded Sep29");
    await expect(new PrismaReaderSummaryPublication(client, undefined, "first_publication_sep29")
      .publish(publicationCommand(true))).rejects.toThrow("guarded Sep29");
    expect(tx).not.toHaveBeenCalled();
  });

});

const prismaClient = (
  transaction: jest.Mock,
  queryRaw: jest.Mock,
): PrismaSummaryClient =>
  Object.assign({} as PrismaSummaryClient, {
    $transaction: transaction,
    $queryRaw: queryRaw,
  });

const publicationCommand = (firstpub = false): ReaderSummaryPublicationCommand => {
  const artifact = githubBoardArtifact();
  const snapshot = artifact.toSnapshot();
  const jobId = "reader-summary-publication-prisma-job";
  const completedAt = new Date("2026-07-10T13:00:00.000Z");
  const finalJob = ReaderSummaryJob.rehydrate({
    id: jobId,
    tenantId: firstpub ? tenantId("33333333-3333-4333-8333-333333333333") : snapshot.tenantId,
    workspaceId: firstpub ? workspaceId("44444444-4444-4444-8444-444444444444") : snapshot.workspaceId,
    scope: snapshot.scope,
    period: firstpub ? buildReaderSummaryPeriod({ cadence: "daily", timezone: "UTC",
      startedAt: new Date("2026-09-29T00:00:00.000Z"), endedAt: new Date("2026-09-30T00:00:00.000Z") }) : snapshot.period,
    status: "completed",
    idempotencyKey: firstpub ? `${readerSummaryFirstPublicationPrefix}44444444-4444-4444-8444-444444444444:2026-09-29` : "reader-summary-publication-prisma",
    requestedAt: new Date("2026-07-10T10:00:00.000Z"),
    startedAt: new Date("2026-07-10T10:00:00.000Z"),
    completedAt,
    readerSummaryId: snapshot.readerSummaryId,
  });
  const githubProjectionAudit = evaluateGitHubProjection(
    artifact,
    githubProjectionInput(),
  ).audit;
  return {
    artifact,
    finalJob,
    publicationDecision: {
      status: "published",
      qualityPassed: true,
      canonicalScore: 1,
      shadow: {
        mode: "shadow",
        policyVersion: "reader_summary_publication_shadow_v1",
        riskScore: 0,
        signals: [],
      },
      reasons: [],
    },
    githubProjectionAudit,
    readyEvent: {
      eventId: eventId("reader-summary-publication-prisma-event"),
      eventType: "reader_summary.ready",
      schemaVersion: 1,
      occurredAt: completedAt,
      tenantId: snapshot.tenantId,
      workspaceId: snapshot.workspaceId,
      correlationId: correlationId(jobId),
      causationId: causationId(jobId),
      payload: {
        readerSummaryJobId: jobId,
        readerSummaryId: snapshot.readerSummaryId,
        tenantId: snapshot.tenantId,
        workspaceId: snapshot.workspaceId,
        scope: snapshot.scope,
        period: snapshot.period,
        status: "completed",
      },
    },
  };
};
