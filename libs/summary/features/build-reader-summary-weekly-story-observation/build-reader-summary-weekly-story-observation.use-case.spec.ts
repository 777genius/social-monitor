import {
  canonicalizeReaderSummaryWeeklyJson,
} from "../../domain/value-objects/reader-summary-weekly-canonical-json";
import {
  readerSummaryWeeklyStoryAuthoritySchemaVersion,
  type ReaderSummaryWeeklyStoryAuthorityBinding,
} from "../../domain/value-objects/reader-summary-weekly-story-authority";
import {
  deriveReaderSummaryWeeklyStoryIdentity,
} from "../../domain/value-objects/reader-summary-weekly-story-identity";
import type {
  ReaderSummaryWeeklyStoryAuthorityHandle,
  ReaderSummaryWeeklyStoryAuthorityPort,
} from "../../ports/reader-summary-weekly-story-authority.port";
import type { BuildReaderSummaryWeeklyStoryObservationCommand } from "./build-reader-summary-weekly-story-observation.command";
import { BuildReaderSummaryWeeklyStoryObservationUseCase } from "./build-reader-summary-weekly-story-observation.use-case";

describe("BuildReaderSummaryWeeklyStoryObservationUseCase", () => {
  it("loads, adapter-verifies, then builds the pure domain observation", async () => {
    const authority = new FakeWeeklyStoryAuthority(authorityBinding());
    const result =
      await new BuildReaderSummaryWeeklyStoryObservationUseCase(
        authority,
      ).execute(command());

    expect(result.ok).toBe(true);
    expect(authority.operations).toEqual(["load", "readVerifiedBinding"]);
    expect(authority.queries).toEqual([
      {
        tenantId: command().tenantId,
        workspaceId: command().workspaceId,
        publicationId: command().publicationId,
      },
    ]);
    expect(authority.verifiedHandles).toEqual([authority.handle]);
    if (!result.ok) {
      throw result.error;
    }
    expect(result.value.authority).toEqual(authority.binding);
    expect(result.value).toMatchObject({
      observedUtcDate: "2026-07-05",
      evidence: [
        {
          citationId: "citation-1",
          feedItemId: "feed-1",
          sourceItemId: "source-1",
          sourceBindingId: "binding-1",
          providerItemId: "provider-1",
          sourceContentHash: "2".repeat(64),
        },
      ],
    });
    expect(result.value.authority).toMatchObject({
      publicationEvidenceSha256: "c".repeat(64),
      reportSha256: "d".repeat(64),
      proofSha256: "e".repeat(64),
      artifactPayloadSha256: "a".repeat(64),
      providerEvidenceSha256: "b".repeat(64),
      githubEvidenceSha256: "1".repeat(64),
    });
  });

  it("returns not found without attempting adapter verification", async () => {
    const authority = new FakeWeeklyStoryAuthority(null);
    const result =
      await new BuildReaderSummaryWeeklyStoryObservationUseCase(
        authority,
      ).execute(command());

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "resource.not_found",
        details: { publicationId: command().publicationId },
      },
    });
    expect(authority.operations).toEqual(["load"]);
    expect(authority.verifiedHandles).toEqual([]);
  });

  it("forbids a caller-supplied verifier before loading authority", async () => {
    const authority = new FakeWeeklyStoryAuthority(authorityBinding());
    const callerVerifier = jest.fn(() => authorityBinding());
    const useCase =
      new BuildReaderSummaryWeeklyStoryObservationUseCase(authority);

    await expect(
      useCase.execute({
        ...command(),
        readVerifiedBinding: callerVerifier,
      } as never),
    ).rejects.toThrow("must contain exactly");
    expect(callerVerifier).not.toHaveBeenCalled();
    expect(authority.operations).toEqual([]);
  });

  it("rejects a frozen inherited reader without invoking it", async () => {
    const authority = new FakeWeeklyStoryAuthority(authorityBinding());
    const inheritedReader = jest.fn(() => authorityBinding());
    const inheritedCommand = Object.assign(
      Object.create({ readBinding: inheritedReader }) as object,
      command(),
    );
    Object.freeze(inheritedCommand);

    await expect(
      new BuildReaderSummaryWeeklyStoryObservationUseCase(
        authority,
      ).execute(
        inheritedCommand as BuildReaderSummaryWeeklyStoryObservationCommand,
      ),
    ).rejects.toThrow("must be a plain object");
    expect(inheritedReader).not.toHaveBeenCalled();
    expect(authority.operations).toEqual([]);
  });

  it("delegates same-story same-day duplicate rejection to the domain", async () => {
    const authority = new FakeWeeklyStoryAuthority(authorityBinding());
    const useCase =
      new BuildReaderSummaryWeeklyStoryObservationUseCase(authority);
    const first = await useCase.execute(command());
    if (!first.ok) {
      throw first.error;
    }

    await expect(
      useCase.execute({
        ...command(),
        evidence: [
          {
            ...command().evidence[0]!,
          },
        ],
        existingObservations: [first.value],
      }),
    ).rejects.toThrow(
      "already has an observation for the requested UTC date",
    );
  });
});

