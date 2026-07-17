import type {
  ReaderSummaryArtifact,
  ReaderSummaryJob,
  ReaderSummaryPublicationDecision,
  ReaderSummaryReadyEvent,
} from "../domain";

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
  readonly readyEvent: ReaderSummaryReadyEvent;
};

export interface ReaderSummaryPublicationPort {
  publish(
    command: ReaderSummaryPublicationCommand,
  ): Promise<ReaderSummaryPublicationOutcome>;
}
