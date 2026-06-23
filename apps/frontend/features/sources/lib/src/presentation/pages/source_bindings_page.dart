import 'dart:async';

import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

import '../components/source_bindings_layout.dart';
import '../stores/scan_policy_store.dart';
import '../stores/scan_run_store.dart';
import '../stores/source_bindings_store.dart';

class SourceBindingsPage extends StatefulWidget {
  const SourceBindingsPage({
    super.key,
    required this.store,
    required this.policyStore,
    required this.scanRunStore,
    this.autoload = true,
  });

  final SourceBindingsStore store;
  final ScanPolicyStore policyStore;
  final ScanRunStore scanRunStore;
  final bool autoload;

  @override
  State<SourceBindingsPage> createState() => _SourceBindingsPageState();
}

class _SourceBindingsPageState extends State<SourceBindingsPage> {
  @override
  void initState() {
    super.initState();
    if (widget.autoload) {
      unawaited(_loadBindingsAndPolicy());
    }
  }

  Future<void> _loadBindingsAndPolicy() async {
    await widget.store.load();
    final selected = widget.store.selectedBinding;
    if (selected != null) {
      await widget.policyStore.loadFor(selected.id);
      widget.scanRunStore.bindTo(selected.id);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppPageSurface(
      child: AnimatedBuilder(
        animation: widget.store,
        builder: (context, child) {
          return CustomScrollView(
            slivers: [
              SliverToBoxAdapter(
                child: AppSectionHeader(
                  eyebrow: 'Topic sources',
                  title: 'Topic sources',
                  description:
                      '${widget.store.topicTitle}. Bind backend-supported providers and review health.',
                  trailing: AppCommandBar(
                    actions: [
                      AppCommandAction(
                        label: 'Bind source',
                        icon: Icons.add_link,
                        onPressed: widget.store.openBindForm,
                      ),
                    ],
                  ),
                ),
              ),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.only(top: AppSpacing.md),
                  child: SourceBindingsLayout(
                    store: widget.store,
                    policyStore: widget.policyStore,
                    scanRunStore: widget.scanRunStore,
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
