part of 'summary_mapper.dart';

extension on SummaryMapper {
  ReaderSummaryContent _readerSummaryContentToDomain(
    ReaderSummaryContentApiDto dto,
    Set<String> storyClusterIds,
    Map<String, ReaderSummaryStoryClusterAuthorityApiDto>
    storyClusterAuthorities,
    Map<String, SummaryCitationApiDto> citationsById, {
    required bool rankingPolicyChanged,
  }) {
    final readerItems = [
      ...dto.topReads,
      ...dto.selectedPosts,
      ...dto.newsWithoutRatingPosts,
      ...dto.interestSections.expand((section) => section.items),
    ];
    final relationIds = readerItems
        .expand(
          (item) => item.relationMarkerIds.isEmpty
              ? [item.relationId ?? '']
              : item.relationMarkerIds,
        )
        .map((id) => id.trim())
        .where((id) => id.isNotEmpty)
        .toList(growable: false);
    final relationIdCounts = <String, int>{};
    for (final relationId in relationIds) {
      relationIdCounts.update(
        relationId,
        (count) => count + 1,
        ifAbsent: () => 1,
      );
    }
    final duplicateRelationIds = relationIdCounts.entries
        .where((entry) => entry.value > 1)
        .map((entry) => entry.key)
        .toSet();
    final rawRelationIdsByCanonicalId = <String, Set<String>>{};
    for (final relationId in relationIds) {
      final identity = _normalizeReaderSummaryRelatedTopicIdentity(relationId);
      if (identity == null) {
        continue;
      }
      rawRelationIdsByCanonicalId
          .putIfAbsent(identity.canonicalRelationId, () => <String>{})
          .add(relationId);
    }
    final duplicateCanonicalRelationIds = rawRelationIdsByCanonicalId.entries
        .where((entry) => entry.value.length > 1)
        .map((entry) => entry.key)
        .toSet();
    final topReadContext = _ReaderItemContext(
      _ReaderItemKind.topRead,
      storyClusterIds,
      duplicateRelationIds,
      duplicateCanonicalRelationIds,
      storyClusterAuthorities,
      citationsById,
    );
    final selectedPostContext = _ReaderItemContext(
      _ReaderItemKind.selectedPost,
      storyClusterIds,
      duplicateRelationIds,
      duplicateCanonicalRelationIds,
      storyClusterAuthorities,
      citationsById,
    );
    final newsPostContext = _ReaderItemContext(
      _ReaderItemKind.newsPost,
      storyClusterIds,
      duplicateRelationIds,
      duplicateCanonicalRelationIds,
      storyClusterAuthorities,
      citationsById,
    );
    final interestSectionContext = _ReaderItemContext(
      _ReaderItemKind.interestSection,
      storyClusterIds,
      duplicateRelationIds,
      duplicateCanonicalRelationIds,
      storyClusterAuthorities,
      citationsById,
    );
    final mappedTopReads = dto.topReads
        .map((item) => _readerItemToDomain(item, context: topReadContext))
        .toList(growable: false);
    final mappedSelectedPosts = dto.selectedPosts
        .map((item) => _readerItemToDomain(item, context: selectedPostContext))
        .toList(growable: false);
    final mappedNewsPosts = dto.newsWithoutRatingPosts
        .map((item) => _readerItemToDomain(item, context: newsPostContext))
        .toList(growable: false);
    // A day ranked under an older policy stamp is served with all boards
    // withheld; it is outdated, not broken, and reads as "rebuild required".
    final boardWithheldForRebuild =
        rankingPolicyChanged &&
        dto.topReads.isEmpty &&
        dto.selectedPosts.isEmpty &&
        dto.newsWithoutRatingPosts.isEmpty;
    final promotionBoardValid = _validPromotionBoard(
      mappedTopReads,
      mappedSelectedPosts,
      mappedNewsPosts,
      authoritativeStoryClusterIds: storyClusterIds,
      hasReaderItems: readerItems.isNotEmpty,
      hasCitations: citationsById.isNotEmpty,
      noSignal:
          dto.qualityState.status == 'no_signal' ||
          dto.qualityState.flags.contains('no_signal'),
    );
    return ReaderSummaryContent(
      headline: _nonEmpty(dto.headline, fallback: 'Workspace summary'),
      oneLineTakeaway: _safeLongText(
        dto.oneLineTakeaway,
        fallback: 'No summary takeaway available',
      ),
      bullets: _safeTextList(dto.bullets),
      narrativeSections: dto.narrativeSections
          .map(
            (section) => ReaderSummaryNarrativeSection(
              id: _nonEmpty(section.id, fallback: 'narrative-section'),
              kind: _narrativeSectionKind(section.kind),
              title: _safeText(section.title, fallback: 'Signal'),
              text: _safeLongText(
                section.text,
                fallback: 'No narrative detail available',
              ),
              citationIds: _safeTextList(section.citationIds),
              storyClusterId: _nonEmptyOrNull(section.storyClusterId),
            ),
          )
          .toList(growable: false),
      mainTopics: _safeTextList(dto.mainTopics),
      topicMap: _topicMapToDomain(this, dto.topicMap),
      qualityState: ReaderSummaryQualityState(
        status: _nonEmpty(dto.qualityState.status, fallback: 'ready'),
        flags: _safeTextList(dto.qualityState.flags),
        warnings: _safeTextList(dto.qualityState.warnings),
        isSingleSource: dto.qualityState.isSingleSource,
      ),
      interestSections: dto.interestSections
          .map(
            (section) => _interestSectionToDomain(
              section,
              context: interestSectionContext,
            ),
          )
          .toList(growable: false),
      sourceMix: dto.sourceMix.map(_sourceMixToDomain).toList(growable: false),
      topReads: promotionBoardValid ? mappedTopReads : const [],
      selectedPosts: promotionBoardValid ? mappedSelectedPosts : const [],
      newsWithoutRatingPosts: promotionBoardValid ? mappedNewsPosts : const [],
      promotionBoardAvailability: boardWithheldForRebuild
          ? ReaderSummaryPromotionBoardAvailability.rebuildRequired
          : promotionBoardValid
          ? ReaderSummaryPromotionBoardAvailability.available
          : ReaderSummaryPromotionBoardAvailability.unavailable,
      claimBoard: dto.claimBoard
          .map((claim) => _summaryClaimToDomain(this, claim))
          .toList(growable: false),
      reliabilityReport: _summaryReliabilityToDomain(
        this,
        dto.reliabilityReport,
      ),
      trendDelta: ReaderTrendDelta(
        newSignals: _safeTextList(dto.trendDelta.newSignals),
        growingSignals: _safeTextList(dto.trendDelta.growingSignals),
        repeatedSignals: _safeTextList(dto.trendDelta.repeatedSignals),
        fadingSignals: _safeTextList(dto.trendDelta.fadingSignals),
      ),
      openQuestions: _safeTextList(dto.openQuestions),
      risks: _safeTextList(dto.risks),
      nextActions: dto.nextActions
          .map(_nextActionToDomain)
          .toList(growable: false),
    );
  }
}

