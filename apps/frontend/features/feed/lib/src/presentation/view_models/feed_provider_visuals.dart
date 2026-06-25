import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

final class FeedProviderVisuals {
  const FeedProviderVisuals({
    required this.label,
    this.originLabel,
    required this.icon,
    required this.tone,
    required this.accent,
  });

  final String label;
  final String? originLabel;
  final IconData icon;
  final AppStatusTone tone;
  final Color accent;
}

FeedProviderVisuals feedProviderVisuals(String providerKey) {
  return switch (providerKey.toLowerCase()) {
    'reddit' => const FeedProviderVisuals(
      label: 'Reddit',
      icon: Icons.forum_outlined,
      tone: AppStatusTone.success,
      accent: AppColors.rose,
    ),
    'rss' => const FeedProviderVisuals(
      label: 'RSS',
      icon: Icons.rss_feed,
      tone: AppStatusTone.neutral,
      accent: AppColors.teal,
    ),
    'hacker-news' || 'hn' => const FeedProviderVisuals(
      label: 'Hacker News',
      icon: Icons.local_fire_department,
      tone: AppStatusTone.warning,
      accent: AppColors.amber,
    ),
    'github-repo-radar' => const FeedProviderVisuals(
      label: 'Repo Radar',
      originLabel: 'GH Archive WatchEvent',
      icon: Icons.trending_up,
      tone: AppStatusTone.success,
      accent: AppColors.primary,
    ),
    'github-trending-page' => const FeedProviderVisuals(
      label: 'GitHub Trending',
      originLabel: 'github.com/trending page',
      icon: Icons.auto_graph,
      tone: AppStatusTone.success,
      accent: AppColors.primary,
    ),
    'github-issues' || 'github' => const FeedProviderVisuals(
      label: 'GitHub Issues',
      icon: Icons.code,
      tone: AppStatusTone.neutral,
      accent: AppColors.violet,
    ),
    _ => FeedProviderVisuals(
      label: providerKey,
      icon: Icons.dynamic_feed_outlined,
      tone: AppStatusTone.neutral,
      accent: AppColors.primary,
    ),
  };
}
