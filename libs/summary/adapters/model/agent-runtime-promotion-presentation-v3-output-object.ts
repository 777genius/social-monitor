// Fail closed on non-object provider JSON, independently of request serialization.
// The downstream result policy owns proposal and schema admission.
export const parseObject = (value: string): Record<string, unknown> => {
  const parsed: unknown = JSON.parse(value);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Reader promotion presentation output is invalid");
  }
  return parsed as Record<string, unknown>;
};