bool _validPromotionBoard(
  List<TopRead> topReads,
  List<TopRead> selectedPosts,
  List<TopRead> newsPosts, {
  required Set<String> authoritativeStoryClusterIds,
  required bool hasReaderItems,
  required bool hasCitations,
  required bool noSignal,
}) {
  final all = [...topReads, ...selectedPosts, ...newsPosts];
  if (all.isEmpty) {
    return noSignal &&
        !hasReaderItems &&
        !hasCitations &&
        authoritativeStoryClusterIds.isEmpty;
  }
  final attestations = all
      .map((item) => item.promotionAttestation)
      .whereType<ReaderPostPromotionAttestation>()
      .toList(growable: false);
  final schemaVersions = attestations
      .map((value) => value.schemaVersion)
      .toSet();
  if (attestations.length != all.length ||
      attestations.map((value) => value.candidateId).toSet().length !=
          all.length ||
      attestations.map((value) => value.canonicalIdentity).toSet().length !=
          all.length ||
      schemaVersions.length != 1 ||
      schemaVersions.any(
        (value) => !const {
          'reader_post_promotion_attestation.v1',
          'reader_post_promotion_attestation.v2',
          'reader_post_promotion_attestation.v3',
        }.contains(value),
      )) {
    return false;
  }
  final isV3 = attestations.first.isV3;
  final boardIsValid = isV3
      ? _validV3PromotionBoard(
          topReads,
          selectedPosts,
          newsPosts,
          authoritativeStoryClusterIds,
        )
      // Legacy V1/V2 boards keep their 12 + 12 shape and have no news block.
      : newsPosts.isEmpty &&
            topReads.length <= 12 &&
            selectedPosts.length <= 12 &&
            (!attestations.every((value) => value.isV2) ||
                _validV2PromotionSlate(attestations));
  if (!boardIsValid) return false;
  bool laneIsExact(
    List<TopRead> items,
    ReaderSummaryCardKind cardKind,
    ReaderPostPromotionPlacement placement,
    String decision,
  ) => List.generate(items.length, (index) => index).every((index) {
    final item = items[index];
    final attestation = item.promotionAttestation;
    return item.cardKind == cardKind &&
        attestation != null &&
        attestation.placement == placement &&
        attestation.slot ==
            index + (attestation.isV2 || attestation.isV3 ? 1 : 0) &&
        attestation.decision == decision;
  });
  return laneIsExact(
        topReads,
        ReaderSummaryCardKind.curatedTopRead,
        ReaderPostPromotionPlacement.top,
        'promote_top',
      ) &&
      laneIsExact(
        selectedPosts,
        ReaderSummaryCardKind.additionalNotableStory,
        ReaderPostPromotionPlacement.additional,
        'promote_additional',
      ) &&
      laneIsExact(
        newsPosts,
        ReaderSummaryCardKind.newsWithoutRating,
        ReaderPostPromotionPlacement.news,
        'promote_news',
      );
}

