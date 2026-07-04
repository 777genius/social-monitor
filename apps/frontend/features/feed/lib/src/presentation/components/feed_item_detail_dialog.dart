import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/feed_item.dart';
import 'feed_item_detail_panel.dart';

class FeedItemDetailDialog extends StatelessWidget {
  const FeedItemDetailDialog({
    super.key,
    required this.item,
    required this.isLoading,
    required this.failure,
  });

  final FeedItem item;
  final bool isLoading;
  final AppFailure? failure;

  @override
  Widget build(BuildContext context) {
    final mediaSize = MediaQuery.sizeOf(context);
    final maxHeight = (mediaSize.height - 80).clamp(360.0, 860.0);
    final colorScheme = Theme.of(context).colorScheme;
    return Dialog(
      insetPadding: const EdgeInsets.all(AppSpacing.lg),
      backgroundColor: colorScheme.surface,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: 820, maxHeight: maxHeight),
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      'Post details',
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w900,
                        letterSpacing: 0,
                      ),
                    ),
                  ),
                  IconButton(
                    tooltip: 'Close post detail',
                    onPressed: () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.close_rounded),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.md),
              Flexible(
                child: SingleChildScrollView(
                  child: FeedItemDetailPanel(
                    item: item,
                    isLoading: isLoading,
                    failure: failure,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
