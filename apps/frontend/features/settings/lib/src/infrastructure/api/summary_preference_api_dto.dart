import '../../domain/value_objects/summary_preference_format.dart';
import '../../domain/value_objects/summary_preference_tone.dart';

final class SummaryPreferenceApiDto {
  const SummaryPreferenceApiDto({
    required this.format,
    required this.tone,
    required this.includeRisks,
    required this.includeSourceHighlights,
    required this.customInstructions,
    required this.source,
    this.updatedAt,
  });

  final String? format;
  final String? tone;
  final bool? includeRisks;
  final bool? includeSourceHighlights;
  final String? customInstructions;
  final String source;
  final DateTime? updatedAt;
}

final class SaveSummaryPreferenceApiDto {
  const SaveSummaryPreferenceApiDto({
    required this.format,
    required this.tone,
    required this.includeRisks,
    required this.includeSourceHighlights,
    required this.customInstructions,
  });

  final SummaryPreferenceFormat format;
  final SummaryPreferenceTone tone;
  final bool includeRisks;
  final bool includeSourceHighlights;
  final String customInstructions;
}
