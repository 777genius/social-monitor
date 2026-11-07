/** Rank dangling Docker rows for read-only inspection, preserving order among ties. */
export function prioritizeDanglingRows({ rows, inspect }) {
  if (rows === undefined) {
    return undefined;
  }

  return rows
    .map((row, index) => ({
      row,
      index,
      priority: danglingSignalPriority(inspect(row).signals),
    }))
    .sort((left, right) => right.priority - left.priority || left.index - right.index)
    .map((candidate) => candidate.row);
}

/** Rank ownership/build marker signals in existing precedence order. */
export function danglingSignalPriority(signals) {
  if (signals.includes('social-monitor marker')) {
    return 50;
  }
  if (signals.includes('backend evidence marker')) {
    return 40;
  }
  if (signals.includes('backend build layer marker')) {
    return 30;
  }
  if (signals.includes('node build layer marker')) {
    return 20;
  }
  if (signals.includes('compose project label')) {
    return 10;
  }

  return 0;
}

/** Identify existing evidence and build markers in Docker inspection text. */
export function danglingObjectSignals(text) {
  const lowerText = text.toLowerCase();
  const signals = [];
  if (lowerText.includes('social-monitor')) {
    signals.push('social-monitor marker');
  }
  if (lowerText.includes('backend-evidence') || lowerText.includes('staging-evidence')) {
    signals.push('backend evidence marker');
  }
  if (lowerText.includes('com.docker.compose.project')) {
    signals.push('compose project label');
  }
  if (lowerText.includes('npm ci') || lowerText.includes('package-lock.json')) {
    signals.push('node build layer marker');
  }
  if (lowerText.includes('tsc -p tsconfig.build.json') || lowerText.includes('prisma generate')) {
    signals.push('backend build layer marker');
  }

  return signals.length > 0 ? signals : ['no obvious project marker'];
}

