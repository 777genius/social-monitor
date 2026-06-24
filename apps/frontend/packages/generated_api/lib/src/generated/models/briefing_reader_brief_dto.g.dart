// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'briefing_reader_brief_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BriefingReaderBriefDto _$BriefingReaderBriefDtoFromJson(
  Map<String, dynamic> json,
) => BriefingReaderBriefDto(
  bullets: (json['bullets'] as List<dynamic>).map((e) => e as String).toList(),
  headline: json['headline'] as String,
  nextActions: (json['nextActions'] as List<dynamic>)
      .map((e) => BriefingNextActionDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  oneLineTakeaway: json['oneLineTakeaway'] as String,
  openQuestions: (json['openQuestions'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  qualityState: BriefingReaderQualityStateDto.fromJson(
    json['qualityState'] as Map<String, dynamic>,
  ),
  risks: (json['risks'] as List<dynamic>).map((e) => e as String).toList(),
  sourceMix: (json['sourceMix'] as List<dynamic>)
      .map((e) => BriefingSourceMixEntryDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  topicSections: (json['topicSections'] as List<dynamic>)
      .map(
        (e) =>
            BriefingReaderTopicSectionDto.fromJson(e as Map<String, dynamic>),
      )
      .toList(),
  topReads: (json['topReads'] as List<dynamic>)
      .map((e) => BriefingReaderItemDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  trendDelta: BriefingTrendDeltaDto.fromJson(
    json['trendDelta'] as Map<String, dynamic>,
  ),
);

Map<String, dynamic> _$BriefingReaderBriefDtoToJson(
  BriefingReaderBriefDto instance,
) => <String, dynamic>{
  'bullets': instance.bullets,
  'headline': instance.headline,
  'nextActions': instance.nextActions,
  'oneLineTakeaway': instance.oneLineTakeaway,
  'openQuestions': instance.openQuestions,
  'qualityState': instance.qualityState,
  'risks': instance.risks,
  'sourceMix': instance.sourceMix,
  'topicSections': instance.topicSections,
  'topReads': instance.topReads,
  'trendDelta': instance.trendDelta,
};
