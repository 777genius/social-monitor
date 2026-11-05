import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

class FeedSourceLink extends StatelessWidget {
  const FeedSourceLink({
    super.key,
    required this.providerKey,
    required this.canonicalUrl,
    this.onOpenSource,
  });

  final String providerKey;
  final String canonicalUrl;
  final Future<bool> Function(Uri)? onOpenSource;

  @override
  Widget build(BuildContext context) {
    final uri = sourceBrowserUri(canonicalUrl, providerKey: providerKey);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        AppInlineProblem(
          title: 'Source link',
          message: uri?.toString() ?? 'Source link unavailable',
          tone: AppProblemTone.neutral,
          actionLabel: uri == null ? null : 'Copy URL',
          onAction: uri == null
              ? null
              : () => unawaited(
                  Clipboard.setData(ClipboardData(text: uri.toString())),
                ),
        ),
        if (uri != null && onOpenSource != null) ...[
          const SizedBox(height: AppSpacing.sm),
          AppButton(
            controlKeyBase: 'feed-open-source',
            label: providerKey == 'telegram'
                ? 'Open Telegram web preview'
                : 'Open source',
            icon: Icons.open_in_new,
            onPressed: () => unawaited(_open(context, uri)),
          ),
        ],
      ],
    );
  }

  Future<void> _open(BuildContext context, Uri uri) async {
    var opened = false;
    try {
      opened = await onOpenSource!(uri);
    } on Exception {
      // Keep the copy action available if the browser rejects the new tab.
    }
    if (!opened && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Could not open source. Use Copy URL to open it in your browser.',
          ),
        ),
      );
    }
  }
}
