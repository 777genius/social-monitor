export function assert(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) throw new Error(message);
}

export const assertThrows = (
  operation: () => unknown,
  message: string,
): void => {
  try {
    operation();
  } catch {
    return;
  }
  throw new Error(message);
};
