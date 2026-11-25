import 'dart:async';

import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

import '../components/interest_coverage_plan_panel.dart';
import '../components/source_bindings_layout.dart';
import '../components/source_provider_status_panel.dart';
import '../stores/interest_coverage_plan_store.dart';
import '../stores/scan_policy_store.dart';
import '../stores/scan_run_store.dart';
import '../stores/source_bindings_store.dart';

class SourceBindingsPage extends StatefulWidget {
  const SourceBindingsPage({
    super.key,
    required this.store,
    required this.interestCoveragePlanStore,
    required this.policyStore,
    required this.scanRunStore,
    this.autoload = true,
  });

  final SourceBindingsStore store;
  final InterestCoveragePlanStore interestCoveragePlanStore;
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
    await Future.wait([
      widget.store.load(),
      widget.interestCoveragePlanStore.plan(),
    ]);
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
                  eyebrow: 'Interest sources',
                  title: 'Sources for ${widget.store.interestTitle}',
                  description:
                      'Only sources for ${widget.store.interestTitle} are shown here. Apply a recommended source or bind one manually.',
                  trailing: AppCommandBar(
                    actions: [
                      AppCommandAction(
                        label: 'Bind manually',
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
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      InterestCoveragePlanPanel(
                        store: widget.interestCoveragePlanStore,
                        bindingsStore: widget.store,
                      ),
                      const SizedBox(height: AppSpacing.md),
                      SourceProviderStatusPanel(
                        state: widget.store.overviewState,
                      ),
                      SourceBindingsLayout(
                        store: widget.store,
                        policyStore: widget.policyStore,
                        scanRunStore: widget.scanRunStore,
                      ),
                    ],
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
