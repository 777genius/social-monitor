import * as assessmentModule from "./reader-summary-new-input-refresh-assessment";
import type { RefreshAssessmentCaptureEvent } from "./reader-summary-new-input-refresh-assessment";
import { selectorOutput, selectorWiring } from "./reader-summary-new-input-refresh-selector-composition.spec-support";
import { sourceContentAssessmentPurpose } from "./reader-summary-new-input-refresh-assessment-runtime";

const createReviewer = assessmentModule.createRefreshAssessmentReviewer;
afterEach(() => jest.restoreAllMocks());

function captureEvents(fail = false) {
  const events: RefreshAssessmentCaptureEvent[] = [];
  jest.spyOn(assessmentModule, "createRefreshAssessmentReviewer").mockImplementation((input) =>
    createReviewer({ ...input, capture: (event) => {
      events.push(event);
      if (fail) throw new Error("synthetic capture disk failure");
    } }));
  return events;
}

describe("synthetic assessment capture from the existing reviewer invocation", () => {
  it.each(["promote", "reject", "needs_context", "low_confidence"])(
    "retains exact requests and parsed %s outcomes without another provider call", async (decision) => {
      const events = captureEvents();
      const test = await selectorWiring({ output: (command) => {
        const output = selectorOutput(command);
        if (command.purpose === sourceContentAssessmentPurpose) {
          for (const review of output.reviews as Record<string, unknown>[]) {
            if (decision === "low_confidence") review.confidence = 0.1;
            else review.decision = decision;
          }
        }
        return output;
      } });
      await test.select();
      test.assessment.assertCaptureComplete();
      expect(events.map((event) => event.phase)).toEqual(["attempt", "completed"]);
      expect(events[0]!.consumed).toBe(false);
      expect(events[1]!.consumed).toBe(true);
      expect(events[1]!.requestsJson).toBe(events[0]!.requestsJson);
      const requests = JSON.parse(events[0]!.requestsJson);
      expect(requests).toHaveLength(2);
      expect(requests[0].promotion.trustedIntent).toBe("AI developer tools");
      expect(JSON.parse(events[1]!.reviewsJson!)).toHaveLength(2);
      expect(JSON.parse(events[1]!.verdictsJson!).map((item: { verdict: { reason: string } }) => item.verdict.reason))
        .toEqual(Array(2).fill(decision === "needs_context" || decision === "low_confidence"
          ? `promotion_assessment_pending:${decision}` : `promotion_assessment:${decision}`));
      expect(test.commands.filter((command) => command.purpose === sourceContentAssessmentPurpose)).toHaveLength(1);
    });

  it("keeps capture callback failures sticky while preserving selection and invocation count", async () => {
    const baseline = await selectorWiring();
    const expected = await baseline.selectComplete();
    captureEvents(true);
    const observed = await selectorWiring();
    expect(await observed.selectComplete()).toEqual(expected);
    expect(observed.commands.map((command) => command.purpose)).toEqual(baseline.commands.map((command) => command.purpose));
    expect(() => observed.assessment.assertCaptureComplete()).toThrow(/capture is incomplete/u);
    expect(() => observed.runtime.assertUsable()).not.toThrow();
  });

  it("retains the canonical closure bindings and isolates its capture failure", async () => {
    const canonical: unknown[] = [];
    jest.spyOn(assessmentModule, "createRefreshAssessmentReviewer").mockImplementation((input) =>
      createReviewer({ ...input, captureCanonical: (value) => {
        canonical.push(value);
        expect(JSON.parse(value.canonicalEvidenceJson)).toHaveLength(2);
        expect(JSON.parse(value.sourceTextBindingsJson)).toHaveLength(2);
        expect(JSON.parse(value.exemptBindingsJson)).toEqual([]);
        throw new Error("synthetic canonical sidecar failure");
      } }));
    const test = await selectorWiring();
    expect((await test.selectComplete()).selectedEvidence).toHaveLength(2);
    expect(canonical).toHaveLength(1);
    expect(() => test.assessment.assertCaptureComplete()).toThrow(/capture is incomplete/u);
    expect(() => test.runtime.assertUsable()).not.toThrow();
  });

  it("retains a malformed response failure without inventing parsed outcomes or retrying", async () => {
    const events = captureEvents();
    const test = await selectorWiring({ output: (command) => command.purpose === sourceContentAssessmentPurpose
      ? { reviews: [] } : selectorOutput(command) });
    await expect(test.selectComplete()).rejects.toThrow(/reconciliation/u);
    expect(events.map((event) => event.phase)).toEqual(["attempt", "failed"]);
    // An empty reviews array parses without error; the mismatch against the
    // requested candidate count is a coverage/binding failure, not a
    // parse/schema one.
    expect(events[1]).toMatchObject({ consumed: true, failure: "binding" });
    expect(events[1]!.reviewsJson).toBeUndefined();
    expect(test.commands).toHaveLength(1);
  });

  it("classifies a schema-invalid review body as a parse/schema failure, not a generic one", async () => {
    const events = captureEvents();
    const test = await selectorWiring({ output: (command) => command.purpose === sourceContentAssessmentPurpose
      ? { reviews: "not-an-array" } : selectorOutput(command) });
    await expect(test.selectComplete()).rejects.toThrow(/reconciliation/u);
    expect(events.map((event) => event.phase)).toEqual(["attempt", "failed"]);
    expect(events[1]).toMatchObject({ consumed: true, failure: "parse_schema" });
  });
});
