import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;
import 'package:social_monitor_settings/src/domain/value_objects/summary_preference_format.dart';
import 'package:social_monitor_settings/src/domain/value_objects/summary_preference_tone.dart';
import 'package:social_monitor_settings/src/infrastructure/api/summary_preference_api_dto.dart';
import 'package:social_monitor_settings/src/infrastructure/api_clients/summary_preference_api_client.dart';
import 'package:social_monitor_settings/src/infrastructure/mappers/generated_summary_preference_rest_mapper.dart';

import '../../support/settings_test_fixtures.dart';

void main() {
  const mapper = GeneratedSummaryPreferenceRestMapper();

  test('maps effective preference response into feature API DTO', () {
    final dto = mapper.fromEffective(
      generated.GetEffectiveUserSummaryPreferenceResponseDto(
        source: generated
            .GetEffectiveUserSummaryPreferenceResponseDtoSourceSource
            .interest,
        summaryPreference: _generatedPreference(
          format: generated.UserSummaryPreferenceViewDtoFormatFormat.riskBrief,
          tone: generated.UserSummaryPreferenceViewDtoToneTone.neutral,
          customInstructions: 'Prioritize risks.',
        ),
      ),
    );

    expect(dto.format, 'risk_brief');
    expect(dto.tone, 'neutral');
    expect(dto.customInstructions, 'Prioritize risks.');
    expect(dto.source, 'interest');
  });

  test('maps save request body and omits empty prompt', () {
    final body = mapper.toUpsertBody(
      SaveSummaryPreferenceApiRequest(
        scope: settingsWorkspaceScope,
        userId: ' user-demo ',
        preference: const SaveSummaryPreferenceApiDto(
          format: SummaryPreferenceFormat.bulletDigest,
          tone: SummaryPreferenceTone.concise,
          includeRisks: true,
          includeSourceHighlights: false,
          customInstructions: '   ',
        ),
      ),
    );

    expect(body.userId, 'user-demo');
    expect(
      body.format,
      generated
          .UpsertInterestUserSummaryPreferenceRequestDtoFormatFormat
          .bulletDigest,
    );
    expect(
      body.tone,
      generated.UpsertInterestUserSummaryPreferenceRequestDtoToneTone.concise,
    );
    expect(body.includeRisks, isTrue);
    expect(body.includeSourceHighlights, isFalse);
    expect(body.customInstructions, isNull);
  });
}

generated.UserSummaryPreferenceViewDto _generatedPreference({
  required generated.UserSummaryPreferenceViewDtoFormatFormat format,
  required generated.UserSummaryPreferenceViewDtoToneTone tone,
  required String customInstructions,
}) {
  return generated.UserSummaryPreferenceViewDto(
    id: 'preference-1',
    userId: 'user-demo',
    tenantId: settingsWorkspaceScope.tenantId,
    workspaceId: settingsWorkspaceScope.workspaceId,
    rulesVersion: 'reader-summary.v1',
    createdAt: DateTime.utc(2026, 7, 6),
    updatedAt: DateTime.utc(2026, 7, 6),
    interestId: '00000000-0000-7000-8000-000000000903',
    format: format,
    tone: tone,
    includeRisks: true,
    includeSourceHighlights: true,
    customInstructions: customInstructions,
  );
}
