part of 'reader_summary_brief_surface.dart';

class _TopPostProviderTile extends StatelessWidget {
  const _TopPostProviderTile({required this.providerKey});

  final String providerKey;

  @override
  Widget build(BuildContext context) {
    final normalized = providerKey.trim().toLowerCase();
    final isDarkTile =
        normalized == 'x-twitter' ||
        normalized == 'twitter' ||
        normalized.startsWith('github');
    if (!isDarkTile) {
      return SizedBox.square(
        dimension: 34,
        child: Center(
          child: ReaderSummaryProviderLogo(providerKey: providerKey, size: 30),
        ),
      );
    }
    final theme = Theme.of(context);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: AppColors.chartInk,
        borderRadius: BorderRadius.circular(8),
      ),
      child: SizedBox.square(
        dimension: 34,
        child: Center(
          child: Theme(
            data: theme.copyWith(
              colorScheme: theme.colorScheme.copyWith(onSurface: Colors.white),
            ),
            child: ReaderSummaryProviderLogo(providerKey: providerKey),
          ),
        ),
      ),
    );
  }
}
