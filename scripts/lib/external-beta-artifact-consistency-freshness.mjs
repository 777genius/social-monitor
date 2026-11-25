export function createExternalBetaArtifactConsistencyFreshness({ contract, process, Date }) {
  function validateArtifactEnvConsistency(content, job, artifactEnv, violations) {
    for (const rule of artifactEnvConsistencyRules()) {
      if (shouldSkipArtifactEnvConsistencyRule(artifactEnv, rule)) {
        continue;
      }
      if (!(job.requiredEnv ?? []).includes(rule.envName) && !(job.optionalEnv ?? []).includes(rule.envName)) {
        continue;
      }

      const expected = process.env[rule.envName]?.trim();
      if (expected === undefined || expected === '') {
        continue;
      }

      const observedValues = observedArtifactStringValues(content, rule.paths);
      if (observedValues.length === 0) {
        continue;
      }

      for (const observed of observedValues) {
        if (observed !== expected) {
          violations.push(`${job.jobId}: output artifact env ${artifactEnv} ${rule.label} must match ${rule.envName}`);
        }
      }
    }
  }

  function shouldSkipArtifactEnvConsistencyRule(artifactEnv, rule) {
    return artifactEnv === 'REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH'
      && ['BACKEND_IMAGE_DIGEST', 'BACKEND_GIT_COMMIT_SHA'].includes(rule.envName);
  }

  function validateArtifactFreshness(content, job, artifactEnv, artifactFormat, violations) {
    const freshness = contract.artifactFreshness;
    if (typeof freshness !== 'object' || freshness === null) {
      return;
    }

    const timestampPaths = Array.isArray(freshness.timestampPaths) ? freshness.timestampPaths : [];
    const timestamps = observedArtifactTimestampValues(content, timestampPaths);
    const requiredTimestampFormats = new Set(freshness.requiredTimestampFormats ?? []);
    if (requiredTimestampFormats.has(artifactFormat) && timestamps.length === 0) {
      violations.push(`${job.jobId}: output artifact env ${artifactEnv} must include a release evidence timestamp`);
      return;
    }

    const maxAgeMs = Number(freshness.maxArtifactAgeHours) * 60 * 60 * 1000;
    const maxFutureSkewMs = Number(freshness.maxArtifactFutureSkewMinutes) * 60 * 1000;
    if (!Number.isFinite(maxAgeMs) || maxAgeMs <= 0 || !Number.isFinite(maxFutureSkewMs) || maxFutureSkewMs < 0) {
      violations.push(`${job.jobId}: artifact freshness policy is invalid`);
      return;
    }

    const now = Date.now();
    for (const timestamp of timestamps) {
      if (freshness.requiresIso8601Timestamp === true && !isIso8601Timestamp(timestamp.value)) {
        violations.push(`${job.jobId}: output artifact env ${artifactEnv} timestamp ${timestamp.path} must be ISO-8601`);
        continue;
      }
      const observedAtMs = Date.parse(timestamp.value);
      if (!Number.isFinite(observedAtMs)) {
        violations.push(`${job.jobId}: output artifact env ${artifactEnv} timestamp ${timestamp.path} must be ISO-8601`);
        continue;
      }
      if (observedAtMs > now + maxFutureSkewMs) {
        violations.push(`${job.jobId}: output artifact env ${artifactEnv} timestamp ${timestamp.path} must not be in the future`);
      }
      if (observedAtMs < now - maxAgeMs) {
        violations.push(`${job.jobId}: output artifact env ${artifactEnv} timestamp ${timestamp.path} is older than ${freshness.maxArtifactAgeHours} hours`);
      }
    }
  }

  function isIso8601Timestamp(value) {
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value);
  }

  function artifactEnvConsistencyRules() {
    return [
      {
        envName: 'STAGING_ENVIRONMENT_ID',
        label: 'environmentId',
        paths: [['environmentId'], ['environment', 'environmentId']],
      },
      {
        envName: 'SOURCE_LIVE_ENVIRONMENT_ID',
        label: 'environmentId',
        paths: [['environmentId'], ['environment', 'environmentId']],
      },
      {
        envName: 'BACKEND_IMAGE_DIGEST',
        label: 'imageDigest',
        paths: [['imageDigest'], ['environment', 'imageDigest']],
      },
      {
        envName: 'BACKEND_GIT_COMMIT_SHA',
        label: 'commitSha',
        paths: [['commitSha'], ['environment', 'commitSha']],
      },
      {
        envName: 'API_BASE_URL',
        label: 'apiBaseUrl',
        paths: [['apiBaseUrl'], ['environment', 'apiBaseUrl']],
      },
      {
        envName: 'SOURCE_LIVE_OPERATOR',
        label: 'operator',
        paths: [['operator'], ['environment', 'operator']],
      },
      {
        envName: 'STAGING_SECRET_STORE_ID',
        label: 'secretStoreId',
        paths: [['secretStoreId'], ['environment', 'secretStoreId']],
      },
    ];
  }

  function observedArtifactTimestampValues(content, paths) {
    const values = [];
    for (const path of paths) {
      const segments = String(path).split('.');
      let cursor = content;
      for (const segment of segments) {
        cursor = cursor?.[segment];
      }
      if (typeof cursor === 'string' && cursor.trim().length > 0) {
        values.push({ path, value: cursor.trim() });
      }
    }
    return values;
  }

  function observedArtifactStringValues(content, paths) {
    const values = [];
    for (const path of paths) {
      let cursor = content;
      for (const segment of path) {
        cursor = cursor?.[segment];
      }
      if (typeof cursor === 'string' && cursor.trim().length > 0) {
        values.push(cursor.trim());
      }
    }
    return [...new Set(values)];
  }

  return { validateArtifactEnvConsistency, validateArtifactFreshness };
}
