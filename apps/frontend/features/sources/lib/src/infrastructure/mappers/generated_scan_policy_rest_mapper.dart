import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;

import '../api/scan_policy_api_dto.dart';

final class GeneratedScanPolicyRestMapper {
  const GeneratedScanPolicyRestMapper();

  ScanPolicyApiDto policy(generated.GetScanPolicyResponseDto dto) {
    return ScanPolicyApiDto(
      id: dto.id,
      sourceBindingId: dto.sourceBindingId,
      intervalSeconds: dto.intervalSeconds,
      freshnessSeconds: dto.freshnessSeconds,
      retryBudget: dto.retryBudget,
      nextRunAt: dto.nextRunAt,
      createdAt: dto.createdAt,
    );
  }

  generated.SetScanPolicyRequestDto setPolicy(
    SetScanPolicyApiRequestDto request,
  ) {
    return generated.SetScanPolicyRequestDto(
      intervalSeconds: request.intervalSeconds,
      freshnessSeconds: request.freshnessSeconds,
      retryBudget: request.retryBudget,
    );
  }
}
