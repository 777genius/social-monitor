import {
  DomainError,
  err,
  ok,
  tenantId,
  workspaceId,
  type Result,
} from "@social-monitor/shared-kernel";

import type { ReaderSummaryWeeklyArtifact } from "../../domain/entities/reader-summary-weekly-artifact";
import { authorizeReaderSummaryWeeklyCertifiedPublication } from "../../domain/policies/reader-summary-weekly-publication-authorization";
import type { ReaderSummaryWeeklyModelInput } from "../../ports/reader-summary-weekly-model.port";
import type {
  ReaderSummaryWeeklyArtifactRepositoryPort,
} from "../../ports/reader-summary-artifact-repository.port";
import type { ReaderSummaryWeeklyCertificationSealAuthorityPort } from "../../ports/reader-summary-weekly-certification-seal-authority.port";
import type { ReaderSummaryWeeklyStoryAuthorityPort } from "../../ports/reader-summary-weekly-story-authority.port";

export type PublishReaderSummaryWeeklyCertifiedArtifactCommand = Readonly<{
  artifact: ReaderSummaryWeeklyArtifact;
  modelInput: ReaderSummaryWeeklyModelInput;
}>;

export type PublishedReaderSummaryWeeklyCertifiedArtifact = Readonly<{
  status: "published";
  artifactId: string;
  databasePublicationVerified: true;
}>;

export type PublishReaderSummaryWeeklyCertifiedArtifactResult = Result<
  PublishedReaderSummaryWeeklyCertifiedArtifact,
  DomainError
>;

export class PublishReaderSummaryWeeklyCertifiedArtifactUseCase {
  constructor(
    private readonly sealAuthority: ReaderSummaryWeeklyCertificationSealAuthorityPort,
    private readonly storyAuthority: ReaderSummaryWeeklyStoryAuthorityPort,
    private readonly weeklyArtifacts: ReaderSummaryWeeklyArtifactRepositoryPort,
  ) {}

  async execute(
    command: PublishReaderSummaryWeeklyCertifiedArtifactCommand,
  ): Promise<PublishReaderSummaryWeeklyCertifiedArtifactResult> {
    const input = command.modelInput;
    const sealHandle = await this.sealAuthority.load({
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      scope: input.scope,
      weekStartedOn: input.weekStartedOn,
    });
    if (sealHandle === null) return authorityMissing();
    let seal: ReturnType<typeof this.sealAuthority.readVerifiedBinding>;
    try {
      seal = this.sealAuthority.readVerifiedBinding(sealHandle);
    } catch {
      return authorityDiverged();
    }
    const storyHandles = await Promise.all(seal.days.map((day) =>
      this.storyAuthority.load({
        tenantId: input.tenantId,
        workspaceId: input.workspaceId,
        publicationId: day.publicationId,
      }),
    ));
    if (storyHandles.some((handle) => handle === null)) return authorityMissing();
    const artifactIdentity = readerSummaryWeeklyCertifiedArtifactId(seal.sealSha);
    if (!artifactIdentity.ok) return artifactIdentity;
    const artifactId = artifactIdentity.value;
    let authorization;
    try {
      authorization = authorizeReaderSummaryWeeklyCertifiedPublication(
        {
          artifactId,
          artifact: command.artifact,
          modelInput: input,
          certificationSealHandle: sealHandle,
          dailyAuthorityHandles: storyHandles.filter(
            (handle): handle is NonNullable<typeof handle> => handle !== null,
          ),
        },
        this.sealAuthority,
        this.storyAuthority,
      );
    } catch {
      return authorityDiverged();
    }
    await this.weeklyArtifacts.saveWeekly({
      kind: "weekly",
      artifactId,
      authorization,
    });
    const persisted = await this.weeklyArtifacts.findWeeklyById({
      tenantId: tenantId(input.tenantId),
      workspaceId: workspaceId(input.workspaceId),
      artifactId,
    });
    if (persisted === null) {
      return err(new DomainError(
        "external.dependency_unavailable",
        "Reader summary weekly certified artifact is not strictly persisted",
        { artifactId },
      ));
    }
    return ok(Object.freeze({
      status: "published",
      artifactId,
      databasePublicationVerified: true,
    }));
  }
}

export const readerSummaryWeeklyCertifiedArtifactId = (
  sealSha: string,
): Result<string, DomainError> => {
  if (!/^[0-9a-f]{64}$/u.test(sealSha)) {
    return err(new DomainError(
      "validation.failed",
      "Reader summary weekly certified artifact seal hash is invalid",
    ));
  }
  const variant = (8 + (Number.parseInt(sealSha[16]!, 16) & 3)).toString(16);
  return ok(`${sealSha.slice(0, 8)}-${sealSha.slice(8, 12)}-5${sealSha.slice(13, 16)}-${variant}${sealSha.slice(17, 20)}-${sealSha.slice(20, 32)}`);
};

const authorityMissing = (): PublishReaderSummaryWeeklyCertifiedArtifactResult =>
  err(new DomainError(
    "resource.not_found",
    "Reader summary weekly certified publication authority is missing",
  ));

const authorityDiverged = (): PublishReaderSummaryWeeklyCertifiedArtifactResult =>
  err(new DomainError(
    "authorization.denied",
    "Reader summary weekly certified publication authority diverged",
  ));
