import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/infrastructure/api/summary_api_dto.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/summary_mapper.dart';

import '../../support/summaries_test_fixtures.dart';

void main() {
  const mapper = SummaryMapper();

  test('maps a placement-matching typed promotion attestation', () {
    final summary = mapper.readerSummaryToDomain(
      readerSummaryApiDto(
        bindPromotionAttestations: false,
        content: readerSummaryContentApiDto(
          topReads: [
            _item(
              cardKind: 'curated_top_read',
              attestation: const ReaderPostPromotionAttestationApiDto(
                candidateId: 'feed-c-1',
                canonicalIdentity: 'story:canonical',
                placement: 'top',
                slot: 0,
                decision: 'promote_top',
                citationIds: ['bc-1'],
              ),
            ),
          ],
          selectedPosts: const [],
        ),
      ),
    );

    expect(summary.content.topReads.single.promotionAttestation, isNotNull);
    expect(
      summary.content.topReads.single.promotionAttestation!.placement,
      ReaderPostPromotionPlacement.top,
    );
  });

  test('removes a card with a placement-conflicting attestation', () {
    final summary = mapper.readerSummaryToDomain(
      readerSummaryApiDto(
        bindPromotionAttestations: false,
        content: readerSummaryContentApiDto(
          topReads: [
            _item(
              cardKind: 'curated_top_read',
              attestation: const ReaderPostPromotionAttestationApiDto(
                candidateId: 'feed-c-1',
                canonicalIdentity: 'story:canonical',
                placement: 'additional',
                slot: 0,
                decision: 'promote_additional',
                citationIds: ['bc-1'],
              ),
            ),
          ],
          selectedPosts: const [],
        ),
      ),
    );

    expect(summary.content.topReads, isEmpty);
  });

  test(
    'removes missing or citation-mismatched attestations from every lane',
    () {
      final mismatched = const ReaderPostPromotionAttestationApiDto(
        candidateId: 'feed-c-1',
        canonicalIdentity: 'story:canonical',
        placement: 'additional',
        slot: 0,
        decision: 'promote_additional',
        citationIds: ['different-citation'],
      );
      final summary = mapper.readerSummaryToDomain(
        readerSummaryApiDto(
          bindPromotionAttestations: false,
          content: readerSummaryContentApiDto(
            topReads: [_item(cardKind: 'curated_top_read')],
            selectedPosts: [
              _item(
                cardKind: 'additional_notable_story',
                attestation: mismatched,
              ),
            ],
            interestSections: [
              ReaderInterestSectionApiDto(
                title: 'Executive brief source',
                insight: 'Must not leak an unattested card.',
                items: [_item(cardKind: 'curated_top_read')],
                citationIds: const ['bc-1'],
              ),
            ],
          ),
        ),
      );

      expect(summary.content.topReads, isEmpty);
      expect(summary.content.selectedPosts, isEmpty);
      expect(summary.content.interestSections.single.items, isEmpty);
    },
  );

  test('atomically rejects a well-formed reordered promotion board', () {
    final summary = mapper.readerSummaryToDomain(
      readerSummaryApiDto(
        bindPromotionAttestations: false,
        content: readerSummaryContentApiDto(
          topReads: [
            _item(
              cardKind: 'curated_top_read',
              attestation: _attestation(candidate: 'feed-1', slot: 1),
            ),
            _item(
              cardKind: 'curated_top_read',
              attestation: _attestation(
                candidate: 'feed-2',
                canonical: 'story:canonical-2',
                slot: 0,
              ),
            ),
          ],
        ),
      ),
    );

    expect(summary.content.topReads, isEmpty);
    expect(summary.content.selectedPosts, isEmpty);
    expect(
      summary.content.promotionBoardAvailability,
      ReaderSummaryPromotionBoardAvailability.unavailable,
    );
  });

  test('atomically rejects a globally duplicate canonical identity', () {
    final summary = mapper.readerSummaryToDomain(
      readerSummaryApiDto(
        bindPromotionAttestations: false,
        content: readerSummaryContentApiDto(
          topReads: [
            _item(
              cardKind: 'curated_top_read',
              attestation: _attestation(candidate: 'feed-1'),
            ),
          ],
          selectedPosts: [
            _item(
              cardKind: 'additional_notable_story',
              attestation: _attestation(
                candidate: 'feed-2',
                placement: 'additional',
              ),
            ),
          ],
        ),
      ),
    );

    expect(summary.content.topReads, isEmpty);
    expect(summary.content.selectedPosts, isEmpty);
  });

  test('atomically rejects an over-cap lane without filtering', () {
    final topReads = List.generate(
      9,
      (index) => _item(
        cardKind: 'curated_top_read',
        attestation: _attestation(
          candidate: 'feed-$index',
          canonical: 'story:canonical-$index',
          slot: index,
        ),
      ),
    );
    final summary = mapper.readerSummaryToDomain(
      readerSummaryApiDto(
        bindPromotionAttestations: false,
        content: readerSummaryContentApiDto(topReads: topReads),
      ),
    );

    expect(summary.content.topReads, isEmpty);
    expect(summary.content.selectedPosts, isEmpty);
  });
}

ReaderPostPromotionAttestationApiDto _attestation({
  required String candidate,
  String canonical = 'story:canonical',
  String placement = 'top',
  int slot = 0,
}) => ReaderPostPromotionAttestationApiDto(
  candidateId: candidate,
  canonicalIdentity: canonical,
  placement: placement,
  slot: slot,
  decision: placement == 'top' ? 'promote_top' : 'promote_additional',
  citationIds: const ['bc-1'],
);

TopReadApiDto _item({
  required String cardKind,
  ReaderPostPromotionAttestationApiDto? attestation,
}) => TopReadApiDto(
  storyClusterId: 'story:ai-coding-tools',
  cardKind: cardKind,
  promotionAttestation: attestation,
  title: 'Synthetic promoted story',
  providerKey: 'github-repo-radar',
  reason: 'Synthetic policy-authorized evidence.',
  confirmedProviderKeys: const ['github-repo-radar'],
  citationIds: const ['bc-1'],
  canonicalUrl: 'https://github.com/example/ai-coding-tools',
);
