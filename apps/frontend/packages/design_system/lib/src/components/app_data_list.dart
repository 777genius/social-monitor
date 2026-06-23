import 'package:flutter/material.dart';

import '../tokens/app_colors.dart';
import '../tokens/app_spacing.dart';
import 'app_empty_state.dart';
import 'app_inline_problem.dart';

class AppDataList<T extends Object> extends StatelessWidget {
  const AppDataList({
    super.key,
    required this.items,
    required this.itemBuilder,
    required this.emptyTitle,
    required this.emptyMessage,
    this.stableId,
    this.isLoading = false,
    this.isStale = false,
    this.footer,
  });

  final List<T> items;
  final Widget Function(BuildContext context, T item, int index) itemBuilder;
  final String Function(T item)? stableId;
  final String emptyTitle;
  final String emptyMessage;
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
        ?footer,
      ],
    );
  }

  Widget _buildList(BuildContext context) {
    final useLazyViewport = items.length > _lazyViewportThreshold;
    final list = DecoratedBox(
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        border: Border.all(
          color: Theme.of(context).brightness == Brightness.dark
              ? AppColors.darkBorder
              : AppColors.border,
        ),
        borderRadius: BorderRadius.circular(8),
      ),
      child: ListView.separated(
        shrinkWrap: !useLazyViewport,
        physics: useLazyViewport
            ? const ClampingScrollPhysics()
            : const NeverScrollableScrollPhysics(),
        itemCount: items.length,
        itemBuilder: (context, index) {
          final item = items[index];
          return KeyedSubtree(
            key: ValueKey(stableId?.call(item) ?? index),
            child: itemBuilder(context, item, index),
          );
        },
        separatorBuilder: (context, index) {
          return Divider(
            height: 1,
            color: Theme.of(context).brightness == Brightness.dark
                ? AppColors.darkBorder
                : AppColors.border,
          );
        },
      ),
    );

    if (!useLazyViewport) {
      return list;
    }
    return SizedBox(height: _lazyViewportHeight, child: list);
  }
}
