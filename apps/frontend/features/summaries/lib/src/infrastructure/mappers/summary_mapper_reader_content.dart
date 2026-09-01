part of 'summary_mapper.dart';

extension on SummaryMapper {
  ReaderSummaryContent _readerSummaryContentToDomain(
    ReaderSummaryContentApiDto dto,
    Set<String> storyClusterIds,
    Map<String, ReaderSummaryStoryClusterAuthorityApiDto>
    storyClusterAuthorities,
    Map<String, SummaryCitationApiDto> citationsById,
  ) {
    final readerItems = [
      ...dto.topReads,
      ...dto.selectedPosts,
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
    final promotionBoardValid = _validPromotionBoard(
      mappedTopReads,
      mappedSelectedPosts,
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
      promotionBoardAvailability: promotionBoardValid
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

bool _validPromotionBoard(List<TopRead> topReads, List<TopRead> selectedPosts) {
  if (topReads.length > 8 || selectedPosts.length > 8) return false;
  final all = [...topReads, ...selectedPosts];
  final attestations = all
      .map((item) => item.promotionAttestation)
      .whereType<ReaderPostPromotionAttestation>()
      .toList(growable: false);
  if (attestations.length != all.length ||
      attestations.map((value) => value.candidateId).toSet().length !=
          all.length ||
      attestations.map((value) => value.canonicalIdentity).toSet().length !=
          all.length ||
      (attestations.any((value) => value.isV2) &&
          !attestations.every((value) => value.isV2)) ||
      (attestations.isNotEmpty &&
          attestations.every((value) => value.isV2) &&
          !_validV2PromotionSlate(attestations))) {
    return false;
  }
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
        attestation.slot == index + (attestation.isV2 ? 1 : 0) &&
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
      );
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

SummaryReliabilityReport _summaryReliabilityToDomain(
  SummaryMapper mapper,
  SummaryReliabilityReportApiDto dto,
) {
  return SummaryReliabilityReport(
    mode: mapper._nonEmpty(dto.mode, fallback: 'shadow'),
    policyVersion: mapper._nonEmpty(
      dto.policyVersion,
      fallback: 'reader_summary_reliability_shadow_v1',
    ),
    riskLevel: mapper._readerItemConfidenceLevel(dto.riskLevel),
    riskScore: mapper._boundedScore(dto.riskScore),
    risks: dto.risks
        .map(
          (risk) => SummaryReliabilityRisk(
            kind: mapper._nonEmpty(
              risk.kind,
              fallback: 'low_evidence_diversity',
            ),
            level: mapper._readerItemConfidenceLevel(risk.level),
            score: mapper._boundedScore(risk.score),
            description: mapper._safeText(
              risk.description,
              fallback: 'Evidence quality needs review.',
            ),
          ),
        )
        .toList(growable: false),
  );
}

SummaryClaim _summaryClaimToDomain(
  SummaryMapper mapper,
  SummaryClaimApiDto dto,
) {
  return SummaryClaim(
    id: mapper._nonEmptyOrNull(dto.id),
    claim: mapper._safeText(dto.claim, fallback: 'Unlabeled claim'),
    evidence: dto.evidence
        .map(
          (evidence) => SummaryClaimEvidence(
            title: mapper._safeText(evidence.title, fallback: dto.claim),
            providerKey: mapper._nonEmpty(
              evidence.providerKey,
              fallback: 'unknown',
            ),
            citationId: mapper._nonEmpty(
              evidence.citationId,
              fallback: 'unknown',
            ),
            canonicalUrl: mapper._safeUrl(evidence.canonicalUrl),
          ),
        )
        .toList(growable: false),
    confidence: TopReadConfidence(
      level: mapper._readerItemConfidenceLevel(dto.confidence.level),
      score: mapper._boundedScore(dto.confidence.score),
      rationale: mapper._safeText(
        dto.confidence.rationale,
        fallback: 'Confidence inferred from cited evidence.',
      ),
    ),
    risks: dto.risks
        .map(
          (risk) => SummaryClaimRisk(
            kind: mapper._nonEmpty(risk.kind, fallback: 'unresolved'),
            description: mapper._safeText(
              risk.description,
              fallback: 'Needs confirmation.',
            ),
          ),
        )
        .toList(growable: false),
    citationIds: mapper._safeTextList(dto.citationIds),
  );
}
