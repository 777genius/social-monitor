export type ReaderActionKind =
  | "read_source"
  | "watch_repository"
  | "monitor_topic"
  | "compare_sources"
  | "ignore_low_confidence"
  | "add_topic_rule"
  | "request_deeper_scan"
  | "mark_relevant"
  | "mark_not_relevant";

export type ReaderAction = {
  readonly kind: ReaderActionKind;
  readonly label: string;
  readonly reason: string;
  readonly citationIds: readonly string[];
  readonly canonicalUrl?: string;
};
