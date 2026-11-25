/**
 * Collects --job and --jobs values in argument order without deduplicating them.
 * Reports missing values but keeps scanning; job-ID validation belongs to the runner.
 * @param {string[]} argv
 * @returns {{jobIds: string[], errors: string[]}}
 */
export function readSelectedJobSelection(argv) {
  const jobIds = [];
  const errors = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--job') {
      const value = argv[index + 1];
      if (isMissingSelectionValue(value)) {
        errors.push('--job requires a non-empty job id value');
        continue;
      }
      jobIds.push(value.trim());
      index += 1;
    } else if (argv[index] === '--jobs') {
      const value = argv[index + 1];
      if (isMissingSelectionValue(value)) {
        errors.push('--jobs requires a non-empty comma-separated job id list');
        continue;
      }
      const values = value.split(',').map((jobId) => jobId.trim()).filter(Boolean);
      if (values.length === 0) {
        errors.push('--jobs requires at least one job id');
        continue;
      }
      jobIds.push(...values);
      index += 1;
    }
  }
  return { jobIds, errors };
}

/**
 * Collects --env-file values without validating or opening their paths.
 * The runner performs path and security checks after this selection step.
 * @param {string[]} argv
 * @returns {{paths: string[], errors: string[]}}
 */
export function readEnvFileSelection(argv) {
  const paths = [];
  const errors = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== '--env-file') {
      continue;
    }

    const value = argv[index + 1];
    if (isMissingSelectionValue(value)) {
      errors.push('--env-file requires a non-empty absolute env file path');
      continue;
    }
    paths.push(value.trim());
    index += 1;
  }

  return { paths, errors };
}

/**
 * Recognizes absent, blank and following-option tokens as missing values.
 * @param {string | undefined} value
 * @returns {boolean}
 */
function isMissingSelectionValue(value) {
  return value === undefined || value.trim() === '' || value.startsWith('--');
}
