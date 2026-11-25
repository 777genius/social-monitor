import type { ReaderPostPromotionAttestationV3 } from "../../domain";

export type ReaderPostPromotionAttestationV3View = Omit<
  ReaderPostPromotionAttestationV3,
  "periodStartedAt" | "periodEndedAt" | "ingestionCutoff"
> & { readonly periodStartedAt: string; readonly periodEndedAt: string;
  readonly ingestionCutoff: string };

export const presentPromotionAttestationV3 = (
  attestation: ReaderPostPromotionAttestationV3,
): ReaderPostPromotionAttestationV3View => ({ ...attestation,
  periodStartedAt: attestation.periodStartedAt.toISOString(),
  periodEndedAt: attestation.periodEndedAt.toISOString(),
  ingestionCutoff: attestation.ingestionCutoff.toISOString() });
