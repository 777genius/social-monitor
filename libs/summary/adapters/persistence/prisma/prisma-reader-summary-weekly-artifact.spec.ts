import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import type { ReaderSummaryWeeklyPublicationAuthorization } from "../../../domain/policies/reader-summary-weekly-publication-authorization";
import { canonicalizeReaderSummaryWeeklyJson } from "../../../domain/value-objects/reader-summary-weekly-canonical-json";
import * as weeklyPayload from "../reader-summary-weekly-publication-payload";
import { PrismaReaderSummaryArtifactRepository } from "./prisma-reader-summary-artifact.repository";
import {
  readerSummaryWeeklyFromPrisma,
  type PrismaReaderSummaryWeeklyPublicationRecord,
} from "./prisma-reader-summary-weekly-artifact";
import type { PrismaSummaryClient } from "./prisma-summary-client";

describe("PrismaReaderSummaryArtifactRepository weekly persistence", () => {
  it("uses a retryable SERIALIZABLE DB function and accepts exact replay", async () => {
    const payload = persistencePayload();
    const builder = jest
      .spyOn(weeklyPayload, "buildReaderSummaryWeeklyPublicationPersistencePayload")
      .mockReturnValue(payload);
    const prisma = new AtomicWeeklyPrisma([
      sqlRow(payload, "persisted"),
      sqlRow(payload, "replayed"),
    ]);
    const repository = new PrismaReaderSummaryArtifactRepository(prisma.client);

    try {
      await repository.saveWeekly(command);
      await repository.saveWeekly(command);

      expect(prisma.requests).toEqual([payload, payload]);
      expect(prisma.transactionOptions).toEqual([
        { isolationLevel: "Serializable" },
        { isolationLevel: "Serializable" },
      ]);
    } finally {
      builder.mockRestore();
    }
  });

  it("fails closed when PostgreSQL returns another identity or proof", async () => {
    const payload = persistencePayload();
    const builder = jest
      .spyOn(weeklyPayload, "buildReaderSummaryWeeklyPublicationPersistencePayload")
      .mockReturnValue(payload);
    const prisma = new AtomicWeeklyPrisma([
      {
        ...sqlRow(payload, "persisted"),
        proof_sha256: "f".repeat(64),
      },
    ]);

    try {
      await expect(
        new PrismaReaderSummaryArtifactRepository(prisma.client).saveWeekly(
          command,
        ),
      ).rejects.toThrow("mismatched proof");
    } finally {
      builder.mockRestore();
    }
  });

  it("propagates a DB divergence without attempting an adapter-side write", async () => {
    const payload = persistencePayload();
    const builder = jest
      .spyOn(weeklyPayload, "buildReaderSummaryWeeklyPublicationPersistencePayload")
      .mockReturnValue(payload);
    const conflict = new Error(
      "weekly artifact persistence replay diverged from immutable sealId or sealSha",
    );
    const prisma = new AtomicWeeklyPrisma([conflict]);

    try {
      await expect(
        new PrismaReaderSummaryArtifactRepository(prisma.client).saveWeekly(
          command,
        ),
      ).rejects.toBe(conflict);
      expect(prisma.requests).toEqual([payload]);
    } finally {
      builder.mockRestore();
    }
  });

  it("scopes a missing weekly read by tenant, workspace, and artifact", async () => {
    const values: unknown[] = [];
    const client = {
      $queryRaw: async (
        _strings: TemplateStringsArray,
        ...parameters: readonly unknown[]
      ) => {
        values.push(...parameters);
        return [];
      },
    } as unknown as PrismaSummaryClient;
    const repository = new PrismaReaderSummaryArtifactRepository(client);

    await expect(
      repository.findWeeklyById({
        tenantId: tenantId(tenant),
        workspaceId: workspaceId(workspace),
        artifactId: command.artifactId,
      }),
    ).resolves.toBeNull();
    expect(values).toEqual([tenant, workspace, command.artifactId]);
  });
});

