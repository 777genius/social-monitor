import '../../domain/entities/summary_preference.dart';
import '../../domain/value_objects/summary_preference_format.dart';
import '../../domain/value_objects/summary_preference_tone.dart';
import '../api/summary_preference_api_dto.dart';

final class SummaryPreferenceMapper {
  const SummaryPreferenceMapper();

  SummaryPreference toDomain(SummaryPreferenceApiDto dto) {
    final defaults = SummaryPreference.defaults();
    final format = _formatFromApi(dto.format);
    final tone = _toneFromApi(dto.tone);
    return SummaryPreference(
      format: format == SummaryPreferenceFormat.unknown
          ? defaults.format
          : format,
      tone: tone == SummaryPreferenceTone.unknown ? defaults.tone : tone,
      includeRisks: dto.includeRisks ?? defaults.includeRisks,
      includeSourceHighlights:
          dto.includeSourceHighlights ?? defaults.includeSourceHighlights,
      customInstructions: _safeInstructions(dto.customInstructions ?? ''),
      source: _sourceFromApi(dto.source),
      updatedAt: dto.updatedAt,
    );
  }

  SummaryPreferenceFormat _formatFromApi(String? value) {
    return switch (value?.trim()) {
      'executive_brief' ||
      'executiveBrief' => SummaryPreferenceFormat.executiveBrief,
      'bullet_digest' || 'bulletDigest' => SummaryPreferenceFormat.bulletDigest,
      'risk_brief' || 'riskBrief' => SummaryPreferenceFormat.riskBrief,
      _ => SummaryPreferenceFormat.unknown,
    };
  }

  SummaryPreferenceTone _toneFromApi(String? value) {
    return switch (value?.trim()) {
      'analytical' => SummaryPreferenceTone.analytical,
      'concise' => SummaryPreferenceTone.concise,
      'neutral' => SummaryPreferenceTone.neutral,
      _ => SummaryPreferenceTone.unknown,
    };
  }

  SummaryPreferenceSource _sourceFromApi(String value) {
    return switch (value.trim()) {
      'interest' || 'subscription' => SummaryPreferenceSource.saved,
      'none' => SummaryPreferenceSource.none,
      _ => SummaryPreferenceSource.unknown,
    };
  }

  String _safeInstructions(String raw) {
    final normalized = raw.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
    final trimmed = normalized.trim();
    if (trimmed.length <= SummaryPreference.maxCustomInstructionsLength) {
      return trimmed;
    }
    return trimmed.substring(0, SummaryPreference.maxCustomInstructionsLength);
  }
}
