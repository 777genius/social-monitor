/** Validate triage field declarations, appending diagnostics to the caller-owned array. */
export function validateSafeDiagnosticFields(flow, contract, contractPath, violations) {
  if (!Array.isArray(flow.safeDiagnosticFields) || flow.safeDiagnosticFields.length === 0) {
    violations.push(`${contractPath}: flow "${flow.flowId}" must define safeDiagnosticFields`);
    return;
  }

  validateSafeDiagnosticFieldList(flow.safeDiagnosticFields, `${contractPath}: flow "${flow.flowId}"`, contract, violations);
}

/** Validate attached alert/panel field lists and coverage of required triage fields. */
export function validateDiagnosticFieldAttachment(fields, flow, label, contract, violations) {
  if (!Array.isArray(fields) || fields.length === 0) {
    violations.push(`${label} must define safeDiagnosticFields`);
    return;
  }

  validateSafeDiagnosticFieldList(fields, label, contract, violations);
  const attachedFields = new Set(fields);
  for (const field of flow.safeDiagnosticFields ?? []) {
    if (!attachedFields.has(field)) {
      violations.push(`${label} safeDiagnosticFields missing "${field}" from flow "${flow.flowId}"`);
    }
  }
}

/** Preserve diagnostic field formatting, forbidden substring matching and error order. */
function validateSafeDiagnosticFieldList(fields, label, contract, violations) {
  const forbidden = new Set(contract.forbiddenDiagnosticFields ?? []);

  for (const field of fields) {
    const normalized = String(field).toLowerCase();
    if (!/^[a-z0-9_]+$/.test(normalized)) {
      violations.push(`${label}: unsafe diagnostic field "${field}"`);
    }
    for (const forbiddenField of forbidden) {
      if (normalized.includes(String(forbiddenField).toLowerCase())) {
        violations.push(`${label}: contains forbidden diagnostic field "${field}"`);
      }
    }
  }
}