describe("readerSummaryWeeklyFromPrisma", () => {
  it("maps only a completed certified publication in its canonical slot", () => {
    const row = weeklyRecord();

    expect(readerSummaryWeeklyFromPrisma(row, query)).toMatchObject({
      kind: "weekly",
      artifactId,
      tenantId: tenant,
      workspaceId: workspace,
      proof: row.artifact_payloadProof,
    });
  });

  it.each([
    ["daily cadence", { cadence: "daily" }],
    ["running artifact", { artifact_status: "RUNNING" }],
    ["wrong publication kind", { publication_kind: "EXACT" }],
    ["wrong publication status", { publication_status: "NO_SIGNAL" }],
    ["detached slot", { slot_current_publication_id: null }],
    ["wrong payload hash", { publication_report_sha256: "f".repeat(64) }],
    ["wrong proof hash", { publication_proof_sha256: "f".repeat(64) }],
  ])("fails closed for %s", (_label, mutation) => {
    expect(() =>
      readerSummaryWeeklyFromPrisma(
        { ...weeklyRecord(), ...mutation },
        query,
      ),
    ).toThrow("weekly publication state is invalid");
  });

  it("fails closed when the requested tenant scope diverges", () => {
    expect(() =>
      readerSummaryWeeklyFromPrisma(weeklyRecord(), {
        ...query,
        tenantId: tenantId("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
      }),
    ).toThrow("weekly publication state is invalid");
  });
});

const tenant = "11111111-1111-4111-8111-111111111111";
const workspace = "22222222-2222-4222-8222-222222222222";
const artifactId = "33333333-3333-4333-8333-333333333333";
const weekStartedOn = "2026-07-20";
const weekEndedOn = "2026-07-26";
const periodStartedAt = new Date(`${weekStartedOn}T00:00:00.000Z`);
const periodEndedAt = new Date("2026-07-27T00:00:00.000Z");
const modelInputSha = "a".repeat(64);
const manifestSha = "b".repeat(64);

const query = {
  tenantId: tenantId(tenant),
  workspaceId: workspaceId(workspace),
  artifactId,
};

type TestWeeklyRecord = PrismaReaderSummaryWeeklyPublicationRecord & {
  readonly artifact_payloadProof: Readonly<Record<string, unknown>>;
};

const weeklyRecord = (): TestWeeklyRecord => {
  const citationId = "citation:weekly-prisma-01";
  const storyId = "story:weekly-prisma";
  const citation = {
    citationId,
    requestedUtcDate: weekStartedOn,
    publicationId: "daily-publication-1",
    publicationEvidenceIdentity: "daily-evidence-1",
    providerKey: "hacker-news",
    feedItemId: "weekly-feed-1",
    sourceItemId: "weekly-source-1",
    sourceBindingId: "weekly-binding-1",
    providerItemId: "weekly-provider-1",
    canonicalUrl: "https://example.test/weekly/prisma",
    sourceContentHash: "9".repeat(64),
  };
  const output = {
    schemaVersion: "reader_summary.weekly_model_output.v1",
    sealId: `reader_summary.weekly_model_input.v1:${modelInputSha}`,
    sealSha: modelInputSha,
    weekStartedOn,
    weekEndedOn,
    headline: "Certified weekly headline",
    headlineCitationIds: [citationId],
    takeaway: "Certified weekly takeaway",
    takeawayCitationIds: [citationId],
    synthesis: "Certified weekly synthesis",
    synthesisCitationIds: [citationId],
    stories: [{
      storyId,
      headline: "Certified weekly publication remains atomic",
      summary:
        "A precreated canonical slot ensures one persisted publication and exact replay.",
      status: "developing",
      observedFrom: weekStartedOn,
      observedThrough: weekStartedOn,
      citationIds: [citationId],
    }],
    sections: [{
      sectionId: "section:weekly-prisma-lead",
      storyId,
      kind: "lead",
      claimType: "snapshot",
      heading: "Atomic persistence is certified",
      text: "The publication is bound to its certified weekly evidence.",
      observedFrom: weekStartedOn,
      observedThrough: weekStartedOn,
      citationIds: [citationId],
    }],
  };
  const editorialQuality = {
    policyVersion: "reader_summary.weekly_editorial_quality.v2",
    publicationDecision: "allow",
    metrics: {},
    qualityGates: {},
    issues: [],
    blockingPassed: true,
  };
  const proofBody = {
    schemaVersion: "reader_summary.weekly_publication_proof.v1",
    artifactId,
    tenantId: tenant,
    workspaceId: workspace,
    scope: { type: "workspace" },
    weekStartedOn,
    weekEndedOn,
    manifestSealId:
      `reader_summary.weekly_certification_seal.v1:${manifestSha}`,
    manifestSealSha256: manifestSha,
    modelInputSealId: `reader_summary.weekly_model_input.v1:${modelInputSha}`,
    modelInputSealSha256: modelInputSha,
    artifactSha256: canonicalizeReaderSummaryWeeklyJson(output).sha256,
    editorialQualitySha256:
      canonicalizeReaderSummaryWeeklyJson(editorialQuality).sha256,
    authorities: Array.from({ length: 7 }, (_, index) => ({
      requestedUtcDate: new Date(
        periodStartedAt.getTime() + index * 86_400_000,
      ).toISOString().slice(0, 10),
      publicationId: `daily-publication-${index + 1}`,
      publicationEvidenceIdentity: `daily-evidence-${index + 1}`,
      publicationEvidenceSha256: "c".repeat(64),
      storyAuthorityIdentity: `story-authority-${index + 1}`,
      storyAuthoritySha256: "d".repeat(64),
      githubBoardIdentity: `github-board-${index + 1}`,
      githubBoardSha256: "e".repeat(64),
    })),
    citations: [citation],
  };
  const proofSha = canonicalizeReaderSummaryWeeklyJson(proofBody).sha256;
  const proof = {
    ...proofBody,
    authorizationId:
      `reader_summary.weekly_publication_authorization.v1:${proofSha}`,
    sha256: proofSha,
  };
  const artifactPayload = {
    schemaVersion: "reader_summary.weekly_persisted_artifact.v1",
    output,
    publicationProof: proof,
  };
  const qualitySignals = {
    kind: "weekly",
    editorialQuality,
    weeklyPublicationProof: proof,
  };
  const publishedAt = new Date("2026-08-01T12:00:00.000Z");

  return {
    artifact_id: artifactId,
    tenant_id: tenant,
    workspace_id: workspace,
    scope_type: "workspace",
    scope_key: "workspace",
    interest_id: null,
    cadence: "weekly",
    period_started_at: periodStartedAt,
    period_ended_at: periodEndedAt,
    period_timezone: "UTC",
    period_key:
      `weekly:${periodStartedAt.toISOString()}:${periodEndedAt.toISOString()}:UTC`,
    user_id: null,
    subscription_id: null,
    artifact_status: "COMPLETED",
    schema_version: 1,
    model_version: output.schemaVersion,
    prompt_version: editorialQuality.policyVersion,
    headline: output.headline,
    summary_text: output.synthesis,
    artifact_payload: artifactPayload,
    artifact_payloadProof: proof,
    citations: [citation],
    quality_signals: qualitySignals,
    publication_id: artifactId,
    publication_tenant_id: tenant,
    publication_workspace_id: workspace,
    publication_scope_type: "workspace",
    publication_scope_key: "workspace",
    publication_cadence: "weekly",
    publication_period_started_at: periodStartedAt,
    publication_period_ended_at: periodEndedAt,
    publication_period_timezone: "UTC",
    publication_period_key:
      `weekly:${periodStartedAt.toISOString()}:${periodEndedAt.toISOString()}:UTC`,
    publication_requested_utc_date: weekStartedOn,
    publication_kind: "WEEKLY_CERTIFIED",
    publication_job_id: null,
    publication_artifact_id: artifactId,
    publication_status: "COMPLETED",
    publication_model_version: output.schemaVersion,
    publication_model_authority: 2,
    publication_report_sha256:
      canonicalizeReaderSummaryWeeklyJson(artifactPayload).sha256,
    publication_proof_sha256: proof.sha256,
    publication_exact_proof: proof,
    publication_outbox_event_id: null,
    publication_timestamps_match: true,
    publication_artifact_timestamp_match: true,
    slot_tenant_id: tenant,
    slot_workspace_id: workspace,
    slot_scope_type: "workspace",
    slot_scope_key: "workspace",
    slot_cadence: "weekly",
    slot_period_started_at: periodStartedAt,
    slot_period_ended_at: periodEndedAt,
    slot_period_timezone: "UTC",
    slot_current_publication_id: artifactId,
    slot_publication_timestamp_match: publishedAt.getTime() > 0,
  };
};

const command = {
  kind: "weekly" as const,
  artifactId,
  authorization: Object.freeze(
    {},
  ) as ReaderSummaryWeeklyPublicationAuthorization,
};

const persistencePayload =
  (): weeklyPayload.ReaderSummaryWeeklyPublicationPersistencePayload =>
    ({
      schemaVersion: "reader_summary.weekly_artifact_persistence.v2",
      artifactId: command.artifactId,
      tenantId: tenant,
      workspaceId: workspace,
      artifactPayloadSha256: "a".repeat(64),
      proof: { sha256: "b".repeat(64) },
    }) as weeklyPayload.ReaderSummaryWeeklyPublicationPersistencePayload;

const sqlRow = (
  payload: weeklyPayload.ReaderSummaryWeeklyPublicationPersistencePayload,
  outcome: "persisted" | "replayed",
): weeklyPayload.ReaderSummaryWeeklyPublicationPersistenceSqlRow => ({
  outcome,
  artifact_id: payload.artifactId,
  artifact_payload_sha256: payload.artifactPayloadSha256,
  proof_sha256: payload.proof.sha256,
});

class AtomicWeeklyPrisma {
  readonly requests: unknown[] = [];
  readonly transactionOptions: unknown[] = [];
  private nextResult = 0;

  constructor(
    private readonly results: readonly (
      | weeklyPayload.ReaderSummaryWeeklyPublicationPersistenceSqlRow
      | Error
    )[],
  ) {}

  readonly client = {
    $queryRaw: async (
      _strings: TemplateStringsArray,
      serialized: unknown,
    ) => {
      this.requests.push(JSON.parse(String(serialized)));
      const result = this.results[this.nextResult++];
      if (result instanceof Error) {
        throw result;
      }
      return result === undefined ? [] : [result];
    },
    $transaction: async (
      operation: (client: PrismaSummaryClient) => Promise<unknown>,
      options: unknown,
    ) => {
      this.transactionOptions.push(options);
      return operation(this.client as unknown as PrismaSummaryClient);
    },
  } as unknown as PrismaSummaryClient;
}
