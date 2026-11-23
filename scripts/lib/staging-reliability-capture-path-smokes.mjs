export function createStagingReliabilityCapturePathSmokes({
  violations, execFileSync, process, existsSync, resolve,
  dockerStagingReliabilityCapturePath, dockerDurableBackendE2eCapturePath,
}) {
  function validateCaptureOutputPathGuards() {
    const rabbitWorkspaceArtifactPath = resolve(
      "rabbitmq-staging-drill-workspace-output.json",
    );
    const rabbitResult = runDockerStagingCaptureExpectingFailure({
      RABBITMQ_STAGING_DRILL_ARTIFACT_PATH: rabbitWorkspaceArtifactPath,
      POSTGRES_RESTORE_DRILL_ARTIFACT_PATH:
        "/tmp/social-monitor-postgres-restore-drill-output.json",
      STAGING_RELIABILITY_ENV_PATH: "/tmp/social-monitor-staging-reliability.env",
    });
    if (rabbitResult.exitCode === 0) {
      violations.push(
        `${dockerStagingReliabilityCapturePath}: capture must reject workspace RABBITMQ_STAGING_DRILL_ARTIFACT_PATH`,
      );
    } else if (
      !rabbitResult.output.includes(
        "RABBITMQ_STAGING_DRILL_ARTIFACT_PATH must not write release evidence into the git workspace",
      )
    ) {
      violations.push(
        `${dockerStagingReliabilityCapturePath}: workspace RabbitMQ artifact path rejection must explain evidence path policy`,
      );
    }
    if (existsSync(rabbitWorkspaceArtifactPath)) {
      violations.push(
        `${dockerStagingReliabilityCapturePath}: workspace RabbitMQ artifact path rejection must not create ${rabbitWorkspaceArtifactPath}`,
      );
    }

    const postgresWorkspaceArtifactPath = resolve(
      "postgres-restore-drill-workspace-output.json",
    );
    const postgresResult = runDockerStagingCaptureExpectingFailure({
      RABBITMQ_STAGING_DRILL_ARTIFACT_PATH:
        "/tmp/social-monitor-rabbitmq-staging-drill-output.json",
      POSTGRES_RESTORE_DRILL_ARTIFACT_PATH: postgresWorkspaceArtifactPath,
      STAGING_RELIABILITY_ENV_PATH: "/tmp/social-monitor-staging-reliability.env",
    });
    if (postgresResult.exitCode === 0) {
      violations.push(
        `${dockerStagingReliabilityCapturePath}: capture must reject workspace POSTGRES_RESTORE_DRILL_ARTIFACT_PATH`,
      );
    } else if (
      !postgresResult.output.includes(
        "POSTGRES_RESTORE_DRILL_ARTIFACT_PATH must not write release evidence into the git workspace",
      )
    ) {
      violations.push(
        `${dockerStagingReliabilityCapturePath}: workspace Postgres artifact path rejection must explain evidence path policy`,
      );
    }
    if (existsSync(postgresWorkspaceArtifactPath)) {
      violations.push(
        `${dockerStagingReliabilityCapturePath}: workspace Postgres artifact path rejection must not create ${postgresWorkspaceArtifactPath}`,
      );
    }

    const durableBackendWorkspaceArtifactPath = resolve(
      "durable-backend-e2e-workspace-output.json",
    );
    const durableBackendResult = runDurableBackendE2eCaptureExpectingFailure({
      DURABLE_BACKEND_E2E_ARTIFACT_PATH: durableBackendWorkspaceArtifactPath,
      DURABLE_BACKEND_E2E_ENV_PATH: "/tmp/social-monitor-durable-backend-e2e.env",
    });
    if (durableBackendResult.exitCode === 0) {
      violations.push(
        `${dockerDurableBackendE2eCapturePath}: capture must reject workspace DURABLE_BACKEND_E2E_ARTIFACT_PATH`,
      );
    } else if (
      !durableBackendResult.output.includes(
        "DURABLE_BACKEND_E2E_ARTIFACT_PATH must not write release evidence into the git workspace",
      )
    ) {
      violations.push(
        `${dockerDurableBackendE2eCapturePath}: workspace durable backend E2E artifact path rejection must explain evidence path policy`,
      );
    }
    if (existsSync(durableBackendWorkspaceArtifactPath)) {
      violations.push(
        `${dockerDurableBackendE2eCapturePath}: workspace durable backend E2E artifact path rejection must not create ${durableBackendWorkspaceArtifactPath}`,
      );
    }
  }

  function runDockerStagingCaptureExpectingFailure(env) {
    try {
      execFileSync(process.execPath, [dockerStagingReliabilityCapturePath], {
        env: {
          ...process.env,
          ...env,
        },
        encoding: "utf8",
        stdio: "pipe",
      });
      return { exitCode: 0, output: "" };
    } catch (error) {
      return {
        exitCode: typeof error.status === "number" ? error.status : 1,
        output: `${error.stdout ?? ""}\n${error.stderr ?? ""}`,
      };
    }
  }

  function runDurableBackendE2eCaptureExpectingFailure(env) {
    try {
      execFileSync(process.execPath, [dockerDurableBackendE2eCapturePath], {
        env: {
          ...process.env,
          ...env,
        },
        encoding: "utf8",
        stdio: "pipe",
      });
      return { exitCode: 0, output: "" };
    } catch (error) {
      return {
        exitCode: typeof error.status === "number" ? error.status : 1,
        output: `${error.stdout ?? ""}\n${error.stderr ?? ""}`,
      };
    }
  }

  return { validateCaptureOutputPathGuards };
}
