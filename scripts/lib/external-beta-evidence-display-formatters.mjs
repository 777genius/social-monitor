export function createExternalBetaDisplayFormatters({ contract, inputMatrix }) {
  return {
    formatOutputArtifacts, formatRequiredEnvAlternatives, formatHandoffArtifacts,
    handoffAction, handoffRunner, artifactExamplePathByFormat, inputMetadataByEnv,
  };

  function formatOutputArtifacts(job) {
    return job.outputArtifacts
      .map((artifact) => {
        const location = artifact.path ?? `<env:${artifact.env}>`;
        return `${location} (${artifact.format})`;
      })
      .join(', ');
  }

  function formatRequiredEnvAlternatives(job) {
    const alternatives = job.requiredEnvAlternatives ?? [];
    if (alternatives.length === 0) {
      return 'none';
    }

    return alternatives
      .map((alternative) => {
        const label = typeof alternative.label === 'string' && alternative.label.trim().length > 0
          ? `${alternative.label}: `
          : '';
        const env = (alternative.env ?? []).join(' + ');
        const coversEnv = (alternative.coversEnv ?? []).join(' + ');
        return coversEnv.length > 0 ? `${label}${env} covers ${coversEnv}` : `${label}${env}`;
      })
      .join(' | ');
  }

  function formatHandoffArtifacts(job) {
    return job.outputArtifacts
      .map((artifact) => {
        const location = artifact.path ?? `<env:${artifact.env}>`;
        const examplePath = artifactExamplePathByFormat().get(artifact.format);
        const example = examplePath === undefined ? 'no example registered' : `example: ${examplePath}`;
        return `${location} (${artifact.format}; ${example})`;
      })
      .join(', ');
  }

  function handoffAction(job) {
    if (typeof job.operatorAction === 'string' && job.operatorAction.trim().length > 0) {
      return job.operatorAction;
    }
    if (job.runPolicy === 'local_contract') {
      return `run validators: ${job.validationCommands.join(' && ')}`;
    }
    if (job.runPolicy === 'live_command') {
      return `set required env, run ${job.runnerCommand}, then run ${contract.artifactValidationCommand} -- --job ${job.jobId}`;
    }
    return `collect real redacted artifact files, set artifact path env, then run ${contract.artifactValidationCommand} -- --job ${job.jobId}`;
  }

  function handoffRunner(job) {
    if (typeof job.runnerDescription === 'string' && job.runnerDescription.trim().length > 0) {
      return job.runnerDescription;
    }
    if (job.runnerCommand !== null) {
      return job.runnerCommand;
    }
    if (job.runPolicy === 'local_contract') {
      return 'validators only';
    }
    return 'manual evidence collection, then artifact validation';
  }

  function artifactExamplePathByFormat() {
    return new Map((contract.artifactExamples ?? []).map((example) => [example.format, example.path]));
  }

  function inputMetadataByEnv() {
    const metadata = new Map();
    for (const inputClass of inputMatrix.inputClasses ?? []) {
      for (const envName of inputClass.env ?? []) {
        metadata.set(envName, {
          inputClass: inputClass.inputClass,
          description: inputClass.description,
        });
      }
    }
    return metadata;
  }

}
