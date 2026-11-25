import 'package:flutter/material.dart';

import '../tokens/app_spacing.dart';
import 'app_button.dart';

class AppPaginationControls extends StatelessWidget {
  const AppPaginationControls({
    super.key,
    required this.hasMore,
    required this.isLoading,
    required this.onLoadMore,
    this.summary,
  });

  final bool hasMore;
  final bool isLoading;
  final VoidCallback? onLoadMore;
  final String? summary;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          if (summary != null)
            Flexible(
              child: Text(
                summary!,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodySmall,
              ),
            )
          else
            const SizedBox.shrink(),
          const SizedBox(width: AppSpacing.md),
          AppButton(
            label: isLoading
                ? 'Loading'
                : hasMore
                ? 'Load more'
                : 'All loaded',
            icon: Icons.expand_more,
            onPressed: hasMore && !isLoading ? onLoadMore : null,
            variant: AppButtonVariant.secondary,
          ),
        ],
      ),
    );
  }
}
