import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

import '../../domain/entities/source_binding.dart';
import '../../domain/entities/source_binding_health_snapshot.dart';
import '../../domain/value_objects/source_binding_health_state.dart';
import '../../domain/value_objects/source_binding_status.dart';
import '../../domain/value_objects/source_provider_key.dart';

String sourceProviderLabel(SourceProviderKey providerKey) {
  return switch (providerKey.normalized.toLowerCase()) {
    'reddit' => 'Reddit',
    'rss' => 'RSS',
    'hacker-news' || 'hn' => 'Hacker News',
    'github' => 'GitHub',
    _ => providerKey.normalized,
  };
}

IconData sourceBindingProviderIcon(SourceProviderKey providerKey) {
  return switch (providerKey.normalized.toLowerCase()) {
    'reddit' => Icons.forum_outlined,
    'rss' => Icons.rss_feed,
    'hacker-news' || 'hn' => Icons.local_fire_department,
    'github' => Icons.code,
    _ => Icons.hub_outlined,
  };
}

String sourceBindingStatusLabel(SourceBindingStatus status) {
  return switch (status) {
    SourceBindingStatus.enabled => 'Enabled',
    SourceBindingStatus.paused => 'Paused',
    SourceBindingStatus.unknown => 'Unknown',
  };
}

AppStatusTone sourceBindingStatusTone(SourceBindingStatus status) {
  return switch (status) {
    SourceBindingStatus.enabled => AppStatusTone.success,
    SourceBindingStatus.paused => AppStatusTone.warning,
    SourceBindingStatus.unknown => AppStatusTone.neutral,
  };
}

String sourceBindingHealthLabel(SourceBindingHealthState state) {
  return switch (state) {
    SourceBindingHealthState.paused => 'Paused',
    SourceBindingHealthState.notConfigured => 'Not configured',
    SourceBindingHealthState.scheduled => 'Scheduled',
    SourceBindingHealthState.scanning => 'Scanning',
    SourceBindingHealthState.healthy => 'Healthy',
    SourceBindingHealthState.stale => 'Stale',
    SourceBindingHealthState.degraded => 'Degraded',
    SourceBindingHealthState.unknown => 'Unknown',
  };
}

AppStatusTone sourceBindingHealthTone(SourceBindingHealthState state) {
  return switch (state) {
    SourceBindingHealthState.healthy => AppStatusTone.success,
    SourceBindingHealthState.stale ||
    SourceBindingHealthState.degraded ||
    SourceBindingHealthState.notConfigured => AppStatusTone.warning,
    SourceBindingHealthState.paused ||
    SourceBindingHealthState.scheduled ||
    SourceBindingHealthState.scanning ||
    SourceBindingHealthState.unknown => AppStatusTone.neutral,
  };
}

String sourceBindingTitle(SourceBinding binding) {
  final provider = sourceProviderLabel(binding.providerKey);
  final mode = binding.configValue('mode');
  if (mode == null || mode.isEmpty) {
    return provider;
  }
  return '$provider - ${_titleCase(mode)}';
}

String sourceBindingPreview(SourceBinding binding) {
  final subreddit = binding.configValue('subreddit');
  if (subreddit != null && subreddit.isNotEmpty) {
    final listing = binding.configValue('listing') ?? 'hot';
    return 'r/$subreddit - $listing';
  }
  final feedUrl = binding.configValue('feedUrl') ?? binding.configValue('url');
  if (feedUrl != null && feedUrl.isNotEmpty) {
    return feedUrl;
  }
  final query = binding.configValue('query') ?? binding.configValue('term');
  if (query != null && query.isNotEmpty) {
    return 'query: $query';
  }
  return 'Configuration preview unavailable';
}

String sourceBindingBackendNote(SourceBinding binding) {
  if (binding.providerKey.normalized.toLowerCase() == 'reddit') {
    return 'Uses platform Reddit app credential';
  }
  return 'Uses backend-managed provider access';
}

String sourceBindingEvaluatedLabel(SourceBindingHealthSnapshot snapshot) {
  return snapshot.evaluatedAt.toIso8601String();
}

String _titleCase(String value) {
  if (value.isEmpty) {
    return value;
  }
  return '${value[0].toUpperCase()}${value.substring(1)}';
}
