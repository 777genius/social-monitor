import { FixedClock } from "@social-monitor/shared-kernel";
import { buildReaderSummaryV3Evidence } from
  "../../features/execute-reader-summary-job/reader-summary-v3-execution";
import { candidate, setup } from
  "../evidence/relevance-reader-summary-v3-promotion.fixture";
import { InMemoryReaderSummaryJobRepository } from
  "../persistence/in-memory-reader-summary-job.repository";
import { OpenAiPromotionPresentationV3Builder } from
  "./openai-promotion-presentation-v3.builder";

const invalidJson = '{"draft":PRIVATE_SYNTHETIC_SOURCE_FRAGMENT}';
const responses = [
  ["HTTP envelope", invalidJson],
  ["generated output", JSON.stringify({ status: "completed", output: [{
    type: "message", role: "assistant", status: "completed",
    content: [{ type: "output_text", text: invalidJson }],
  }] })],
] as const;

describe("OpenAI V3 presentation failure privacy", () => {
  it.each(responses)("redacts malformed %s before persisting a dependency failure", async (_stage, body) => {
    const fetchFn = jest.fn(async () => new Response(body));
    const presentation = new OpenAiPromotionPresentationV3Builder({
      apiKey: "fixture", fetchFn,
    });
    const fixture = setup([candidate(1, "useful", "central")], presentation);
    const jobs = new InMemoryReaderSummaryJobRepository();
    await jobs.save(fixture.job);
    const snapshot = fixture.job.toSnapshot();
    const now = new Date("2026-09-21T00:00:00.000Z");

    const result = await buildReaderSummaryV3Evidence({
      job: fixture.job, manifest: fixture.manifest, promotion: fixture.subject,
      jobs, clock: new FixedClock(now), claimStartedAt: now,
    });

    expect(result).toEqual({ kind: "result", value: {
      readerSummaryJobId: snapshot.id, status: "failed",
    } });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const stored = await jobs.findById({
      tenantId: snapshot.tenantId, workspaceId: snapshot.workspaceId,
      readerSummaryJobId: snapshot.id,
    });
    expect(stored?.toSnapshot()).toMatchObject({
      status: "failed", terminalFailureCode: "presentation_dependency_unavailable",
      failureReason: "V3 presentation response must be valid JSON",
    });
    expect(JSON.stringify(stored?.toSnapshot())).not.toContain("PRIVATE");
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
  });
});
