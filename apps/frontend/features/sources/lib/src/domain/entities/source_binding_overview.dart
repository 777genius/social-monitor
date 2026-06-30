import '../value_objects/source_provider_key.dart';

final class SourceBindingOverview {
  const SourceBindingOverview({required this.summary});

  final SourceBindingOverviewSummary summary;

  bool get hasProviderStatus => summary.degradationReasons.isNotEmpty;
}

final class SourceBindingOverviewSummary {
  const SourceBindingOverviewSummary({
    required this.totalBindings,
    required this.operatorAction,
    required this.degradationReasons,
    required this.providerBreakdown,
    this.nextEligibleAt,
  });

  final num totalBindings;
  final String operatorAction;
  final List<SourceBindingOverviewDegradationReason> degradationReasons;
  final List<SourceBindingOverviewProviderBreakdown> providerBreakdown;
  final DateTime? nextEligibleAt;
}

final class SourceBindingOverviewProviderBreakdown {
  const SourceBindingOverviewProviderBreakdown({
    required this.providerKey,
    required this.totalBindings,
    required this.degradationReasons,
    this.nextEligibleAt,
  });

  final SourceProviderKey providerKey;
  final num totalBindings;
  final List<SourceBindingOverviewDegradationReason> degradationReasons;
  final DateTime? nextEligibleAt;
}

final class SourceBindingOverviewDegradationReason {
  const SourceBindingOverviewDegradationReason({
    required this.code,
    required this.severity,
    required this.affectedBindings,
    required this.operatorAction,
    required this.sampleSourceBindingIds,
    required this.signals,
    this.nextEligibleAt,
  });

  final String code;
  final SourceBindingOverviewDegradationSeverity severity;
  final num affectedBindings;
  final String operatorAction;
  final List<String> sampleSourceBindingIds;
  final List<String> signals;
  final DateTime? nextEligibleAt;
}

enum SourceBindingOverviewDegradationSeverity {
  info,
  warning,
  critical,
  unknown,
}
