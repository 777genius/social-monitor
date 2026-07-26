import {
  DomainError,
  err,
  ok,
  type Result,
} from "@social-monitor/shared-kernel";

import {
  observeReaderSummaryWeeklyStory,
  type ReaderSummaryWeeklyCanonicalStoryObservation,
} from "../../domain/entities/reader-summary-weekly-story-observation";
import { assertReaderSummaryWeeklyExactObject } from "../../domain/value-objects/reader-summary-weekly-canonical-json";
import type { ReaderSummaryWeeklyStoryAuthorityPort } from "../../ports/reader-summary-weekly-story-authority.port";
import type { BuildReaderSummaryWeeklyStoryObservationCommand } from "./build-reader-summary-weekly-story-observation.command";

export type BuildReaderSummaryWeeklyStoryObservationResult = Result<
  ReaderSummaryWeeklyCanonicalStoryObservation,
  DomainError
>;

const commandKeys = [
  "tenantId",
  "workspaceId",
  "publicationId",
  "storyIdentity",
  "evidence",
  "existingObservations",
] as const;

export class BuildReaderSummaryWeeklyStoryObservationUseCase {
  constructor(
    private readonly authority: ReaderSummaryWeeklyStoryAuthorityPort,
  ) {}

  async execute(
    command: BuildReaderSummaryWeeklyStoryObservationCommand,
  ): Promise<BuildReaderSummaryWeeklyStoryObservationResult> {
    assertReaderSummaryWeeklyExactObject(
      command,
      commandKeys,
      "story observation command",
    );
    const handle = await this.authority.load({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      publicationId: command.publicationId,
    });
    if (handle === null) {
      return err(
        new DomainError(
          "resource.not_found",
          "Reader summary weekly story publication authority not found",
          { publicationId: command.publicationId },
        ),
      );
    }

    const verifiedAuthority = this.authority.readVerifiedBinding(handle);
    return ok(
      observeReaderSummaryWeeklyStory(
        {
          storyIdentity: command.storyIdentity,
          authority: verifiedAuthority,
          evidence: command.evidence,
        },
        command.existingObservations,
      ),
    );
  }
}
