import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;

import '../../domain/value_objects/summary_preference_format.dart';
import '../../domain/value_objects/summary_preference_tone.dart';
import '../api/summary_preference_api_dto.dart';
import '../api_clients/summary_preference_api_client.dart';

final class GeneratedSummaryPreferenceRestMapper {
  const GeneratedSummaryPreferenceRestMapper();

  SummaryPreferenceApiDto fromEffective(
    generated.GetEffectiveUserSummaryPreferenceResponseDto dto,
  ) {
    final preference = dto.summaryPreference;
    return SummaryPreferenceApiDto(
      format: preference?.format?.toJson(),
      tone: preference?.tone?.toJson(),
      includeRisks: preference?.includeRisks,
      includeSourceHighlights: preference?.includeSourceHighlights,
      customInstructions: preference?.customInstructions,
      source: dto.source.toJson(),
      updatedAt: preference?.updatedAt,
    );
  }

  SummaryPreferenceApiDto fromUpsert(
    generated.UpsertUserSummaryPreferenceResponseDto dto,
  ) {
    final preference = dto.summaryPreference;
    return SummaryPreferenceApiDto(
      format: preference.format?.toJson(),
      tone: preference.tone?.toJson(),
      includeRisks: preference.includeRisks,
      includeSourceHighlights: preference.includeSourceHighlights,
      customInstructions: preference.customInstructions,
      source: 'interest',
      updatedAt: preference.updatedAt,
    );
  }

  generated.UpsertInterestUserSummaryPreferenceRequestDto toUpsertBody(
    SaveSummaryPreferenceApiRequest request,
  ) {
    return generated.UpsertInterestUserSummaryPreferenceRequestDto(
      userId: request.userId.trim(),
      format: _formatToGenerated(request.preference.format),
      tone: _toneToGenerated(request.preference.tone),
      includeRisks: request.preference.includeRisks,
      includeSourceHighlights: request.preference.includeSourceHighlights,
      customInstructions: _emptyToNull(request.preference.customInstructions),
    );
  }

  generated.UpsertInterestUserSummaryPreferenceRequestDtoFormatFormat?
  _formatToGenerated(SummaryPreferenceFormat format) {
    return switch (format) {
      SummaryPreferenceFormat.executiveBrief =>
        generated
            .UpsertInterestUserSummaryPreferenceRequestDtoFormatFormat
            .executiveBrief,
      SummaryPreferenceFormat.bulletDigest =>
        generated
            .UpsertInterestUserSummaryPreferenceRequestDtoFormatFormat
            .bulletDigest,
      SummaryPreferenceFormat.riskBrief =>
        generated
            .UpsertInterestUserSummaryPreferenceRequestDtoFormatFormat
            .riskBrief,
      SummaryPreferenceFormat.unknown => null,
    };
  }

  generated.UpsertInterestUserSummaryPreferenceRequestDtoToneTone?
  _toneToGenerated(SummaryPreferenceTone tone) {
    return switch (tone) {
      SummaryPreferenceTone.analytical =>
        generated
            .UpsertInterestUserSummaryPreferenceRequestDtoToneTone
            .analytical,
      SummaryPreferenceTone.concise =>
        generated.UpsertInterestUserSummaryPreferenceRequestDtoToneTone.concise,
      SummaryPreferenceTone.neutral =>
        generated.UpsertInterestUserSummaryPreferenceRequestDtoToneTone.neutral,
      SummaryPreferenceTone.unknown => null,
    };
  }

  String? _emptyToNull(String value) {
    final trimmed = value.trim();
    return trimmed.isEmpty ? null : trimmed;
  }
}
