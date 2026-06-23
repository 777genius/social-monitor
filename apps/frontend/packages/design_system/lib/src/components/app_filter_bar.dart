import 'package:flutter/material.dart';

import '../tokens/app_spacing.dart';
import 'app_button.dart';

class AppFilterBar extends StatelessWidget {
  const AppFilterBar({
    super.key,
    required this.searchValue,
    required this.onSearchChanged,
    this.placeholder = 'Search',
    this.filters = const [],
    this.onClear,
  });

  final String searchValue;
  final ValueChanged<String> onSearchChanged;
  final String placeholder;
  final List<AppFilterChipData> filters;
  final VoidCallback? onClear;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: AppSpacing.sm,
      runSpacing: AppSpacing.sm,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        SizedBox(
          width: 280,
          child: TextFormField(
            initialValue: searchValue,
            decoration: InputDecoration(
              hintText: placeholder,
              prefixIcon: const Icon(Icons.search),
              isDense: true,
            ),
            onChanged: onSearchChanged,
          ),
        ),
        for (final filter in filters)
          FilterChip(
            selected: filter.selected,
            label: Text(filter.label),
            onSelected: filter.onSelected,
          ),
        if (onClear != null)
          AppButton(
            label: 'Clear',
            icon: Icons.close,
            onPressed: onClear,
            variant: AppButtonVariant.text,
          ),
      ],
    );
  }
}

final class AppFilterChipData {
  const AppFilterChipData({
    required this.label,
    required this.selected,
    required this.onSelected,
  });

  final String label;
  final bool selected;
  final ValueChanged<bool> onSelected;
}
