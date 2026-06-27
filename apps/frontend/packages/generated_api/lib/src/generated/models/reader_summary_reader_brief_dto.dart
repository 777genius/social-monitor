// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_summary_next_action_dto.dart';
import 'reader_summary_reader_item_dto.dart';
import 'reader_summary_reader_quality_state_dto.dart';
import 'reader_summary_reader_topic_section_dto.dart';
import 'reader_summary_source_mix_entry_dto.dart';
import 'reader_summary_trend_delta_dto.dart';

part 'reader_summary_reader_brief_dto.g.dart';

@JsonSerializable()
class ReaderSummaryReaderBriefDto {
  const ReaderSummaryReaderBriefDto({
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

  factory ReaderSummaryReaderBriefDto.fromJson(Map<String, Object?> json) =>
      _$ReaderSummaryReaderBriefDtoFromJson(json);

  final List<String> bullets;
  final String headline;
  final List<ReaderSummaryNextActionDto> nextActions;
  final String oneLineTakeaway;
  final List<String> openQuestions;
  final ReaderSummaryReaderQualityStateDto qualityState;
  final List<String> risks;
  final List<ReaderSummarySourceMixEntryDto> sourceMix;
  final List<ReaderSummaryReaderTopicSectionDto> topicSections;
  final List<ReaderSummaryReaderItemDto> topReads;
  final ReaderSummaryTrendDeltaDto trendDelta;

  Map<String, Object?> toJson() => _$ReaderSummaryReaderBriefDtoToJson(this);
}
