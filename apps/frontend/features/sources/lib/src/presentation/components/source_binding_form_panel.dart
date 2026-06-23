import 'dart:async';

import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/source_binding.dart';
import '../stores/source_bindings_store.dart';

class SourceBindingFormPanel extends StatelessWidget {
  const SourceBindingFormPanel({super.key, required this.store});

  final SourceBindingsStore store;

  @override
  Widget build(BuildContext context) {
    if (!store.isBindFormOpen &&
        store.mutationState is! FailureViewState<SourceBinding>) {
      return const SizedBox.shrink();
    }
    final failure = switch (store.mutationState) {
      FailureViewState<SourceBinding>(:final failure) => failure,
      _ => null,
    };
    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Bind source',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0,
                    ),
                  ),
                ),
                IconButton(
                  tooltip: 'Close bind source',
                  onPressed: store.closeBindForm,
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.sm),
            DropdownButtonFormField<String>(
              key: const ValueKey('source-binding-provider-field'),
              initialValue: store.providerKey,
              decoration: const InputDecoration(labelText: 'Provider'),
              items: const [
                DropdownMenuItem(value: 'reddit', child: Text('Reddit')),
                DropdownMenuItem(value: 'rss', child: Text('RSS')),
                DropdownMenuItem(
                  value: 'hacker-news',
                  child: Text('Hacker News'),
                ),
                DropdownMenuItem(value: 'github', child: Text('GitHub')),
              ],
              onChanged: (value) {
                if (value != null) {
                  store.updateProvider(value);
                }
              },
            ),
            const SizedBox(height: AppSpacing.sm),
            if (store.providerKey != 'rss' && store.providerKey != 'github')
              SegmentedButton<String>(
                key: const ValueKey('source-binding-mode-control'),
                segments: const [
                  ButtonSegment(value: 'search', label: Text('Search')),
                  ButtonSegment(value: 'listing', label: Text('Listing')),
                ],
                selected: {store.mode},
                onSelectionChanged: (values) => store.updateMode(values.first),
              ),
            if (store.providerKey == 'rss') ...[
              const SizedBox(height: AppSpacing.sm),
              _TextField(
                fieldKey: 'source-binding-feed-url-field',
                label: 'Feed URL',
                value: store.feedUrl,
                hint: 'https://example.com/feed.xml',
                onChanged: store.updateFeedUrl,
              ),
            ] else if (store.mode == 'listing') ...[
              if (store.providerKey == 'reddit') ...[
                const SizedBox(height: AppSpacing.sm),
                _TextField(
                  fieldKey: 'source-binding-subreddit-field',
                  label: 'Subreddit',
                  value: store.subreddit,
                  hint: 'startups',
                  onChanged: store.updateSubreddit,
                ),
              ],
              const SizedBox(height: AppSpacing.sm),
              DropdownButtonFormField<String>(
                key: const ValueKey('source-binding-listing-field'),
                initialValue: store.listing,
                decoration: const InputDecoration(labelText: 'Listing'),
                items: _listingItems(store.providerKey),
                onChanged: (value) {
                  if (value != null) {
                    store.updateListing(value);
                  }
                },
              ),
            ] else ...[
              const SizedBox(height: AppSpacing.sm),
              _TextField(
                fieldKey: 'source-binding-query-field',
                label: 'Search query',
                value: store.query,
                hint: 'competitor launch',
                onChanged: store.updateQuery,
              ),
            ],
            if (store.providerKey == 'reddit') ...[
              const SizedBox(height: AppSpacing.sm),
              const AppInlineProblem(
                title: 'Provider access',
                message: 'Uses platform Reddit app credential.',
                tone: AppProblemTone.neutral,
              ),
            ],
            if (failure != null) ...[
              const SizedBox(height: AppSpacing.sm),
              AppInlineProblem(
                title: 'Binding validation',
                message: failure.message,
                tone: AppProblemTone.warning,
              ),
            ],
            const SizedBox(height: AppSpacing.md),
            AppCommandBar(
              actions: [
                AppCommandAction(
                  label: 'Cancel',
                  icon: Icons.close,
                  controlKeyBase: 'source-binding-cancel-button',
                  variant: AppButtonVariant.secondary,
                  onPressed: store.closeBindForm,
                ),
                AppCommandAction(
                  label: 'Bind source',
                  icon: Icons.add_link,
                  controlKeyBase: 'source-binding-submit-button',
                  onPressed: store.bindSourceIntent.isEnabled
                      ? () => unawaited(store.bindSource())
                      : null,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _TextField extends StatelessWidget {
  const _TextField({
    required this.fieldKey,
    required this.label,
    required this.value,
    required this.hint,
    required this.onChanged,
  });

  final String fieldKey;
  final String label;
  final String value;
  final String hint;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return TextField(
      key: ValueKey(fieldKey),
      controller: TextEditingController(text: value)
        ..selection = TextSelection.collapsed(offset: value.length),
      decoration: InputDecoration(labelText: label, hintText: hint),
      onChanged: onChanged,
    );
  }
}

List<DropdownMenuItem<String>> _listingItems(String providerKey) {
  final values = providerKey == 'hacker-news'
      ? const ['top', 'new', 'best', 'ask', 'show', 'job']
      : const ['hot', 'new', 'top', 'rising'];
  return values
      .map((value) => DropdownMenuItem(value: value, child: Text(value)))
      .toList(growable: false);
}
