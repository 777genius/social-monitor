import 'dart:convert';

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

  test(
    'preserves V2 Top and Additional order with native metrics separate',
    () {
      final attestations = _v2BoardAttestations();
      final summary = mapper.readerSummaryToDomain(
        readerSummaryApiDto(
          bindPromotionAttestations: false,
          content: readerSummaryContentApiDto(
            topReads: [
              _item(cardKind: 'curated_top_read', attestation: attestations[0]),
              _item(cardKind: 'curated_top_read', attestation: attestations[1]),
            ],
            selectedPosts: [
              _item(
                cardKind: 'additional_notable_story',
                attestation: attestations[2],
                signalScore: 0.91,
                providerMetrics: const [
                  ProviderMetricApiDto(label: 'Points', value: '250'),
                ],
              ),
              _item(
                cardKind: 'additional_notable_story',
                attestation: attestations[3],
              ),
            ],
          ),
        ),
      );

      expect(
        summary.content.topReads.map(
          (item) => item.promotionAttestation!.candidateId,
        ),
        ['top-1', 'top-2'],
      );
      expect(
        summary.content.selectedPosts.map(
          (item) => item.promotionAttestation!.candidateId,
        ),
        ['top-overflow-1', 'additional-1'],
      );
      final overflow = summary.content.selectedPosts.first;
      expect(overflow.cardKind, ReaderSummaryCardKind.additionalNotableStory);
      expect(overflow.signalScore.value, 0.91);
      expect(overflow.providerMetrics.single.label, 'Points');
      expect(overflow.providerMetrics.single.value, '250');
      expect(overflow.promotionAttestation!.scoreComponents!.total, 0.99);
    },
  );

  test('atomically rejects a V2 slate order that differs from card order', () {
    final attestations = _v2BoardAttestations(
      slateOrder: const ['top-2', 'top-1', 'top-overflow-1', 'additional-1'],
    );
    final summary = mapper.readerSummaryToDomain(
      readerSummaryApiDto(
        bindPromotionAttestations: false,
        content: readerSummaryContentApiDto(
          topReads: [
            _item(cardKind: 'curated_top_read', attestation: attestations[0]),
            _item(cardKind: 'curated_top_read', attestation: attestations[1]),
          ],
          selectedPosts: [
            _item(
              cardKind: 'additional_notable_story',
              attestation: attestations[2],
            ),
            _item(
              cardKind: 'additional_notable_story',
              attestation: attestations[3],
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
}

List<ReaderPostPromotionAttestationApiDto> _v2BoardAttestations({
  List<String> slateOrder = const [
    'top-1',
    'top-2',
    'top-overflow-1',
    'additional-1',
  ],
}) {
  const candidates = <({String id, String placement, int slot, double total})>[
    (id: 'top-1', placement: 'top', slot: 1, total: 0.88),
    (id: 'top-2', placement: 'top', slot: 2, total: 0.84),
    (id: 'top-overflow-1', placement: 'additional', slot: 1, total: 0.99),
    (id: 'additional-1', placement: 'additional', slot: 2, total: 0.72),
  ];
  final byId = {for (final item in candidates) item.id: item};
  final entryInputs = {
    for (final item in candidates) item.id: 'entry:${item.id}',
  };
  final slateDigestInput = jsonEncode({
    'policyVersion': 'reader_promotion_policy.v2',
    'sourceWindow': {
      'windowId': 'window-1',
      'startedAt': '2026-08-18T00:00:00.000Z',
      'endedAt': '2026-08-18T23:00:00.000Z',
      'periodStartedAt': '2026-08-18T00:00:00.000Z',
      'periodEndedAt': '2026-08-19T00:00:00.000Z',
      'ingestionCutoff': '2026-08-18T23:00:00.000Z',
    },
    'orderedCandidateIds': slateOrder,
    'orderedCanonicalIdentities': [for (final id in slateOrder) 'story:$id'],
    'digestInputs': [for (final id in slateOrder) entryInputs[id]],
  });
  const score = ReaderPostPromotionScoreComponentsApiDto(
    engagementSalience: 1,
    relevance: 1,
    evidenceQuality: 1,
    integrity: 1,
    freshness: 1,
    weightedEngagement: 0.4,
    weightedRelevance: 0.3,
    weightedEvidenceQuality: 0.15,
    weightedIntegrity: 0.1,
    weightedFreshness: 0.04,
    total: 0.99,
  );
  return candidates
      .map((item) {
        final authoritative = byId[item.id]!;
        return ReaderPostPromotionAttestationApiDto(
          schemaVersion: 'reader_post_promotion_attestation.v2',
          policyVersion: 'reader_post_promotion.v2',
          candidateId: item.id,
          canonicalIdentity: 'story:${item.id}',
          placement: authoritative.placement,
          slot: authoritative.slot,
          decision: authoritative.placement == 'top'
              ? 'promote_top'
              : 'promote_additional',
          citationIds: const ['bc-1'],
          storyClusterId: 'story:ai-coding-tools',
          scoreComponents: score,
          reasonCodes: const ['reader_promotion_v2_admitted'],
          candidateDigestInput: 'candidate:${item.id}',
          slateEntryDigestInput: entryInputs[item.id],
          slateDigestInput: slateDigestInput,
          slateDigest: 'a' * 64,
          evidenceLineage: ReaderPostPromotionEvidenceLineageApiDto(
            leadCandidateId: item.id,
            leadCitationId: 'bc-1',
            supportCandidateIds: const [],
            supportCitationIds: const [],
            citationIds: const ['bc-1'],
          ),
        );
      })
      .toList(growable: false);
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
  double signalScore = 0,
  List<ProviderMetricApiDto> providerMetrics = const [],
}) => TopReadApiDto(
  storyClusterId: 'story:ai-coding-tools',
  cardKind: cardKind,
  promotionAttestation: attestation,
  title: 'Synthetic promoted story',
  providerKey: 'github-repo-radar',
  reason: 'Synthetic policy-authorized evidence.',
  confirmedProviderKeys: const ['github-repo-radar'],
  signalScore: signalScore,
  providerMetrics: providerMetrics,
  citationIds: const ['bc-1'],
  canonicalUrl: 'https://github.com/example/ai-coding-tools',
);
