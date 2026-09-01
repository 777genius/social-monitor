part of 'summary_mapper.dart';

extension on SummaryMapper {
  ReaderInterestSection _interestSectionToDomain(
    ReaderInterestSectionApiDto dto, {
    required _ReaderItemContext context,
  }) {
    return ReaderInterestSection(
      interestId: _nonEmptyOrNull(dto.interestId),
      title: _nonEmpty(dto.title, fallback: 'Interest signal'),
      insight: _safeText(
        dto.insight,
        fallback: 'No interest insight available',
      ),
      items: dto.items
          .map((item) => _readerItemToDomain(item, context: context))
          .where((item) => item.cardKind != ReaderSummaryCardKind.unsupported)
          .toList(growable: false),
      citationIds: dto.citationIds,
    );
  }

  TopRead _readerItemToDomain(
    TopReadApiDto dto, {
    required _ReaderItemContext context,
  }) {
    final storyClusterId = _nonEmptyOrNull(dto.storyClusterId);
    final explicitCardKind = switch (dto.cardKind?.trim().toLowerCase()) {
      'curated_top_read' => ReaderSummaryCardKind.curatedTopRead,
      'additional_notable_story' =>
        ReaderSummaryCardKind.additionalNotableStory,
      'related_topic' => ReaderSummaryCardKind.relatedTopic,
      'supplemental_trend' => ReaderSummaryCardKind.unsupported,
      'unsupported' => ReaderSummaryCardKind.unsupported,
      _ => null,
    };
    final relationId = _nonEmptyOrNull(dto.relationId);
    final targetStoryClusterId = _nonEmptyOrNull(dto.targetStoryClusterId);
    final relationIdentity = _parseReaderSummaryRelatedTopicIdentity(
      relationId,
    );
    final subjectCitation = dto.citationIds.length == 1
        ? context.citationsById[dto.citationIds.single]
        : null;
    final subjectAuthority = storyClusterId == null
        ? null
        : context.storyClusterAuthorities[storyClusterId];
    final targetAuthority = targetStoryClusterId == null
        ? null
        : context.storyClusterAuthorities[targetStoryClusterId];
    final clusterCardIsValid = _hasCanonicalClusterCardAuthority(
      dto,
      storyClusterId,
      context,
    );
    final relatedTopicIsValid =
        explicitCardKind == ReaderSummaryCardKind.relatedTopic &&
        storyClusterId != null &&
        relationId != null &&
        targetStoryClusterId != null &&
        storyClusterId != targetStoryClusterId &&
        context.storyClusterIds.contains(storyClusterId) &&
        context.storyClusterIds.contains(targetStoryClusterId) &&
        !context.duplicateRelationIds.contains(relationId) &&
        relationIdentity != null &&
        !context.duplicateCanonicalRelationIds.contains(
          relationIdentity.canonicalRelationId,
        ) &&
        relationIdentity.subjectProviderKey ==
            dto.providerKey.trim().toLowerCase() &&
        subjectCitation != null &&
        subjectAuthority != null &&
        targetAuthority != null &&
        subjectAuthority.feedItemIds.contains(subjectCitation.feedItemId) &&
        subjectAuthority.providerKeys.any(
          (provider) =>
              provider.trim().toLowerCase() ==
              relationIdentity.subjectProviderKey,
        ) &&
        subjectCitation.providerKey?.trim().toLowerCase() ==
            relationIdentity.subjectProviderKey &&
        subjectCitation.sourceItemId.trim() ==
            relationIdentity.subjectSourceItemId &&
        context.citationsById.values.any(
          (citation) =>
              targetAuthority.feedItemIds.contains(citation.feedItemId) &&
              targetAuthority.providerKeys.any(
                (provider) =>
                    provider.trim().toLowerCase() ==
                    relationIdentity.officialAnchorProviderKey,
              ) &&
              citation.providerKey?.trim().toLowerCase() ==
                  relationIdentity.officialAnchorProviderKey &&
              citation.sourceItemId.trim() ==
                  relationIdentity.officialAnchorSourceItemId,
        ) &&
        dto.canonicalUrl != null &&
        subjectCitation.canonicalUrl?.trim() == dto.canonicalUrl!.trim();
    final hasUnexpectedRelationMetadata =
        explicitCardKind != ReaderSummaryCardKind.relatedTopic &&
        (relationId != null || targetStoryClusterId != null);
    final promotionAttestation = _promotionAttestationToDomain(
      dto.promotionAttestation,
      explicitCardKind,
    );
    final promotionCardIsValid =
        promotionAttestation != null &&
        (!promotionAttestation.isV2 ||
            promotionAttestation.storyClusterId == storyClusterId) &&
        _sameOrderedReaderCitationIds(
          promotionAttestation.citationIds,
          dto.citationIds,
        );

    return TopRead(
      storyClusterId: storyClusterId,
      cardKind: switch (explicitCardKind) {
        ReaderSummaryCardKind.relatedTopic =>
          relatedTopicIsValid
              ? ReaderSummaryCardKind.relatedTopic
              : ReaderSummaryCardKind.unsupported,
        ReaderSummaryCardKind.additionalNotableStory =>
          clusterCardIsValid &&
                  !hasUnexpectedRelationMetadata &&
                  promotionCardIsValid
              ? ReaderSummaryCardKind.additionalNotableStory
              : ReaderSummaryCardKind.unsupported,
        ReaderSummaryCardKind.curatedTopRead =>
          clusterCardIsValid &&
                  !hasUnexpectedRelationMetadata &&
                  promotionCardIsValid
              ? ReaderSummaryCardKind.curatedTopRead
              : ReaderSummaryCardKind.unsupported,
        ReaderSummaryCardKind.supplementalTrend =>
          ReaderSummaryCardKind.unsupported,
        _ => ReaderSummaryCardKind.unsupported,
      },
      relationId: relatedTopicIsValid ? relationId : null,
      targetStoryClusterId: relatedTopicIsValid ? targetStoryClusterId : null,
      promotionAttestation: promotionAttestation,
      title: _nonEmpty(dto.title, fallback: 'Untitled item'),
      providerKey: _nonEmpty(dto.providerKey, fallback: 'unknown'),
      reason: _safeText(
        dto.reason,
        fallback: 'Selected as relevant evidence',
        maxLength: 720,
      ),
      matchedInterestIds: _safeTextList(dto.matchedInterestIds),
      matchedRules: _safeTextList(dto.matchedRules),
      signalScore: SignalScore.normalized(dto.signalScore),
      confidence: TopReadConfidence(
        level: _readerItemConfidenceLevel(dto.confidence.level),
        score: dto.confidence.score < 0
            ? 0
            : dto.confidence.score > 1
            ? 1
            : dto.confidence.score,
        rationale: _safeText(
          dto.confidence.rationale,
          fallback:
              'This story has not been independently confirmed across monitored source groups yet.',
        ),
      ),
      confirmedProviderKeys: _safeTextList(dto.confirmedProviderKeys),
      providerMetrics: dto.providerMetrics
          .map(
            (metric) => ProviderMetric(
              label: _nonEmpty(metric.label, fallback: 'Metric'),
              value: _nonEmpty(metric.value, fallback: '0'),
            ),
          )
          .toList(growable: false),
      whyImportant: _safeTextList(dto.whyImportant, maxLength: 720),
      whyNow: _safeText(
        dto.whyNow,
        fallback: 'Selected in the current summary window',
      ),
      publishedAt: dto.publishedAt,
      citationIds: dto.citationIds,
      canonicalUrl: _safeUrl(dto.canonicalUrl),
      previewMedia: _previewMediaToDomain(dto.previewMedia),
    );
  }

