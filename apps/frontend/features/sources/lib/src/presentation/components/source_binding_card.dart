import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

import '../../domain/entities/source_binding.dart';
import '../formatters/source_binding_display_formatters.dart';

class SourceBindingCard extends StatelessWidget {
  const SourceBindingCard({
    super.key,
    required this.binding,
    required this.selected,
    required this.onTap,
  });

  final SourceBinding binding;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: colorScheme.surface,
        border: Border.all(
          color: selected ? colorScheme.primary : colorScheme.outlineVariant,
        ),
        borderRadius: BorderRadius.circular(8),
      ),
      child: ListTile(
        selected: selected,
        leading: Icon(sourceBindingProviderIcon(binding.providerKey)),
        title: Text(sourceBindingTitle(binding)),
        subtitle: Text(sourceBindingPreview(binding)),
        trailing: AppStatusBadge(
          label: sourceBindingStatusLabel(binding.status),
          tone: sourceBindingStatusTone(binding.status),
        ),
        onTap: onTap,
      ),
    );
  }
}
