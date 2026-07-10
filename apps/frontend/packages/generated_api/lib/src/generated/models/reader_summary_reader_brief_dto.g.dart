// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_reader_brief_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryReaderBriefDto _$ReaderSummaryReaderBriefDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummaryReaderBriefDto(
  bullets: (json['bullets'] as List<dynamic>).map((e) => e as String).toList(),
  claimBoard: (json['claimBoard'] as List<dynamic>)
      .map((e) => ReaderSummaryClaimDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  headline: json['headline'] as String,
  interestSections: (json['interestSections'] as List<dynamic>)
      .map(
        (e) => ReaderSummaryReaderInterestSectionDto.fromJson(
          e as Map<String, dynamic>,
        ),
      )
      .toList(),
  mainTopics: (json['mainTopics'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  narrativeSections: (json['narrativeSections'] as List<dynamic>)
      .map(
        (e) => ReaderSummaryNarrativeSectionDto.fromJson(
          e as Map<String, dynamic>,
        ),
      )
      .toList(),
  nextActions: (json['nextActions'] as List<dynamic>)
      .map(
        (e) => ReaderSummaryNextActionDto.fromJson(e as Map<String, dynamic>),
      )
      .toList(),
  oneLineTakeaway: json['oneLineTakeaway'] as String,
  openQuestions: (json['openQuestions'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  qualityState: ReaderSummaryReaderQualityStateDto.fromJson(
    json['qualityState'] as Map<String, dynamic>,
  ),
  reliabilityReport: ReaderSummaryReliabilityReportDto.fromJson(
    json['reliabilityReport'] as Map<String, dynamic>,
  ),
  risks: (json['risks'] as List<dynamic>).map((e) => e as String).toList(),
  selectedPosts: (json['selectedPosts'] as List<dynamic>)
      .map(
        (e) => ReaderSummaryReaderItemDto.fromJson(e as Map<String, dynamic>),
      )
      .toList(),
  sourceMix: (json['sourceMix'] as List<dynamic>)
      .map(
        (e) =>
            ReaderSummarySourceMixEntryDto.fromJson(e as Map<String, dynamic>),
      )
      .toList(),
  topicMap: ReaderSummaryTopicMapDto.fromJson(
    json['topicMap'] as Map<String, dynamic>,
  ),
  topReads: (json['topReads'] as List<dynamic>)
      .map(
        (e) => ReaderSummaryReaderItemDto.fromJson(e as Map<String, dynamic>),
      )
      .toList(),
  trendDelta: ReaderSummaryTrendDeltaDto.fromJson(
    json['trendDelta'] as Map<String, dynamic>,
  ),
);

Map<String, dynamic> _$ReaderSummaryReaderBriefDtoToJson(
  ReaderSummaryReaderBriefDto instance,
) => <String, dynamic>{
  'bullets': instance.bullets,
  'claimBoard': instance.claimBoard,
  'headline': instance.headline,
  'interestSections': instance.interestSections,
  'mainTopics': instance.mainTopics,
  'narrativeSections': instance.narrativeSections,
  'nextActions': instance.nextActions,
  'oneLineTakeaway': instance.oneLineTakeaway,
  'openQuestions': instance.openQuestions,
  'qualityState': instance.qualityState,
  'reliabilityReport': instance.reliabilityReport,
  'risks': instance.risks,
  'selectedPosts': instance.selectedPosts,
  'sourceMix': instance.sourceMix,
  'topicMap': instance.topicMap,
  'topReads': instance.topReads,
  'trendDelta': instance.trendDelta,
};
