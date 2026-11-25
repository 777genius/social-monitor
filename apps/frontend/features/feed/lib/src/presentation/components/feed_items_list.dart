import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

import '../../domain/entities/feed_item.dart';
import 'feed_item_card.dart';

class FeedItemsList extends StatelessWidget {
  const FeedItemsList({
    super.key,
    required this.items,
    required this.emptyTitle,
    required this.emptyMessage,
    required this.onItemTap,
    this.isLoading = false,
    this.isStale = false,
    this.footer,
  });

  final List<FeedItem> items;
  final String emptyTitle;
  final String emptyMessage;
  final ValueChanged<FeedItem> onItemTap;
  final bool isLoading;
  final bool isStale;
  final Widget? footer;

  static const _lazyViewportThreshold = 80;
  static const _lazyViewportHeight = 560.0;

  @override
  Widget build(BuildContext context) {
    if (isLoading && items.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }

    if (items.isEmpty) {
      return AppEmptyState(title: emptyTitle, message: emptyMessage);
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (isStale) ...[
          const AppInlineProblem(
            title: 'Showing stale data',
            message: 'The list is refreshing and may change shortly.',
            tone: AppProblemTone.warning,
          ),
          const SizedBox(height: AppSpacing.md),
        ],
        _buildList(context),
        if (footer != null) ...[const SizedBox(height: AppSpacing.md), footer!],
      ],
    );
  }

  Widget _buildList(BuildContext context) {
    final useLazyViewport = items.length > _lazyViewportThreshold;
    final colorScheme = Theme.of(context).colorScheme;
    final list = ListView.separated(
      key: const ValueKey('feed-items-list-scrollable'),
      shrinkWrap: !useLazyViewport,
      physics: useLazyViewport
          ? const ClampingScrollPhysics()
          : const NeverScrollableScrollPhysics(),
      itemCount: items.length,
      itemBuilder: (context, index) {
        final item = items[index];
        return FeedItemCard(
          key: ValueKey('feed-item-card-${item.id.value}'),
          item: item,
          index: index,
          onTap: () => onItemTap(item),
        );
      },
      separatorBuilder: (context, index) =>
          Divider(height: 1, color: colorScheme.outlineVariant),
    );

    if (!useLazyViewport) {
      return list;
    }
    return SizedBox(height: _lazyViewportHeight, child: list);
  }
}