  ReaderPostPromotionAttestation? _promotionAttestationToDomain(
    ReaderPostPromotionAttestationApiDto? dto,
    ReaderSummaryCardKind? cardKind,
  ) {
    if (dto == null) {
      return null;
    }
    final placement = switch (dto.placement) {
      'top' => ReaderPostPromotionPlacement.top,
      'additional' => ReaderPostPromotionPlacement.additional,
      _ => null,
    };
    if (placement == null ||
        (placement == ReaderPostPromotionPlacement.top &&
            cardKind != ReaderSummaryCardKind.curatedTopRead) ||
        (placement == ReaderPostPromotionPlacement.additional &&
            cardKind != ReaderSummaryCardKind.additionalNotableStory)) {
      return null;
    }
    final attestation = ReaderPostPromotionAttestation(
      schemaVersion: dto.schemaVersion,
      policyVersion: dto.policyVersion,
      candidateId: dto.candidateId,
      canonicalIdentity: dto.canonicalIdentity,
      placement: placement,
      slot: dto.slot,
      decision: dto.decision,
      citationIds: List.unmodifiable(dto.citationIds),
      storyClusterId: dto.storyClusterId,
      scoreComponents: switch (dto.scoreComponents) {
        null => null,
        final value => ReaderPostPromotionScoreComponents(
          engagementSalience: value.engagementSalience,
          relevance: value.relevance,
          evidenceQuality: value.evidenceQuality,
          integrity: value.integrity,
          freshness: value.freshness,
          weightedEngagement: value.weightedEngagement,
          weightedRelevance: value.weightedRelevance,
          weightedEvidenceQuality: value.weightedEvidenceQuality,
          weightedIntegrity: value.weightedIntegrity,
          weightedFreshness: value.weightedFreshness,
          total: value.total,
        ),
      },
      reasonCodes: List.unmodifiable(dto.reasonCodes),
      candidateDigestInput: dto.candidateDigestInput,
      slateEntryDigestInput: dto.slateEntryDigestInput,
      slateDigestInput: dto.slateDigestInput,
      slateDigest: dto.slateDigest,
      evidenceLineage: switch (dto.evidenceLineage) {
        null => null,
        final value => ReaderPostPromotionEvidenceLineage(
          leadCandidateId: value.leadCandidateId,
          leadCitationId: value.leadCitationId,
          supportCandidateIds: List.unmodifiable(value.supportCandidateIds),
          supportCitationIds: List.unmodifiable(value.supportCitationIds),
          citationIds: List.unmodifiable(value.citationIds),
        ),
      },
    );
    return attestation;
  }
}

bool _sameOrderedReaderCitationIds(List<String> left, List<String> right) =>
    left.length == right.length &&
    List.generate(
      left.length,
      (index) => index,
    ).every((index) => left[index] == right[index]);
