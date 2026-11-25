import '../../../support/promotion_attestation_rest_fixture.dart';

const additionalStoriesPromotionArtifactId =
    'reader-summary-additional-stories-e2e';
const additionalStoriesPromotionSourceWindowId = 'fixture-window';

Map<String, Object?> additionalStoriesPromotionAttestationFixture({
  required String candidateId,
  required String canonicalIdentity,
  required String placement,
  required int slot,
  required List<String> citationIds,
  required String providerKey,
  required List<String> supportProviderKeys,
}) => promotionAttestationRestFixture(
  candidateId: candidateId,
  canonicalIdentity: canonicalIdentity,
  placement: placement,
  slot: slot,
  citationIds: citationIds,
  providerKey: providerKey,
  supportProviderKeys: supportProviderKeys,
  artifactId: additionalStoriesPromotionArtifactId,
  sourceWindowId: additionalStoriesPromotionSourceWindowId,
  periodStartedAt: '2026-08-14T12:00:00.000Z',
  periodEndedAt: '2026-08-15T12:00:00.000Z',
  ingestionCutoff: '2026-08-15T12:00:00.000Z',
  publishedAt: '2026-08-15T10:00:00.000Z',
  observedAt: '2026-08-15T11:00:00.000Z',
  supportPublishedAt: '2026-08-15T09:00:00.000Z',
  supportObservedAt: '2026-08-15T11:00:00.000Z',
);
