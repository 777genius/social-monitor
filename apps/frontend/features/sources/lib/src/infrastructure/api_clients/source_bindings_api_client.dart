import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../api/source_binding_api_dto.dart';
import '../api/source_binding_health_api_dto.dart';

abstract interface class SourceBindingsApiClient {
  Future<Result<ListSourceBindingsApiResponseDto>> listSourceBindings(
    SourceBindingListApiRequestDto request,
  );

  Future<Result<SourceBindingApiDto>> bindSource(
    BindSourceApiRequestDto request,
  );

  Future<Result<SourceBindingApiDto>> changeSourceBindingStatus(
    ChangeSourceBindingStatusApiRequestDto request,
  );

  Future<Result<SourceBindingHealthApiDto>> loadSourceBindingHealth(
    SourceBindingHealthApiRequestDto request,
  );
}
