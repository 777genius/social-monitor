import '../../domain/entities/scan_policy.dart';

String scanPolicyNextRunLabel(ScanPolicy policy) {
  return policy.nextRunAt.toIso8601String();
}

String scanPolicyCadenceLabel(int seconds) {
  if (seconds % 86400 == 0) {
    final days = seconds ~/ 86400;
    return days == 1 ? '1 day' : '$days days';
  }
  if (seconds % 3600 == 0) {
    final hours = seconds ~/ 3600;
    return hours == 1 ? '1 hour' : '$hours hours';
  }
  if (seconds % 60 == 0) {
    final minutes = seconds ~/ 60;
    return minutes == 1 ? '1 minute' : '$minutes minutes';
  }
  return '$seconds seconds';
}
