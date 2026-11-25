import {
  buildProductionRecoveryAuthorityBinding,
  type ProductionRecoveryEvidenceRow,
} from "../../libs/summary/adapters/persistence/prisma/prisma-reader-summary-production-recovery-authority-row";
import {
  fixtureScope,
  productionRecoveryEvidenceRows,
} from "../../libs/summary/adapters/persistence/prisma/prisma-reader-summary-production-recovery-authority.spec-support";

import {
  readerSummaryProductionRecoveryDates,
  readerSummaryProductionRecoveryExpectedCounts,
} from "./reader-summary-production-recovery-data";
import { readerSummaryProductionRecoveryProviderKeys } from "@social-monitor/summary/ports";

export const exactProductionRecoveryBinding = () => {
  const available = productionRecoveryEvidenceRows();
  let ordinal = 900_000;
  const rows = readerSummaryProductionRecoveryDates.flatMap((date) =>
    readerSummaryProductionRecoveryProviderKeys.flatMap((providerKey) => {
      const expected = readerSummaryProductionRecoveryExpectedCounts[date][providerKey];
      const matching = available.filter(
        (row) => row.requestedUtcDate === date && row.providerKey === providerKey,
      );
      const selected = matching.slice(0, expected);
      const seed = matching[0];
      if (selected.length === expected || seed === undefined) return selected;
      return [
        ...selected,
        ...Array.from({ length: expected - selected.length }, () => {
          ordinal += 1;
          return cloneEvidence(seed, date, ordinal);
        }),
      ];
    }),
  );
  return buildProductionRecoveryAuthorityBinding({ scope: fixtureScope, rows });
};

const cloneEvidence = (
  seed: ProductionRecoveryEvidenceRow,
  date: string,
  ordinal: number,
): ProductionRecoveryEvidenceRow => {
  const suffix = ordinal.toString().padStart(12, "0");
  return {
    ...seed,
    requestedUtcDate: date,
    feedItemId: `10000000-0000-4000-8000-${suffix}`,
    sourceItemId: `20000000-0000-4000-8000-${suffix}`,
    providerItemId: `${seed.providerKey}:exact:${ordinal}`,
    canonicalUrl: `https://evidence.invalid/exact/${ordinal}`,
    title: `Exact evidence ${ordinal}`,
    bodyPreview: `Exact preview ${ordinal}`,
    sourceText: `Exact immutable source text ${ordinal}`,
    sourceContentHash: ordinal.toString(16).padStart(64, "0"),
    publishedAt: new Date(`${date}T12:00:00.000Z`),
    observedAt: new Date(`${date}T12:01:00.000Z`),
  };
};
