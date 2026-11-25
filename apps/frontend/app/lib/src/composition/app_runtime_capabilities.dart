import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

const _adminRuntimeCapabilities = FeatureFlagSet({
  'interests': FeatureCapability(key: 'interests', isEnabled: true),
  'sources': FeatureCapability(key: 'sources', isEnabled: true),
  'feed': FeatureCapability(key: 'feed', isEnabled: true),
  'summaries': FeatureCapability(key: 'summaries', isEnabled: true),
  'settings': FeatureCapability(key: 'settings', isEnabled: true),
});

const _guestRuntimeCapabilities = FeatureFlagSet({
  'interests': FeatureCapability(
    key: 'interests',
    isEnabled: false,
    disabledReasonCode: 'guest_read_only',
  ),
  'sources': FeatureCapability(
    key: 'sources',
    isEnabled: false,
    disabledReasonCode: 'guest_read_only',
  ),
  'feed': FeatureCapability(
    key: 'feed',
    isEnabled: false,
    disabledReasonCode: 'guest_read_only',
  ),
  'summaries': FeatureCapability(key: 'summaries', isEnabled: true),
  'settings': FeatureCapability(
    key: 'settings',
    isEnabled: false,
    disabledReasonCode: 'guest_read_only',
  ),
});

FeatureFlagSet capabilitiesForUserRole(String userRole) {
  return userRole == 'admin'
      ? _adminRuntimeCapabilities
      : _guestRuntimeCapabilities;
}

FeatureFlagSet disabledRuntimeCapabilities(String reasonCode) {
  return FeatureFlagSet({
    'interests': _disabled('interests', reasonCode),
    'sources': _disabled('sources', reasonCode),
    'feed': _disabled('feed', reasonCode),
    'summaries': _disabled('summaries', reasonCode),
    'settings': _disabled('settings', reasonCode),
  });
}

FeatureCapability _disabled(String key, String reasonCode) {
  return FeatureCapability(
    key: key,
    isEnabled: false,
    disabledReasonCode: reasonCode,
  );
}
