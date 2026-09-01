import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;

import '../api/summary_api_dto.dart';
import 'reader_post_promotion_attestation_rest_mapper.dart';
import 'reader_summary_artifact_binding.dart';
import 'reader_summary_reserved_marker.dart';

final class ReaderSummaryContentRestMapper {
  const ReaderSummaryContentRestMapper();

  ReaderSummaryContentApiDto map(
    generated.ReaderSummaryReaderBriefDto dto, {
    required ReaderSummaryArtifactBinding binding,
  }) {
    return ReaderSummaryContentApiDto(
      headline: dto.headline,
      oneLineTakeaway: dto.oneLineTakeaway,
      bullets: dto.bullets,
      narrativeSections: dto.narrativeSections
          .map(
            (section) => ReaderSummaryNarrativeSectionApiDto(
              id: section.id,
              kind: section.kind.json ?? 'lead',
              title: section.title,
              text: section.text,
              citationIds: section.citationIds,
              storyClusterId: section.storyClusterId,
            ),
          )
          .toList(growable: false),
      mainTopics: dto.mainTopics,
      topicMap: _topicMap(dto.topicMap),
      qualityState: ReaderSummaryQualityStateApiDto(
        status: dto.qualityState.status.json ?? 'ready',
        flags: dto.qualityState.flags
            .map((flag) => flag.json ?? 'unknown')
            .where((flag) => flag != 'unknown')
            .toList(growable: false),
        warnings: dto.qualityState.warnings,
        isSingleSource: dto.qualityState.isSingleSource,
      ),
      interestSections: dto.interestSections
          .map((section) => _interestSection(section, binding))
          .toList(growable: false),
      sourceMix: dto.sourceMix.map(_sourceMixEntry).toList(growable: false),
      topReads: dto.topReads
          .map((item) => _readerItem(item, binding))
          .toList(growable: false),
      selectedPosts: dto.selectedPosts
          .map((item) => _readerItem(item, binding))
          .toList(growable: false),
      claimBoard: dto.claimBoard.map(_claim).toList(growable: false),
      reliabilityReport: _reliabilityReport(dto.reliabilityReport),
      trendDelta: ReaderTrendDeltaApiDto(
        newSignals: dto.trendDelta.newSignals,
        growingSignals: dto.trendDelta.growingSignals,
        repeatedSignals: dto.trendDelta.repeatedSignals,
        fadingSignals: dto.trendDelta.fadingSignals,
      ),
      openQuestions: dto.openQuestions,
      risks: dto.risks,
      nextActions: dto.nextActions.map(_nextAction).toList(growable: false),
    );
  }

  ReaderSummaryTopicMapApiDto _topicMap(
    generated.ReaderSummaryTopicMapDto dto,
  ) {
    return ReaderSummaryTopicMapApiDto(
      generatedBy: dto.generatedBy.json ?? 'deterministic',
      confidence: _topicMapConfidence(dto.confidence),
      nodes: dto.nodes.map(_topicMapNode).toList(growable: false),
      groups: dto.groups.map(_topicMapGroup).toList(growable: false),
      edges: dto.edges.map(_topicMapEdge).toList(growable: false),
      warnings: dto.warnings,
    );
  }

  ReaderSummaryTopicMapConfidenceApiDto _topicMapConfidence(
    generated.ReaderSummaryTopicMapConfidenceDto dto,
  ) {
    return ReaderSummaryTopicMapConfidenceApiDto(
      level: dto.level.json ?? 'low',
      score: _safeConfidenceScore(dto.score),
      rationale: dto.rationale,
    );
  }

  ReaderSummaryTopicMapNodeApiDto _topicMapNode(
    generated.ReaderSummaryTopicMapNodeDto dto,
  ) {
    return ReaderSummaryTopicMapNodeApiDto(
      id: dto.id,
      label: dto.label,
      groupId: dto.groupId,
      storyClusterIds: dto.storyClusterIds,
      popularityScore: _safeScore(dto.popularityScore),
      sizeWeight: _safeConfidenceScore(dto.sizeWeight),
      evidenceCount: _safeCount(dto.evidenceCount),
      providerKeys: dto.providerKeys,
      interestIds: dto.interestIds,
      citationIds: dto.citationIds,
      keywords: dto.keywords,
      rationale: dto.rationale,
    );
  }

  ReaderSummaryTopicMapGroupApiDto _topicMapGroup(
    generated.ReaderSummaryTopicMapGroupDto dto,
  ) {
    return ReaderSummaryTopicMapGroupApiDto(
      id: dto.id,
      label: dto.label,
      colorKey: dto.colorKey,
      nodeIds: dto.nodeIds,
      confidence: _topicMapConfidence(dto.confidence),
    );
  }

