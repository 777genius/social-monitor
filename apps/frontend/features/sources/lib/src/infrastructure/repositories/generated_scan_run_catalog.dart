import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/commands/request_scan_command.dart';
import '../../application/contracts/scan_run_catalog.dart';
import '../../application/queries/load_scan_status_query.dart';
import '../../domain/entities/scan_request.dart';
import '../../domain/entities/scan_status_snapshot.dart';
import '../api/scan_run_api_dto.dart';
import '../api_clients/scan_runs_api_client.dart';
import '../mappers/scan_run_mapper.dart';

final class GeneratedScanRunCatalog implements ScanRunCatalog {
  const GeneratedScanRunCatalog({
    required ScanRunsApiClient apiClient,
    ScanRunMapper mapper = const ScanRunMapper(),
  }) : _apiClient = apiClient,
       _mapper = mapper;

  final ScanRunsApiClient _apiClient;
  final ScanRunMapper _mapper;

  @override
  Future<Result<ScanRequest>> requestScan(RequestScanCommand command) async {
    final result = await _apiClient.requestScan(
      RequestScanApiRequestDto(
        scope: command.scope,
        sourceBindingId: command.sourceBindingId.value,
        idempotencyKey: command.idempotencyKey,
      ),
    );
    return result.fold(
      onSuccess: (dto) => Result.success(_mapper.requestToDomain(dto)),
      onFailure: Result<ScanRequest>.failure,
    );
  }

  @override
  Future<Result<ScanStatusSnapshot>> loadScanStatus(
    LoadScanStatusQuery query,
  ) async {
    final result = await _apiClient.loadScanStatus(
      ScanStatusApiRequestDto(
        scope: query.scope,
        scanJobId: query.scanJobId.value,
      ),
    );
    return result.fold(
      onSuccess: (dto) => Result.success(_mapper.statusToDomain(dto)),
      onFailure: Result<ScanStatusSnapshot>.failure,
    );
  }
}
