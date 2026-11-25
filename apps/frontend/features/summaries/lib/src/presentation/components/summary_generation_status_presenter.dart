import 'package:social_monitor_design_system/social_monitor_design_system.dart';

import '../../domain/value_objects/summary_generation_status.dart';

String summaryGenerationStatusLabel(SummaryGenerationStatus status) {
  return switch (status) {
    SummaryGenerationStatus.ready => 'Ready',
    SummaryGenerationStatus.generating => 'Generating',
    SummaryGenerationStatus.degraded => 'Degraded',
    SummaryGenerationStatus.failed => 'Failed',
    SummaryGenerationStatus.unknown => 'Unknown',
  };
}

AppStatusTone summaryGenerationStatusTone(SummaryGenerationStatus status) {
  return switch (status) {
    SummaryGenerationStatus.ready => AppStatusTone.success,
    SummaryGenerationStatus.generating => AppStatusTone.neutral,
    SummaryGenerationStatus.degraded => AppStatusTone.warning,
    SummaryGenerationStatus.failed => AppStatusTone.danger,
    SummaryGenerationStatus.unknown => AppStatusTone.neutral,
  };
}
