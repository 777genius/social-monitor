import '../value_objects/summary_preference_format.dart';
import '../value_objects/summary_preference_tone.dart';

enum SummaryPreferenceSource { saved, none, unknown }

final class SummaryPreference {
  const SummaryPreference({
    required this.format,
    required this.tone,
    required this.includeRisks,
    required this.includeSourceHighlights,
    required this.customInstructions,
    required this.source,
    this.updatedAt,
  });

  factory SummaryPreference.defaults() {
    return const SummaryPreference(
      format: SummaryPreferenceFormat.executiveBrief,
      tone: SummaryPreferenceTone.analytical,
      includeRisks: true,
      includeSourceHighlights: true,
      customInstructions: '',
      source: SummaryPreferenceSource.none,
    );
  }

  static const maxCustomInstructionsLength = 1200;

  final SummaryPreferenceFormat format;
  final SummaryPreferenceTone tone;
  final bool includeRisks;
  final bool includeSourceHighlights;
  final String customInstructions;
  final SummaryPreferenceSource source;
  final DateTime? updatedAt;

  SummaryPreference copyWith({
    SummaryPreferenceFormat? format,
    SummaryPreferenceTone? tone,
    bool? includeRisks,
    bool? includeSourceHighlights,
    String? customInstructions,
    SummaryPreferenceSource? source,
    DateTime? updatedAt,
  }) {
    return SummaryPreference(
      format: format ?? this.format,
      tone: tone ?? this.tone,
      includeRisks: includeRisks ?? this.includeRisks,
      includeSourceHighlights:
          includeSourceHighlights ?? this.includeSourceHighlights,
      customInstructions: customInstructions ?? this.customInstructions,
      source: source ?? this.source,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }
}
