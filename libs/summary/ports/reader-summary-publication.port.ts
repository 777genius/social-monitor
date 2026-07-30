import type {
  ReaderSummaryArtifact,
  ReaderSummaryGitHubProjectionAudit,
  ReaderSummaryJob,
  ReaderSummaryPublicationDecision,
  ReaderSummaryReadyEvent,
} from "../domain";
import type { ReaderSummaryWeeklyPublicationAuthorization } from "../domain/policies/reader-summary-weekly-publication-authorization";

export type PublishableReaderSummaryPublicationDecision = Extract<
  ReaderSummaryPublicationDecision,
  { readonly status: "published" }
>;

export type ReaderSummaryPublicationOutcome =
  | "published"
  | "replayed"
  | "stale";

export type ReaderSummaryPublicationCommand = {
  readonly artifact: ReaderSummaryArtifact;
  readonly finalJob: ReaderSummaryJob;
  readonly publicationDecision: PublishableReaderSummaryPublicationDecision;
  readonly githubProjectionAudit: ReaderSummaryGitHubProjectionAudit;
  readonly readyEvent: ReaderSummaryReadyEvent;
};

export type ReaderSummaryAuthorizedPublication =
  | Readonly<{
      kind: "daily";
      command: ReaderSummaryPublicationCommand;
    }>
  | Readonly<{
      kind: "weekly";
      artifactId: string;
      authorization: ReaderSummaryWeeklyPublicationAuthorization;
    }>;

export interface ReaderSummaryPublicationPort {
  publish(
    command: ReaderSummaryPublicationCommand,
  ): Promise<ReaderSummaryPublicationOutcome>;
}
