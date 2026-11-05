import { ReaderSummaryArtifact } from "../../../domain";
import { presentReaderSummaryArtifact } from
  "../../../features/shared/reader-summary-artifact-presenter";
import { readerSummaryArtifactViewFromReaderSummaryView } from
  "../../../interfaces/rest/reader-summary-rest.mapper";
import { normalizeReaderSummaryArtifactPayload } from
  "./prisma-reader-summary-artifact-payload";
import { readerSummaryArtifact } from
  "./prisma-reader-summary-artifact-fixture.spec-support";
import { serializeReaderSummaryArtifact } from "./prisma-reader-summary-json";

describe("reader summary exact cutoff persistence", () => {
  it("preserves canonical microseconds and the compatible millisecond projection", () => {
    const base = readerSummaryArtifact("exact-cutoff-roundtrip").toSnapshot();
    const cutoff = new Date("2026-07-05T08:59:59.123Z");
    const artifact = ReaderSummaryArtifact.create({ ...base,
      storyClusters: [], topStories: [], citationMap: [], qualityFlags: ["no_signal"],
      noSignalReason: "No eligible evidence in the exact window.",
      content: { ...base.content!, topReads: [], selectedPosts: [],
        interestSections: [], claimBoard: [], sourceMix: [],
        qualityState: { ...base.content!.qualityState, status: "no_signal",
          flags: ["no_signal"] } }, sourceWindow: {
      ...base.sourceWindow, selectedFeedItemIds: [], storyClusterIds: [],
      periodStartedAt: base.period.startedAt,
      periodEndedAt: base.period.endedAt, ingestionCutoff: cutoff,
      exactIngestionCutoff: "2026-07-05T08:59:59.123456Z",
    } });

    const serialized = serializeReaderSummaryArtifact(artifact);
    expect(serialized.sourceWindow).toMatchObject({
      ingestionCutoff: "2026-07-05T08:59:59.123Z",
      exactIngestionCutoff: "2026-07-05T08:59:59.123456Z",
    });
    const loaded = ReaderSummaryArtifact.rehydrate(
      normalizeReaderSummaryArtifactPayload(serialized, {
        id: base.readerSummaryId, tenantId: base.tenantId,
        workspaceId: base.workspaceId, scopeType: "workspace", interestId: null,
        cadence: base.period.cadence, periodStartedAt: base.period.startedAt,
        periodEndedAt: base.period.endedAt, periodTimezone: base.period.timezone,
        userId: null, subscriptionId: null, headline: base.headline,
        summaryText: base.executiveSummary, createdAt: base.period.endedAt,
      }),
    );
    const response = readerSummaryArtifactViewFromReaderSummaryView(
      presentReaderSummaryArtifact(loaded, { status: "fresh", checkedAt: cutoff }),
    );
    expect(response.sourceWindow).toMatchObject({
      ingestionCutoff: "2026-07-05T08:59:59.123Z",
      exactIngestionCutoff: "2026-07-05T08:59:59.123456Z",
    });
  });
});
