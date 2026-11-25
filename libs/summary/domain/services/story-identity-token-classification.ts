const broadStoryIdentityContextTokens = new Set([
  "analysis",
  "fix",
  "fixes",
  "flaw",
  "guide",
  "issue",
  "package",
  "patch",
  "release",
  "security",
  "tutorial",
  "update",
  "vulnerability",
  "vulnerabilities",
]);

export const isConcreteStoryIdentitySubjectToken = (
  value: string,
): boolean => !broadStoryIdentityContextTokens.has(value);