class FakeWeeklyStoryAuthority
  implements ReaderSummaryWeeklyStoryAuthorityPort
{
  readonly handle = Object.freeze(
    {},
  ) as ReaderSummaryWeeklyStoryAuthorityHandle;
  readonly operations: string[] = [];
  readonly queries: Array<{
    tenantId: string;
    workspaceId: string;
    publicationId: string;
  }> = [];
  readonly verifiedHandles: ReaderSummaryWeeklyStoryAuthorityHandle[] = [];

  constructor(
    readonly binding: ReaderSummaryWeeklyStoryAuthorityBinding | null,
  ) {}

  async load(query: {
    tenantId: string;
    workspaceId: string;
    publicationId: string;
  }): Promise<ReaderSummaryWeeklyStoryAuthorityHandle | null> {
    this.operations.push("load");
    this.queries.push(query);
    return this.binding === null ? null : this.handle;
  }

  readVerifiedBinding(
    handle: ReaderSummaryWeeklyStoryAuthorityHandle,
  ): ReaderSummaryWeeklyStoryAuthorityBinding {
    this.operations.push("readVerifiedBinding");
    this.verifiedHandles.push(handle);
    if (handle !== this.handle || this.binding === null) {
      throw new Error("Fake weekly story authority handle is invalid");
    }
    return this.binding;
  }
}

const command = (): BuildReaderSummaryWeeklyStoryObservationCommand => ({
  tenantId: "00000000-0000-4000-8000-000000000001",
  workspaceId: "00000000-0000-4000-8000-000000000002",
  publicationId: "20000000-0000-4000-8000-000000000001",
  storyIdentity: deriveReaderSummaryWeeklyStoryIdentity({
    subjectKey: "product:openai/codex",
    actionKey: "action:release",
    objectKeys: ["capability:agent"],
    qualifierKeys: ["audience:developer"],
  }),
  evidence: [
    {
      providerKey: "rss",
      citationId: "citation-1",
      sourceItemId: "source-1",
      sourceContentHash: "2".repeat(64),
    },
  ],
  existingObservations: [],
});

const authorityBinding = (): ReaderSummaryWeeklyStoryAuthorityBinding => {
  const body = {
    schemaVersion: readerSummaryWeeklyStoryAuthoritySchemaVersion,
    tenantId: "00000000-0000-4000-8000-000000000001",
    workspaceId: "00000000-0000-4000-8000-000000000002",
    scope: { type: "workspace" as const },
    requestedUtcDate: "2026-07-05",
    publicationId: "20000000-0000-4000-8000-000000000001",
    artifactId: "20000000-0000-4000-8000-000000000001",
    jobId: "10000000-0000-4000-8000-000000000001",
    reportId:
      "reader-summary-report:20000000-0000-4000-8000-000000000001",
    proofId:
      "reader-summary-proof:20000000-0000-4000-8000-000000000001",
    publicationEvidenceIdentity:
      `reader_summary.weekly_publication_evidence.v1:${"c".repeat(64)}`,
    publicationEvidenceSha256: "c".repeat(64),
    reportSha256: "d".repeat(64),
    proofSha256: "e".repeat(64),
    artifactPayloadSha256: "a".repeat(64),
    providerEvidenceSha256: "b".repeat(64),
    githubEvidenceSha256: "1".repeat(64),
    semanticStatus: "COMPLETED" as const,
    publishedAt: "2026-07-05T12:00:00.000Z",
    evidence: [
      {
        providerKey: "rss" as const,
        citationId: "citation-1",
        citationField: "canonicalUrl" as const,
        feedItemId: "feed-1",
        sourceItemId: "source-1",
        sourceBindingId: "binding-1",
        providerItemId: "provider-1",
        canonicalUrl: "https://example.test/citation-1",
        sourceContentHash: "2".repeat(64),
        publishedAt: "2026-07-05T08:00:00.000Z",
        observedAt: "2026-07-05T08:05:00.000Z",
      },
    ],
  };
  const sha256 = canonicalizeReaderSummaryWeeklyJson(body).sha256;
  return {
    ...body,
    identity: `${readerSummaryWeeklyStoryAuthoritySchemaVersion}:${sha256}`,
    sha256,
  };
};
