import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;

import '../api/interest_mutation_api_dto.dart';
import '../api/interest_summary_api_dto.dart';

final class GeneratedInterestRestMapper {
  const GeneratedInterestRestMapper();

  ListInterestsApiResponseDto listInterests(
    generated.ListInterestsResponseDto dto,
  ) {
    return ListInterestsApiResponseDto(
      items: dto.interests.map(interest).toList(growable: false),
      nextCursor: dto.nextCursor,
    );
  }

  InterestSummaryApiDto interest(generated.InterestResponseDto dto) {
    return InterestSummaryApiDto(
      id: dto.id,
      name: dto.name,
      query: dto.query,
      status: dto.status.json ?? 'unknown',
      weeklyMentionCount: null,
    );
  }

  generated.CreateInterestRequestDto createInterest(
    CreateInterestApiRequestDto request,
  ) {
    return generated.CreateInterestRequestDto(
      name: request.name,
      query: request.query,
    );
  }

  InterestSummaryApiDto createdInterest(
    generated.CreateInterestResponseDto dto,
    CreateInterestApiRequestDto request,
  ) {
    return InterestSummaryApiDto(
      id: dto.interestId,
      name: request.name,
      query: request.query,
      status: dto.created ? 'active' : 'active',
      weeklyMentionCount: null,
    );
  }

  generated.UpdateInterestRequestDto updateInterest(
    UpdateInterestApiRequestDto request,
  ) {
    return generated.UpdateInterestRequestDto(
      name: request.name,
      query: request.query,
    );
  }
}
