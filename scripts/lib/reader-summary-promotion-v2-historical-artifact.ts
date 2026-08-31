import { ReaderSummaryArtifact } from "@social-monitor/summary/domain";
import { normalizeReaderSummaryArtifactPayload } from
  "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-artifact-payload";

export type HistoricalPromotionArtifactRecord = Readonly<{
  artifactId: string;
  tenantId: string;
  workspaceId: string;
  scopeType: string;
  interestId: string | null;
  cadence: string;
  periodStartedAt: Date | string;
  periodEndedAt: Date | string;
  periodTimezone: string;
  userId: string | null;
  subscriptionId: string | null;
  headline: string;
  summaryText: string | null;
  createdAt: Date | string;
  artifactPayload: unknown;
}>;

export type HistoricalPromotionTupleKind = "strict-v1" | "valid-v2";

export type HistoricalPromotionArtifactVerification = Readonly<{
  kind: HistoricalPromotionTupleKind;
  noSignal: boolean;
  orderedLanes: Readonly<{
    top: readonly unknown[];
    additional: readonly unknown[];
  }>;
  citationCount: number;
}>;

export const verifyHistoricalPromotionArtifact = (
  record: HistoricalPromotionArtifactRecord,
): HistoricalPromotionArtifactVerification => {
  const artifact = ReaderSummaryArtifact.rehydrate(
    normalizeReaderSummaryArtifactPayload(record.artifactPayload, {
      id: record.artifactId,
      tenantId: record.tenantId,
      workspaceId: record.workspaceId,
      scopeType: record.scopeType,
      interestId: record.interestId,
      cadence: record.cadence,
      periodStartedAt: timestamp(record.periodStartedAt),
      periodEndedAt: timestamp(record.periodEndedAt),
      periodTimezone: record.periodTimezone,
      userId: record.userId,
      subscriptionId: record.subscriptionId,
      headline: record.headline,
      summaryText: record.summaryText,
      createdAt: timestamp(record.createdAt),
    }),
  );
  const snapshot = artifact.toSnapshot();
  const attestations = snapshot.promotionAttestations ?? [];
  const versions = new Set(attestations.map((item) => item.policyVersion));
  if (versions.size > 1) {
    throw new Error("Historical promotion artifact has a mixed policy tuple");
  }
  if (attestations.length > 0 &&
      versions.has("reader_post_promotion.v1")) {
    return {
      kind: "strict-v1",
      noSignal: false,
      orderedLanes: orderedLanes(snapshot, attestations),
      citationCount: snapshot.citationMap.length,
    };
  }
  if (attestations.length > 0 &&
      versions.has("reader_post_promotion.v2")) {
    return {
      kind: "valid-v2",
      noSignal: false,
      orderedLanes: orderedLanes(snapshot, attestations),
      citationCount: snapshot.citationMap.length,
    };
  }
  if (attestations.length === 0 && isPromotionV2NoSignal(snapshot)) {
    return {
      kind: "valid-v2",
      noSignal: true,
      orderedLanes: { top: [], additional: [] },
      citationCount: 0,
    };
  }
  throw new Error("Historical promotion artifact tuple is unknown or tampered");
};

const orderedLanes = (
  snapshot: ReturnType<ReaderSummaryArtifact["toSnapshot"]>,
  attestations: NonNullable<
    ReturnType<ReaderSummaryArtifact["toSnapshot"]>["promotionAttestations"]
  >,
): HistoricalPromotionArtifactVerification["orderedLanes"] => {
  if (snapshot.content === undefined) {
    throw new Error("Historical promotion artifact reader board is missing");
  }
  const byCandidate = new Map(attestations.map((item) => [
    item.candidateId,
    JSON.parse(JSON.stringify(item)) as unknown,
  ]));
  const lane = (
    cards: readonly { readonly promotionCandidateId?: string }[],
    name: "top" | "additional",
  ): readonly unknown[] => cards.map((card) => {
    const id = card.promotionCandidateId;
    const attestation = id === undefined ? undefined : byCandidate.get(id);
    if (attestation === undefined) {
      throw new Error(`Historical promotion ${name} lane binding is missing`);
    }
    return attestation;
  });
  return {
    top: lane(snapshot.content.topReads, "top"),
    additional: lane(snapshot.content.selectedPosts ?? [], "additional"),
  };
};

const isPromotionV2NoSignal = (
  snapshot: ReturnType<ReaderSummaryArtifact["toSnapshot"]>,
): boolean => snapshot.qualityFlags.includes("no_signal") &&
  snapshot.topStories.length === 0 &&
  snapshot.citationMap.length === 0 &&
  (snapshot.content?.topReads.length ?? 0) === 0 &&
  (snapshot.content?.selectedPosts?.length ?? 0) === 0 &&
  snapshot.lineage.promptVersion === "reader_summary.promotion_no_signal.v1" &&
  snapshot.lineage.modelVersion === "not_invoked" &&
  snapshot.lineage.providerVersion === "deterministic" &&
  snapshot.lineage.rulesVersion === "reader_promotion_policy.v2" &&
  snapshot.lineage.evalDatasetVersion === "reader_promotion_policy.v2";

const timestamp = (value: Date | string): Date => {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Historical promotion artifact timestamp is invalid");
  }
  return parsed;
};
