import { existsSync, realpathSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

// A live environment reference preserves values loaded by --env-file after creation.
export function createExternalBetaDuplicateEvidencePaths({ contract, env }) {
  function duplicateEvidencePathViolations(candidateJobs) {
    return [...duplicateEvidencePathViolationsByJob(candidateJobs).values()].flat();
  }
  
  function duplicateEvidencePathViolationsByJob(candidateJobs) {
    const violationsByJob = new Map();
    if (contract.executionSafety?.evidencePathEnvForbidsDuplicatePaths !== true) {
      return violationsByJob;
    }
  
    const entriesByPath = new Map();
    for (const job of candidateJobs) {
      for (const artifact of job.outputArtifacts ?? []) {
        const envName = artifact.env;
        if (envName === undefined || !envName.endsWith('_PATH')) {
          continue;
        }
        const value = env[envName]?.trim();
        if (value === undefined || value === '') {
          continue;
        }
  
        const duplicateKey = evidencePathDuplicateKey(value);
        const entries = entriesByPath.get(duplicateKey) ?? [];
        entries.push({ jobId: job.jobId, envName });
        entriesByPath.set(duplicateKey, entries);
      }
    }
  
    for (const entries of entriesByPath.values()) {
      if (entries.length < 2) {
        continue;
      }
      for (const entry of entries) {
        const violations = violationsByJob.get(entry.jobId) ?? [];
        violations.push(`${entry.jobId}: evidence path env ${entry.envName} must not duplicate another evidence artifact path in this run`);
        violationsByJob.set(entry.jobId, violations);
      }
    }
  
    return violationsByJob;
  }
  
  function evidencePathDuplicateKey(path) {
    if (existsSync(path)) {
      try {
        return realpathSync(path);
      } catch {
        return resolve(path);
      }
    }
  
    const parentDirectory = dirname(path);
    try {
      return resolve(realpathSync(parentDirectory), basename(path));
    } catch {
      return resolve(path);
    }
  }

  return { duplicateEvidencePathViolations, duplicateEvidencePathViolationsByJob };
}
