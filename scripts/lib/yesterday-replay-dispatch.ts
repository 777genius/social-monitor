// Stored reports validate historical artifacts only. Fresh evaluation is a
// separate callback so artifact validation cannot fall through into acquisition.
export async function dispatchYesterdayReplay(
  argv: readonly string[],
  actions: {
    readonly validateArtifact: () => void;
    readonly freshSelection: () => Promise<void>;
  },
): Promise<void> {
  if (argv.includes("--artifact-only")) {
    if (argv.some((arg) => ["--fresh-selection", "--update", "--allow-dirty-collection"].includes(arg))) {
      throw new Error("--artifact-only cannot be combined with --fresh-selection, --update or --allow-dirty-collection");
    }
    actions.validateArtifact();
    return;
  }

  // The fresh callback retains its fail-closed configured-interest guard.
  await actions.freshSelection();
}
