import 'dart:convert';

import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/generated_summary_rest_mapper.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/summary_mapper.dart';

import '../../../../integration_test/infrastructure/mappers/support/additional_stories_e2e_rest_boundary.dart';
import '../../../../integration_test/support/additional_stories_test_scenarios.dart';

final class AdditionalStoriesDomainFixtureReader {
  int requestCount = 0;
  String? lastSerializedRestPayload;

  Future<ReaderSummary> fetch({
    Set<AdditionalStoriesNegativeCase> negativeCases = const {},
  }) async {
    requestCount += 1;
    final serialized = jsonEncode(
      additionalStoriesRestFixture(negativeCases: negativeCases).toJson(),
    );
    lastSerializedRestPayload = serialized;
    final response = generated.ReaderSummaryArtifactResponseDto.fromJson(
      jsonDecode(serialized) as Map<String, dynamic>,
    );
    final apiSummary = const GeneratedSummaryRestMapper().readerSummary(
      response,
    );
    return const SummaryMapper().readerSummaryToDomain(apiSummary);
  }
}
