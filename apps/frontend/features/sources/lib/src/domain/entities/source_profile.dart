import '../value_objects/source_provider_key.dart';
import '../value_objects/source_readiness_state.dart';
import '../value_objects/source_runtime_readiness.dart';

final class SourceProfile {
  const SourceProfile({
    required this.providerKey,
    required this.displayName,
    required this.productionSafe,
    required this.readinessState,
    required this.runtimeReadiness,
    required this.acquisitionMode,
    required this.supportedQueryModes,
    required this.supportedContentUnits,
    required this.cursorModel,
    required this.quotaModel,
    required this.limitations,
    required this.liveBetaBlockers,
    this.capabilityVersion,
  });

  final SourceProviderKey providerKey;
  final String displayName;
  final bool productionSafe;
  final SourceReadinessState readinessState;
  final SourceRuntimeReadiness runtimeReadiness;
  final String acquisitionMode;
  final List<String> supportedQueryModes;
  final List<String> supportedContentUnits;
  final String cursorModel;
  final String quotaModel;
  final List<String> limitations;
  final List<String> liveBetaBlockers;
  final num? capabilityVersion;

  bool get isReady {
    return productionSafe &&
        readinessState.isEnabled &&
        runtimeReadiness.canCollect;
  }

  bool get isDegraded => !isReady;

  List<String> get allLimitations {
    return [
      ...limitations,
      ...liveBetaBlockers.map((item) => 'Live beta blocker: $item'),
    ];
  }
}
