import 'dart:async';

import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/summary_preference.dart';
import '../../domain/value_objects/summary_preference_format.dart';
import '../../domain/value_objects/summary_preference_tone.dart';
import '../stores/summary_preference_store.dart';
import 'summary_preference_form_controls.dart';

class SummaryPreferencePanel extends StatefulWidget {
  const SummaryPreferencePanel({super.key, required this.store});

  final SummaryPreferenceStore store;

  @override
  State<SummaryPreferencePanel> createState() => _SummaryPreferencePanelState();
}

class _SummaryPreferencePanelState extends State<SummaryPreferencePanel> {
  late final TextEditingController _promptController;
  String _lastPromptFromStore = '';
  bool _syncingPrompt = false;

  @override
  void initState() {
    super.initState();
    _lastPromptFromStore = widget.store.customInstructions;
    _promptController = TextEditingController(text: _lastPromptFromStore);
    _promptController.addListener(_handlePromptChanged);
  }

  @override
  void didUpdateWidget(SummaryPreferencePanel oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.store == widget.store) {
      return;
    }
    _syncPromptFromStore(force: true);
  }

  @override
  void dispose() {
    _promptController
      ..removeListener(_handlePromptChanged)
      ..dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: widget.store,
      builder: (context, child) {
        _syncPromptFromStore();
        final store = widget.store;
        final state = store.state;
        final canShowControls = switch (state) {
          LoadingViewState<SummaryPreference>(:final previousValue)
              when previousValue == null =>
            false,
          FailureViewState<SummaryPreference>() => false,
          _ => true,
        };

        if (!canShowControls) {
          return SummaryPreferencePanelShell(
            title: 'Summary style',
            statusLabel: 'Loading',
            child: switch (state) {
              FailureViewState<SummaryPreference>(:final failure) =>
                AppInlineProblem(
                  title: 'Summary style unavailable',
                  message: failure.message,
                  tone: AppProblemTone.warning,
                  actionLabel: 'Retry',
                  onAction: () => unawaited(store.load()),
                ),
              _ => const Center(child: CircularProgressIndicator()),
            },
          );
        }

        return SummaryPreferencePanelShell(
          title: 'Summary style',
          statusLabel: _statusLabel(store),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Default shape for new summaries. Custom prompt is applied as user focus, while citation and safety rules stay fixed.',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                  height: 1.35,
                  letterSpacing: 0,
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              SummaryPreferenceSelector<SummaryPreferenceFormat>(
                label: 'Format',
                selected: store.format,
                segments: const [
                  ButtonSegment(
                    value: SummaryPreferenceFormat.executiveBrief,
                    icon: Icon(Icons.subject_outlined),
                    label: Text('Brief'),
                  ),
                  ButtonSegment(
                    value: SummaryPreferenceFormat.bulletDigest,
                    icon: Icon(Icons.format_list_bulleted_outlined),
                    label: Text('Bullets'),
                  ),
                  ButtonSegment(
                    value: SummaryPreferenceFormat.riskBrief,
                    icon: Icon(Icons.shield_outlined),
                    label: Text('Risk'),
                  ),
                ],
                onChanged: store.updateFormat,
              ),
              const SizedBox(height: AppSpacing.md),
              SummaryPreferenceSelector<SummaryPreferenceTone>(
                label: 'Tone',
                selected: store.tone,
                segments: const [
                  ButtonSegment(
                    value: SummaryPreferenceTone.analytical,
                    icon: Icon(Icons.insights_outlined),
                    label: Text('Analytical'),
                  ),
                  ButtonSegment(
                    value: SummaryPreferenceTone.concise,
                    icon: Icon(Icons.compress_outlined),
                    label: Text('Concise'),
                  ),
                  ButtonSegment(
                    value: SummaryPreferenceTone.neutral,
                    icon: Icon(Icons.balance_outlined),
                    label: Text('Neutral'),
                  ),
                ],
                onChanged: store.updateTone,
              ),
              const SizedBox(height: AppSpacing.sm),
              SummaryPreferenceSwitch(
                title: 'Include risks',
                subtitle: 'Keep caveats and weak-source warnings visible.',
                value: store.includeRisks,
                onChanged: store.updateIncludeRisks,
              ),
              SummaryPreferenceSwitch(
                title: 'Source highlights',
                subtitle: 'Mention why selected posts matter.',
                value: store.includeSourceHighlights,
                onChanged: store.updateIncludeSourceHighlights,
              ),
              const SizedBox(height: AppSpacing.sm),
              TextField(
                key: const ValueKey('settings-summary-custom-prompt-field'),
                controller: _promptController,
                onChanged: _handlePromptTextChanged,
                minLines: 3,
                maxLines: 6,
                maxLength: SummaryPreference.maxCustomInstructionsLength,
                decoration: const InputDecoration(
                  labelText: 'Custom prompt',
                  hintText:
                      'Prioritize agent workflows, pricing changes, weak claims and production-impact signals.',
                  alignLabelWithHint: true,
                  border: OutlineInputBorder(),
                ),
              ),
              SummaryPreferenceFooter(
                store: store,
                onSave: () => unawaited(_save(store)),
              ),
            ],
          ),
        );
      },
    );
  }

  void _handlePromptChanged() {
    _updatePromptDraft(_promptController.text);
  }

  void _handlePromptTextChanged(String value) {
    _updatePromptDraft(value);
  }

  void _updatePromptDraft(String value) {
    if (_syncingPrompt || widget.store.customInstructions == value) {
      return;
    }
    _lastPromptFromStore = value;
    widget.store.updateCustomInstructions(value);
  }

  void _syncPromptFromStore({bool force = false}) {
    final value = widget.store.customInstructions;
    if (!force && value == _lastPromptFromStore) {
      return;
    }
    _lastPromptFromStore = value;
    _syncingPrompt = true;
    _promptController.text = value;
    _promptController.selection = TextSelection.collapsed(offset: value.length);
    _syncingPrompt = false;
  }

  String _statusLabel(SummaryPreferenceStore store) {
    if (store.saveState is LoadingViewState<SummaryPreference>) {
      return 'Saving';
    }
    final preference = switch (store.state) {
      ReadyViewState<SummaryPreference>(:final value) => value,
      LoadingViewState<SummaryPreference>(:final previousValue) =>
        previousValue,
      _ => null,
    };
    return switch (preference?.source) {
      SummaryPreferenceSource.saved => 'Saved',
      SummaryPreferenceSource.none => 'Default',
      SummaryPreferenceSource.unknown => 'Custom',
      null => 'Draft',
    };
  }

  Future<void> _save(SummaryPreferenceStore store) async {
    final prompt = _promptController.text;
    if (store.customInstructions != prompt) {
      _lastPromptFromStore = prompt;
      store.updateCustomInstructions(prompt);
    }
    await store.save();
  }
}
