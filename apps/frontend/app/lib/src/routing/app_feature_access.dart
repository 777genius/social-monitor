import '../composition/app_runtime.dart';
import 'feature_catalog.dart';

bool isAppFeatureVisible(
  AppShellRuntime runtime,
  AppFeatureDescriptor feature,
) {
  if (!runtime.session.isSignedIn) {
    return feature.id == 'auth';
  }
  if (!runtime.workspace.isAvailable) {
    return true;
  }
  if (feature.id == 'auth') {
    return runtime.isAdmin;
  }
  return runtime.capabilities.capability(feature.id).isEnabled;
}

List<AppFeatureDescriptor> visibleAppFeatures(
  AppShellRuntime runtime,
  List<AppFeatureDescriptor> features,
) {
  return [
    for (final feature in features)
      if (isAppFeatureVisible(runtime, feature)) feature,
  ];
}
