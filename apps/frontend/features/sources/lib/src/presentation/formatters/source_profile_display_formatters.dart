import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

import '../../domain/entities/source_profile.dart';
import '../../domain/value_objects/source_readiness_state.dart';
import '../../domain/value_objects/source_runtime_readiness.dart';

String sourceReadinessLabel(SourceReadinessState state) {
  return switch (state) {
    SourceReadinessState.researchOnly => 'Research only',
    SourceReadinessState.profiled => 'Profiled',
    SourceReadinessState.certificationReady => 'Certification ready',
    SourceReadinessState.enabledBeta => 'Enabled beta',
    SourceReadinessState.providerOnly => 'Provider only',
    SourceReadinessState.manualOnly => 'Manual only',
    SourceReadinessState.rejected => 'Rejected',
    SourceReadinessState.unknown => 'Unknown',
  };
}

String sourceRuntimeReadinessLabel(SourceRuntimeReadiness state) {
  return switch (state) {
    SourceRuntimeReadiness.fixtureReady => 'Fixture ready',
    SourceRuntimeReadiness.liveBetaReady => 'Live beta ready',
    SourceRuntimeReadiness.deferred => 'Deferred',
    SourceRuntimeReadiness.unknown => 'Unknown',
  };
}

AppStatusTone sourceProfileTone(SourceProfile profile) {
  if (profile.isReady) {
    return AppStatusTone.success;
  }
  if (profile.readinessState == SourceReadinessState.rejected ||
      profile.runtimeReadiness == SourceRuntimeReadiness.unknown) {
    return AppStatusTone.danger;
  }
  return AppStatusTone.warning;
}

String sourceProfileAvailabilityLabel(SourceProfile profile) {
  if (profile.isReady) {
    return 'Available';
  }
  if (!profile.productionSafe) {
    return 'Not production safe';
  }
  if (!profile.readinessState.isEnabled) {
    return 'Not enabled';
  }
  return 'Runtime deferred';
}

IconData sourceProviderIcon(SourceProfile profile) {
  return switch (profile.providerKey.normalized.toLowerCase()) {
    'reddit' => Icons.forum_outlined,
    'rss' => Icons.rss_feed,
    'hn' || 'hacker_news' || 'hacker-news' => Icons.local_fire_department,
    'github' => Icons.code,
    _ => Icons.hub_outlined,
  };
}

String joinedOrDash(List<String> values) {
  if (values.isEmpty) {
    return '-';
  }
  return values.join(', ');
}
