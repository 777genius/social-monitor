/** Report which evidence environment input mode the status command uses. */
export function statusEvidenceInputMode(options) {
  if (options.cleanEnv === true) {
    return 'clean_env';
  }
  if ((options.envFileCount ?? 0) > 0) {
    return 'env_file';
  }
  return 'shell_env';
}

/** Parse repeated --env-file arguments, retaining existing diagnostics and ordering. */
export function readStatusEnvFileSelection(argv) {
  const paths = [];
  const errors = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== '--env-file') {
      continue;
    }

    const value = argv[index + 1];
    if (value === undefined || value.trim() === '' || value.startsWith('--')) {
      errors.push('--env-file requires a non-empty absolute env file path');
      continue;
    }
    paths.push(value.trim());
    index += 1;
  }

  return { paths, errors };
}
