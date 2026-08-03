import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/contracts/weekly_summary_projection_catalog.dart';
import '../../application/queries/load_weekly_summary_projection_query.dart';
import '../../domain/aggregates/weekly_summary_projection.dart';
import '../api_clients/generated_weekly_summary_projection_reader.dart';
import '../mappers/weekly_summary_projection_mapper.dart';

final class GeneratedWeeklySummaryProjectionCatalog
    implements WeeklySummaryProjectionCatalog {
  const GeneratedWeeklySummaryProjectionCatalog({
    required GeneratedWeeklySummaryProjectionReader reader,
    WeeklySummaryProjectionMapper mapper = const WeeklySummaryProjectionMapper(),
  }) : _reader = reader,
       _mapper = mapper;

  final GeneratedWeeklySummaryProjectionReader _reader;
  final WeeklySummaryProjectionMapper _mapper;

  @override
  Future<Result<WeeklySummaryProjection>> loadWeeklyProjection(
    LoadWeeklySummaryProjectionQuery query,
  ) async {
    final result = await _reader.load(scope: query.scope, week: query.week);
    return result.fold(
      onSuccess: (dto) => _mapper.toDomain(
        dto,
        scope: query.scope,
        requestedWeek: query.week,
      ),
      onFailure: Result<WeeklySummaryProjection>.failure,
    );
  }
}
