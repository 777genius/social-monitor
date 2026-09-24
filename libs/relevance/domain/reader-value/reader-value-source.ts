/** Stable capture facts only. Fetch/attempt timestamps and engagement are not identity. */
export type ReaderValueCapture = {
  readonly representationVersion: string;
  readonly availability: 'complete' | 'partial' | 'truncated' | 'description_only' | 'legacy_combined' | 'unknown';
  readonly segments: readonly {
    readonly origin: 'native' | 'article';
    readonly sourceUrl: string | null;
    readonly finalUrl: string | null;
    readonly offset: number;
    readonly length: number;
    readonly originalLength: number;
    readonly truncated: boolean;
    /** CP3 capture digest covers bytes discarded before source storage. */
    readonly fullTextSha256?: string;
    readonly extractionVersion?: string;
  }[];
};

export type ReaderValueSource = {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly interestId: string;
  readonly sourceItemId: string;
  readonly providerKey: string;
  readonly canonicalUrl: string;
  readonly title: string;
  readonly body: string;
  readonly interest: string;
  readonly capture: ReaderValueCapture;
  /** Exact database timestamp representation; never derive from first observedAt. */
  readonly availableAt: string | null;
};

export type ReaderValueSourceSnapshot = {
  readonly sourceSnapshotSha256: string;
  /** Exact raw interest revision, before redaction; always part of assessment identity. */
  readonly interestSha256: string;
  readonly sanitizedTextSha256: string;
  readonly title: string;
  readonly body: string;
  readonly interest: string;
  readonly capture: ReaderValueCapture;
  readonly availableAt: string | null;
  readonly originalTitleLength: number;
  readonly originalBodyLength: number;
  readonly retainedSnapshotTruncated: boolean;
  readonly modelInputTruncated?: boolean;
  readonly sentTextSha256?: string;
  readonly sentTitleLength?: number;
  readonly sentBodyLength?: number;
  readonly safety: 'allowed' | 'sanitized' | 'blocked';
};
