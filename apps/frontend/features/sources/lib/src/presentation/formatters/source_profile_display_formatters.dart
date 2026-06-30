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
  return switch (profile.health.state) {
    'healthy' => AppStatusTone.success,
    'unsupported_scope' || 'auth_failed' => AppStatusTone.danger,
    'stale' || 'rate_limited' || 'degraded' => AppStatusTone.warning,
    _ =>
      profile.readinessState == SourceReadinessState.rejected ||
              profile.runtimeReadiness == SourceRuntimeReadiness.unknown
          ? AppStatusTone.danger
          : AppStatusTone.warning,
  };
}

String sourceProfileHealthLabel(SourceProfile profile) {
  return switch (profile.health.state) {
    'healthy' => 'Healthy',
    'stale' => 'Stale',
    'rate_limited' => 'Rate limited',
    'auth_failed' => 'Auth failed',
    'degraded' => 'Degraded',
    'unsupported_scope' => 'Unsupported scope',
    _ => 'Needs review',
  };
}

String sourceProfileAvailabilityLabel(SourceProfile profile) {
  if (profile.health.state != 'healthy') {
    return sourceProfileHealthLabel(profile);
  }
  return 'Available';
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
