import { readReaderPromotionDiagnostics } from
  "../../libs/summary/domain/value-objects/reader-promotion-diagnostics";
import { readReaderSummaryDailyGenerationInput } from
  "../../libs/summary/domain/value-objects/reader-summary-daily-generation-input";
import { candidateAuditArtifactFixture } from
  "./reader-summary-v3-candidate-audit-postgres-contract";

describe("large V3 publication audit fixture", () => {
  it("uses genuine domain-valid 1220 candidate and 1190 exclusion shapes", () => {
    const artifact = candidateAuditArtifactFixture();
    const diagnostics = readReaderPromotionDiagnostics(artifact.promotionDiagnostics);
    const input = readReaderSummaryDailyGenerationInput(artifact.dailyGenerationInput);
    expect(diagnostics?.candidates).toHaveLength(1_220);
    expect(input?.excluded).toHaveLength(1_190);
    expect(input?.selected).toHaveLength(30);
    expect(input?.candidateCount).toBe(1_220);
  });
});
