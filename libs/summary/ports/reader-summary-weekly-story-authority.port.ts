import type { ReaderSummaryWeeklyStoryAuthorityBinding } from "../domain/value-objects/reader-summary-weekly-story-authority";

export type LoadReaderSummaryWeeklyStoryAuthorityQuery = Readonly<{
  tenantId: string;
  workspaceId: string;
  publicationId: string;
}>;

declare const readerSummaryWeeklyStoryAuthorityHandleBrand: unique symbol;

export type ReaderSummaryWeeklyStoryAuthorityHandle = Readonly<{
  readonly [readerSummaryWeeklyStoryAuthorityHandleBrand]:
    "reader_summary.weekly_story_authority.opaque_handle";
}>;

export interface ReaderSummaryWeeklyStoryAuthorityPort {
  load(
    query: LoadReaderSummaryWeeklyStoryAuthorityQuery,
  ): Promise<ReaderSummaryWeeklyStoryAuthorityHandle | null>;
  readVerifiedBinding(
    handle: ReaderSummaryWeeklyStoryAuthorityHandle,
  ): ReaderSummaryWeeklyStoryAuthorityBinding;
}
