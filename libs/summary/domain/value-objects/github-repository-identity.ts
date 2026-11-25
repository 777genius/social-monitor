export const normalizedGitHubRepositoryIdentity = (
  value: string | undefined,
): string | undefined => {
  const trimmed = value?.trim();
  if (trimmed === undefined || trimmed.length === 0) {
    return undefined;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname.toLocaleLowerCase("en-US") !== "github.com") {
      return undefined;
    }
    const [owner, rawRepository] = parsed.pathname
      .split("/")
      .filter((segment) => segment.length > 0);
    const repository = rawRepository?.replace(/\.git$/iu, "");

    return normalizeGitHubRepositoryFullName(
      owner === undefined || repository === undefined
        ? undefined
        : `${owner}/${repository}`,
    );
  } catch {
    return undefined;
  }
};

export const normalizeGitHubRepositoryFullName = (
  value: string | undefined,
): string | undefined => {
  const match = value?.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/u);
  return match === null ||
    match === undefined ||
    match[1] === "." ||
    match[1] === ".." ||
    match[2] === "." ||
    match[2] === ".."
    ? undefined
    : `${match[1]}/${match[2]}`.toLocaleLowerCase("en-US");
};