  ReaderSummaryTopicMapEdgeApiDto _topicMapEdge(
    generated.ReaderSummaryTopicMapEdgeDto dto,
  ) {
    return ReaderSummaryTopicMapEdgeApiDto(
      sourceNodeId: dto.sourceNodeId,
      targetNodeId: dto.targetNodeId,
      weight: _safeConfidenceScore(dto.weight),
      reason: dto.reason,
    );
  }

  SummaryReliabilityReportApiDto _reliabilityReport(
    generated.ReaderSummaryReliabilityReportDto dto,
  ) {
    return SummaryReliabilityReportApiDto(
      mode: dto.mode.json ?? 'shadow',
      policyVersion: dto.policyVersion,
      riskLevel: dto.riskLevel.json ?? 'low',
      riskScore: _safeConfidenceScore(dto.riskScore),
      risks: dto.risks
          .map(
            (risk) => SummaryReliabilityRiskApiDto(
              kind: risk.kind.json ?? 'low_evidence_diversity',
              level: risk.level.json ?? 'low',
              score: _safeConfidenceScore(risk.score),
              description: risk.description,
            ),
          )
          .toList(growable: false),
    );
  }

  SummaryClaimApiDto _claim(generated.ReaderSummaryClaimDto dto) {
    return SummaryClaimApiDto(
      id: dto.id,
      claim: dto.claim,
      evidence: dto.evidence
          .map(
            (evidence) => SummaryClaimEvidenceApiDto(
              title: evidence.title,
              providerKey: evidence.providerKey,
              citationId: evidence.citationId,
              canonicalUrl: evidence.canonicalUrl,
            ),
          )
          .toList(growable: false),
      confidence: TopReadConfidenceApiDto(
        level: dto.confidence.level.json ?? 'low',
        score: _safeConfidenceScore(dto.confidence.score),
        rationale: dto.confidence.rationale,
      ),
      risks: dto.risks
          .map(
            (risk) => SummaryClaimRiskApiDto(
              kind: risk.kind.json ?? 'unresolved',
              description: risk.description,
            ),
          )
          .toList(growable: false),
      citationIds: dto.citationIds,
    );
  }

  ReaderInterestSectionApiDto _interestSection(
    generated.ReaderSummaryReaderInterestSectionDto dto,
    ReaderSummaryArtifactBinding binding,
  ) {
    return ReaderInterestSectionApiDto(
      interestId: dto.interestId,
      title: dto.title,
      insight: dto.insight,
      items: dto.items
          .map((item) => _readerItem(item, binding))
          .toList(growable: false),
      citationIds: dto.citationIds,
    );
  }

  TopReadApiDto _readerItem(
    generated.ReaderSummaryReaderItemDto dto,
    ReaderSummaryArtifactBinding binding,
  ) {
    final storyClusterMarker = _reservedMarker(
      dto.matchedRules,
      'reader-story-cluster:',
    );
    final cardKindMarker = _reservedMarker(
      dto.matchedRules,
      'reader-card-kind:',
    );
    final relationIdMarker = _reservedMarker(
      dto.matchedRules,
      'reader-related-topic-relation:',
    );
    final targetClusterMarker = _reservedMarker(
      dto.matchedRules,
      'reader-related-topic-target:',
    );
    final malformedMarkerSet =
        [
          storyClusterMarker,
          cardKindMarker,
          relationIdMarker,
          targetClusterMarker,
        ].any((marker) => marker.isPresent && !marker.isValid) ||
        (cardKindMarker.isPresent &&
            !_canonicalReaderCardKinds.contains(cardKindMarker.value)) ||
        (cardKindMarker.value == 'related_topic' &&
            (!storyClusterMarker.isValid ||
                !relationIdMarker.isValid ||
                !targetClusterMarker.isValid));

    return TopReadApiDto(
      storyClusterId: storyClusterMarker.value,
      cardKind: malformedMarkerSet ? 'unsupported' : cardKindMarker.value,
      relationId: malformedMarkerSet ? null : relationIdMarker.value,
      relationMarkerIds: _reservedMarkerValues(
        dto.matchedRules,
        'reader-related-topic-relation:',
      ),
      targetStoryClusterId: malformedMarkerSet
          ? null
          : targetClusterMarker.value,
      promotionAttestation: mapReaderPostPromotionAttestation(
        dto.promotionAttestation,
        cardProviderKey: dto.providerKey,
        cardStoryClusterId: storyClusterMarker.value,
        cardPublishedAt: dto.publishedAt,
        cardCitationIds: dto.citationIds,
        enclosingArtifactId: binding.artifactId,
        enclosingSourceWindowId: binding.sourceWindowId,
        enclosingPeriodStart: binding.periodStart,
        enclosingPeriodEnd: binding.periodEnd,
        enclosingIngestionCutoff: binding.ingestionCutoff,
      ),
      title: dto.title,
      providerKey: dto.providerKey,
      providerName: dto.providerName,
      primaryActionKind: dto.primaryActionKind.json ?? 'read_source',
      reason: dto.reason,
      matchedInterestIds: dto.matchedInterestIds,
      matchedRules: dto.matchedRules
          .where((rule) => !_isReservedReaderMarker(rule))
          .toList(growable: false),
      signalScore: _safeScore(dto.signalScore),
      confidence: TopReadConfidenceApiDto(
        level: dto.confidence.level.json ?? 'low',
        score: _safeConfidenceScore(dto.confidence.score),
        rationale: dto.confidence.rationale,
      ),
      confirmedProviderKeys: dto.confirmedProviderKeys,
      providerMetrics: dto.providerMetrics
          .map(
            (metric) =>
                ProviderMetricApiDto(label: metric.label, value: metric.value),
          )
          .toList(growable: false),
      whyImportant: dto.whyImportant,
      whyNow: dto.whyNow,
      publishedAt: dto.publishedAt,
      canonicalUrl: dto.canonicalUrl,
      previewMedia: _previewMedia(dto.previewMedia),
      citationIds: dto.citationIds,
    );
  }

