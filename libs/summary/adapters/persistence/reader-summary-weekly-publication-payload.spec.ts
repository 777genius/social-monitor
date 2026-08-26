import * as weeklyAuthorizationPolicy from "../../domain/policies/reader-summary-weekly-publication-authorization";
import { canonicalizeReaderSummaryWeeklyJson } from "../../domain/value-objects/reader-summary-weekly-canonical-json";
import type { ReaderSummaryWeeklyPublicationAuthorization } from "../../domain/policies/reader-summary-weekly-publication-authorization";
import { buildReaderSummaryWeeklyPublicationPersistencePayload } from "./reader-summary-weekly-publication-payload";

describe("reader summary weekly publication persistence payload", () => {
  it("binds one exact weekly artifact row to its DB seal and duplicated proof", () => {
    const details = authorizationDetails();
    const readAuthorization = jest
      .spyOn(
        weeklyAuthorizationPolicy,
        "readReaderSummaryWeeklyPublicationAuthorization",
      )
      .mockReturnValue(details);

    try {
      const payload = buildReaderSummaryWeeklyPublicationPersistencePayload({
        kind: "weekly",
        artifactId: details.artifactId,
        authorization: Object.freeze(
          {},
        ) as ReaderSummaryWeeklyPublicationAuthorization,
      });

      expect(payload).toMatchObject({
        schemaVersion: "reader_summary.weekly_artifact_persistence.v2",
        tenantId: tenantId,
        workspaceId: workspaceId,
        scopeType: "workspace",
        scopeKey: "workspace",
        interestId: null,
        cadence: "weekly",
        weekStartedOn: "2026-06-01",
        weekEndedOn: "2026-06-07",
        periodStartedAt: "2026-06-01T00:00:00.000Z",
        periodEndedAt: "2026-06-08T00:00:00.000Z",
        sealId: modelSealId,
        sealSha256: modelSealSha,
        manifestSealId: manifestSealId,
        manifestSealSha256: manifestSealSha,
      });
      expect(payload.artifactPayload.publicationProof).toBe(details.proof);
      expect(payload.qualitySignals.weeklyPublicationProof).toBe(details.proof);
      expect(payload.proof).toBe(details.proof);
      expect(payload.artifactPayloadSha256).toBe(
        canonicalizeReaderSummaryWeeklyJson(payload.artifactPayload).sha256,
      );
    } finally {
      readAuthorization.mockRestore();
    }
  });

  it("fails before DB I/O when authorization and artifact identities differ", () => {
    const readAuthorization = jest
      .spyOn(
        weeklyAuthorizationPolicy,
        "readReaderSummaryWeeklyPublicationAuthorization",
      )
      .mockReturnValue(authorizationDetails());
    try {
      expect(() =>
        buildReaderSummaryWeeklyPublicationPersistencePayload({
          kind: "weekly",
          artifactId: "54a17f8c-f4e0-4b9b-80b1-bcc5bf118aa2",
          authorization: Object.freeze(
            {},
          ) as ReaderSummaryWeeklyPublicationAuthorization,
        }),
      ).toThrow("bound to another artifact");
    } finally {
      readAuthorization.mockRestore();
    }
  });
});

const tenantId = "11111111-1111-4111-8111-111111111111";
const workspaceId = "22222222-2222-4222-8222-222222222222";
const artifactId = "33333333-3333-4333-8333-333333333333";
const modelSealSha = "a".repeat(64);
const modelSealId = `reader_summary.weekly_model_input.v1:${modelSealSha}`;
const manifestSealSha = "b".repeat(64);
const manifestSealId =
  `reader_summary.weekly_certification_seal.v1:${manifestSealSha}`;

const authorizationDetails = (): ReturnType<
  typeof weeklyAuthorizationPolicy.readReaderSummaryWeeklyPublicationAuthorization
> => {
  const proof = {
    schemaVersion: "reader_summary.weekly_publication_proof.v1",
    artifactId,
    tenantId,
    workspaceId,
    scope: { type: "workspace" },
    weekStartedOn: "2026-06-01",
    weekEndedOn: "2026-06-07",
    manifestSealId,
    manifestSealSha256: manifestSealSha,
    modelInputSealId: modelSealId,
    modelInputSealSha256: modelSealSha,
    artifactSha256: "c".repeat(64),
    editorialQualitySha256: "d".repeat(64),
    authorities: [],
    citations: [],
    authorizationId: `reader_summary.weekly_publication_authorization.v1:${"e".repeat(64)}`,
    sha256: "e".repeat(64),
  } as const;
  return {
    artifactId,
    artifact: {
      output: {
        schemaVersion: "reader_summary.weekly_model_output.v1",
        sealId: modelSealId,
        sealSha: modelSealSha,
        weekStartedOn: "2026-06-01",
        weekEndedOn: "2026-06-07",
        headline: "Exact weekly headline",
        synthesis: "Exact weekly synthesis",
      },
      editorialQuality: {
        policyVersion: "reader_summary.weekly_editorial_quality.v2",
        publicationDecision: "allow",
        blockingPassed: true,
      },
    },
    qualitySignals: {
      kind: "weekly",
      editorialQuality: {
        policyVersion: "reader_summary.weekly_editorial_quality.v2",
        publicationDecision: "allow",
        blockingPassed: true,
      },
    },
    proof,
  } as ReturnType<
    typeof weeklyAuthorizationPolicy.readReaderSummaryWeeklyPublicationAuthorization
  >;
};
