import 'package:flutter/material.dart';

import '../responsive/app_breakpoints.dart';
import '../tokens/app_colors.dart';
import '../tokens/app_spacing.dart';

class AppResponsiveSplitView extends StatelessWidget {
  const AppResponsiveSplitView({
    super.key,
    required this.list,
    this.detail,
    this.detailTitle,
    this.onCloseDetail,
  });

  final Widget list;
  final Widget? detail;
  final String? detailTitle;
  final VoidCallback? onCloseDetail;

  @override
  Widget build(BuildContext context) {
    final screen = AppScreenClass.of(context);
    if (screen.isCompact) {
      return detail == null
          ? list
          : _DetailPane(
              title: detailTitle,
              onClose: onCloseDetail,
              child: detail!,
            );
    }

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(flex: 5, child: list),
        const SizedBox(width: AppSpacing.lg),
        Expanded(
          flex: 4,
          child: detail == null
              ? const _NoSelectionPane()
              : _DetailPane(title: detailTitle, child: detail!),
        ),
      ],
    );
  }
}

class _DetailPane extends StatelessWidget {
  const _DetailPane({required this.child, this.title, this.onClose});

  final Widget child;
  final String? title;
  final VoidCallback? onClose;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        border: Border.all(
          color: Theme.of(context).brightness == Brightness.dark
              ? AppColors.darkBorder
              : AppColors.border,
        ),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (title != null || onClose != null) ...[
              Row(
                children: [
                  if (title != null)
                    Expanded(
                      child: Text(
                        title!,
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                    )
                  else
                    const Spacer(),
                  if (onClose != null)
                    IconButton(
                      tooltip: 'Close detail',
                      onPressed: onClose,
                      icon: const Icon(Icons.close),
                    ),
                ],
              ),
              const SizedBox(height: AppSpacing.md),
            ],
            child,
          ],
        ),
      ),
    );
  }
}

class _NoSelectionPane extends StatelessWidget {
  const _NoSelectionPane();

  @override
  Widget build(BuildContext context) {
    return const _DetailPane(
      title: 'No selection',
      child: Text('Select an item to review details.'),
    );
  }
}