/// V3 board: the domain policy recomputes sizes, order, uniqueness and
/// cohorts from the signed comparators; the story clusters of the artifact
/// must list exactly the shown stories, Top then Show more then news.
bool _validV3PromotionBoard(
  List<TopRead> topReads,
  List<TopRead> selectedPosts,
  List<TopRead> newsPosts,
  Set<String> authoritativeStoryClusterIds,
) {
  List<ReaderPromotionBoardEntry>? lane(List<TopRead> items) {
    final entries = <ReaderPromotionBoardEntry>[];
    for (final item in items) {
      final attestation = item.promotionAttestation!;
      final comparator = attestation.comparator;
      final storyId = attestation.storyId;
      if (comparator == null ||
          storyId == null ||
          attestation.providerKey == null ||
          attestation.exactPublishedAt == null ||
          attestation.assessment == null ||
          attestation.presentation == null) {
        return null;
      }
      entries.add(
        ReaderPromotionBoardEntry(storyId: storyId, comparator: comparator),
      );
    }
    return entries;
  }

  final top = lane(topReads);
  final additional = lane(selectedPosts);
  final news = lane(newsPosts);
  if (top == null ||
      additional == null ||
      news == null ||
      !readerPromotionBoardIsConsistent(
        top: top,
        additional: additional,
        news: news,
      )) {
    return false;
  }
  final orderedStoryIds = [
    for (final entry in [...top, ...additional, ...news]) entry.storyId,
  ];
  final authoritativeOrder = authoritativeStoryClusterIds.toList(
    growable: false,
  );
  return orderedStoryIds.length == authoritativeOrder.length &&
      List.generate(
        orderedStoryIds.length,
        (index) => index,
      ).every((index) => orderedStoryIds[index] == authoritativeOrder[index]);
}

bool _validV2PromotionSlate(List<ReaderPostPromotionAttestation> attestations) {
  if (attestations.isEmpty ||
      attestations.any(
        (value) =>
            value.policyVersion != 'reader_post_promotion.v2' ||
            value.slateDigestInput == null ||
            value.slateEntryDigestInput == null ||
            value.slateDigest == null,
      ) ||
      attestations.map((value) => value.slateDigestInput).toSet().length != 1 ||
      attestations.map((value) => value.slateDigest).toSet().length != 1) {
    return false;
  }
  final Object? decoded;
  try {
    decoded = jsonDecode(attestations.first.slateDigestInput!);
  } on FormatException {
    return false;
  }
  if (decoded is! Map<String, Object?> ||
      decoded.keys.toSet().difference(const {
        'policyVersion',
        'sourceWindow',
        'orderedCandidateIds',
        'orderedCanonicalIdentities',
        'digestInputs',
      }).isNotEmpty ||
      decoded.length != 5 ||
      decoded['policyVersion'] != 'reader_promotion_policy.v2') {
    return false;
  }
  final candidateIds = decoded['orderedCandidateIds'];
  final canonicalIdentities = decoded['orderedCanonicalIdentities'];
  final digestInputs = decoded['digestInputs'];
  return candidateIds is List<Object?> &&
      canonicalIdentities is List<Object?> &&
      digestInputs is List<Object?> &&
      candidateIds.every((value) => value is String) &&
      canonicalIdentities.every((value) => value is String) &&
      digestInputs.every((value) => value is String) &&
      _sameOrderedReaderCitationIds(
        candidateIds.cast<String>(),
        attestations.map((value) => value.candidateId).toList(),
      ) &&
      _sameOrderedReaderCitationIds(
        canonicalIdentities.cast<String>(),
        attestations.map((value) => value.canonicalIdentity).toList(),
      ) &&
      _sameOrderedReaderCitationIds(
        digestInputs.cast<String>(),
        attestations.map((value) => value.slateEntryDigestInput!).toList(),
      );
}