  ReaderSummaryReservedMarker _reservedMarker(
    List<String> rules,
    String prefix,
  ) {
    final normalizedPrefix = prefix.toLowerCase();
    final occurrences = rules
        .where((rule) => rule.trim().toLowerCase().startsWith(normalizedPrefix))
        .toList(growable: false);
    if (occurrences.isEmpty) {
      return const ReaderSummaryReservedMarker.absent();
    }
    if (occurrences.length != 1) {
      return const ReaderSummaryReservedMarker.invalid();
    }
    final raw = occurrences.single;
    if (!raw.startsWith(prefix)) {
      return const ReaderSummaryReservedMarker.invalid();
    }
    final rawValue = raw.substring(prefix.length);
    final value = rawValue.trim();
    return value.isEmpty || rawValue != value
        ? const ReaderSummaryReservedMarker.invalid()
        : ReaderSummaryReservedMarker.valid(value);
  }

  List<String> _reservedMarkerValues(List<String> rules, String prefix) {
    final normalizedPrefix = prefix.toLowerCase();
    return rules
        .map((rule) => rule.trim())
        .where((rule) => rule.toLowerCase().startsWith(normalizedPrefix))
        .map((rule) => rule.substring(prefix.length).trim())
        .where((value) => value.isNotEmpty)
        .toList(growable: false);
  }

  bool _isReservedReaderMarker(String rule) {
    final normalized = rule.trim().toLowerCase();
    return const [
      'reader-card-kind:',
      'reader-story-cluster:',
      'reader-related-topic-relation:',
      'reader-related-topic-target:',
    ].any(normalized.startsWith);
  }

  PreviewMediaApiDto? _previewMedia(
    generated.ReaderSummaryPreviewMediaDto? dto,
  ) {
    if (dto == null) {
      return null;
    }

    return PreviewMediaApiDto(
      kind: dto.kind.json ?? 'image',
      url: dto.url,
      sourceUrl: dto.sourceUrl,
      altText: dto.altText,
    );
  }

  SourceMixEntryApiDto _sourceMixEntry(
    generated.ReaderSummarySourceMixEntryDto dto,
  ) {
    return SourceMixEntryApiDto(
      providerKey: dto.providerKey,
      itemCount: _safeCount(dto.itemCount),
      citationCount: _safeCount(dto.citationCount),
      storyClusterCount: _safeCount(dto.storyClusterCount),
      crossSourceClusterCount: _safeCount(dto.crossSourceClusterCount),
      singleSourceOnly: dto.singleSourceOnly,
      interestIds: dto.interestIds,
    );
  }

  ReaderActionApiDto _nextAction(generated.ReaderSummaryNextActionDto dto) {
    return ReaderActionApiDto(
      kind: dto.kind.json ?? 'read_source',
      label: dto.label,
      reason: dto.reason,
      citationIds: dto.citationIds,
      canonicalUrl: dto.canonicalUrl,
    );
  }

  int _safeCount(num value) {
    if (!value.isFinite || value < 0) {
      return 0;
    }
    return value.round();
  }

  double _safeScore(num value) {
    if (!value.isFinite || value < 0) {
      return 0;
    }
    return value.toDouble();
  }

  double _safeConfidenceScore(num value) {
    if (!value.isFinite || value < 0) {
      return 0;
    }
    if (value > 1) {
      return 1;
    }
    return value.toDouble();
  }
}
const _canonicalReaderCardKinds = {
  'curated_top_read',
  'additional_notable_story',
  'related_topic',
  'supplemental_trend',
};
