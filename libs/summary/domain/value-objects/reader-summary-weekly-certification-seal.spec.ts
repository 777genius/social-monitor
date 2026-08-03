import { canonicalizeReaderSummaryWeeklyJson } from "./reader-summary-weekly-canonical-json";
import {
  assertReaderSummaryWeeklyCertificationSealBinding,
  cloneReaderSummaryWeeklyCertificationSealBinding,
} from "./reader-summary-weekly-certification-seal";

describe("reader summary weekly certification seal", () => {
  it("accepts the exact canonical persisted Monday-Sunday binding", () => {
    const seal = validSeal();
    expect(() => assertReaderSummaryWeeklyCertificationSealBinding(seal))
      .not.toThrow();
    expect(cloneReaderSummaryWeeklyCertificationSealBinding(seal)).toEqual(seal);
  });

  it.each([
    ["out-of-order day", (seal: ReturnType<typeof validSeal>) => ({
      ...seal,
      days: [seal.days[1]!, seal.days[0]!, ...seal.days.slice(2)],
    })],
    ["duplicate publication", (seal: ReturnType<typeof validSeal>) => ({
      ...seal,
      days: seal.days.map((day, index) => index === 1
        ? { ...day, publicationId: seal.days[0]!.publicationId }
        : day),
    })],
    ["divergent evidence identity", (seal: ReturnType<typeof validSeal>) => ({
      ...seal,
      days: seal.days.map((day, index) => index === 0
        ? { ...day, publicationEvidenceIdentity: "forged" }
        : day),
    })],
  ])("rejects %s", (_label, mutate) => {
    expect(() => assertReaderSummaryWeeklyCertificationSealBinding(
      mutate(validSeal()),
    )).toThrow();
  });

  it("rejects seal identity and hash computed over anything but the canonical body", () => {
    const seal = validSeal();
    expect(() => assertReaderSummaryWeeklyCertificationSealBinding({
      ...seal,
      sealSha: "f".repeat(64),
    })).toThrow(/identity/u);
  });
});

const validSeal = () => {
  const start = Date.parse("2026-07-20T00:00:00.000Z");
  const body = {
    schemaVersion: "reader_summary.weekly_certification_seal.v1" as const,
    tenantId: "11111111-1111-4111-8111-111111111111",
    workspaceId: "22222222-2222-4222-8222-222222222222",
    scopeType: "workspace" as const,
    scopeKey: "workspace",
    weekStartedOn: "2026-07-20",
    weekEndedOn: "2026-07-26",
    days: Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start + index * 86_400_000).toISOString().slice(0, 10);
      const sha = canonicalizeReaderSummaryWeeklyJson({ date }).sha256;
      return {
        requestedUtcDate: date,
        publicationId: `publication:${date}`,
        artifactId: `artifact:${date}`,
        jobId: `job:${date}`,
        semanticStatus: "COMPLETED" as const,
        publicationEvidenceIdentity:
          `reader_summary.weekly_publication_evidence.v1:${sha}`,
        publicationEvidenceSha256: sha,
      };
    }),
  };
  const sha = canonicalizeReaderSummaryWeeklyJson(body).sha256;
  return {
    ...body,
    sealId: `reader_summary.weekly_certification_seal.v1:${sha}`,
    sealSha: sha,
  };
};
