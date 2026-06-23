import '../value_objects/scan_job_id.dart';
import '../value_objects/scan_job_status.dart';

final class ScanRequest {
  const ScanRequest({
    required this.scanJobId,
    required this.status,
    required this.created,
  });

  final ScanJobId scanJobId;
  final ScanJobStatus status;
  final bool created;
}
