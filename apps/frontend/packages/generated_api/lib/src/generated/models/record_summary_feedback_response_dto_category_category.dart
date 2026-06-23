// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum RecordSummaryFeedbackResponseDtoCategoryCategory {
  @JsonValue('wrong_fact')
  wrongFact('wrong_fact'),
  @JsonValue('missing_source')
  missingSource('missing_source'),
  @JsonValue('bad_citation')
  badCitation('bad_citation'),
  @JsonValue('low_relevance')
  lowRelevance('low_relevance'),
  @JsonValue('too_verbose')
  tooVerbose('too_verbose'),
  @JsonValue('too_terse')
  tooTerse('too_terse'),
  @JsonValue('source_request')
  sourceRequest('source_request'),
  @JsonValue('ux_confusing')
  uxConfusing('ux_confusing'),
  @JsonValue('other')
  other('other'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const RecordSummaryFeedbackResponseDtoCategoryCategory(this.json);

  factory RecordSummaryFeedbackResponseDtoCategoryCategory.fromJson(
    String json,
  ) => values.firstWhere((e) => e.json == json, orElse: () => $unknown);

  final String? json;

  String toJson() => json ?? 'null';

  @override
  String toString() => json ?? super.toString();

  /// Returns all defined enum values excluding the $unknown value.
  static List<RecordSummaryFeedbackResponseDtoCategoryCategory>
  get $valuesDefined => values.where((value) => value != $unknown).toList();
}
