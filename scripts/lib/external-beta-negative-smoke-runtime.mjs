import { Buffer } from 'node:buffer';

export function createExternalBetaNegativeSmokeRuntime({
  strictSemanticNegativeSmokeLabels,
  representativeSemanticNegativeSmokeLabels,
}) {
  // Read live sets on every decision, matching the legacy runner's closures.
  function negativeSmokeOptions(label) {
    return {
      contractSmokeArtifactOnly: !strictSemanticNegativeSmokeLabels.has(label),
    };
  }

  function shouldRunNegativeSmoke(label) {
    return (
      !strictSemanticNegativeSmokeLabels.has(label) ||
      representativeSemanticNegativeSmokeLabels.has(label)
    );
  }

  return { negativeSmokeOptions, shouldRunNegativeSmoke };
}

export function childProcessErrorOutput(error) {
  const chunks = [
    error.stdout,
    error.stderr,
    ...(Array.isArray(error.output) ? error.output : []),
    error.message,
  ];

  return chunks
    .filter((chunk) => chunk !== undefined && chunk !== null)
    .map((chunk) => Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk))
    .filter((chunk) => chunk.trim().length > 0)
    .join('\n');
}

export function smokeOutputSnippet(output) {
  return String(output)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(-8)
    .join(' | ');
}
