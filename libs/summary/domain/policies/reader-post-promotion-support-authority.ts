import type { ReaderPostPromotionInput } from
  "./reader-post-promotion-policy-contract";

/**
 * Independent promotion support is authoritative only when the source catalog
 * attested the source as trusted. Producer claims and legacy quality hints do
 * not establish corroboration authority.
 */
export const isTrustedReaderPostPromotionSupport = (
  input: ReaderPostPromotionInput,
): boolean => {
  const authority = input.authorityAttestation;
  return authority?.status === "attested" &&
    authority.trusted === true &&
    authority.attestedBy === "source_catalog" &&
    typeof authority.official === "boolean";
};
