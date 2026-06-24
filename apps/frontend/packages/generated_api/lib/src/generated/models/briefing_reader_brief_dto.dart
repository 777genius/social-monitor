// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'briefing_next_action_dto.dart';
import 'briefing_reader_item_dto.dart';
import 'briefing_reader_quality_state_dto.dart';
import 'briefing_reader_topic_section_dto.dart';
import 'briefing_source_mix_entry_dto.dart';
import 'briefing_trend_delta_dto.dart';

part 'briefing_reader_brief_dto.g.dart';

@JsonSerializable()
class BriefingReaderBriefDto {
  const BriefingReaderBriefDto({
    required this.bullets,
    required this.headline,
    required this.nextActions,
    required this.oneLineTakeaway,
    required this.openQuestions,
    required this.qualityState,
    required this.risks,
    required this.sourceMix,
    required this.topicSections,
    required this.topReads,
    required this.trendDelta,
  });

  factory BriefingReaderBriefDto.fromJson(Map<String, Object?> json) =>
      _$BriefingReaderBriefDtoFromJson(json);

  final List<String> bullets;
  final String headline;
  final List<BriefingNextActionDto> nextActions;
  final String oneLineTakeaway;
  final List<String> openQuestions;
  final BriefingReaderQualityStateDto qualityState;
  final List<String> risks;
  final List<BriefingSourceMixEntryDto> sourceMix;
  final List<BriefingReaderTopicSectionDto> topicSections;
  final List<BriefingReaderItemDto> topReads;
  final BriefingTrendDeltaDto trendDelta;

  Map<String, Object?> toJson() => _$BriefingReaderBriefDtoToJson(this);
}
