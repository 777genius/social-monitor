export const sameOrderedValues = (
  left: readonly string[],
  right: readonly string[],
): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);

export const sameProviderMetrics = (
  left: readonly { readonly label: string; readonly value: string }[],
  right: readonly { readonly label: string; readonly value: string }[],
): boolean =>
  left.length === right.length &&
  left.every(
    (metric, index) =>
      metric.label.trim() === right[index]?.label &&
      metric.value.trim() === right[index]?.value,
  );
