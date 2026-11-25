# 295 - Compliance Readiness Control Mapping

## Decision

Build evidence-ready controls from the start, mapping architecture artifacts to SOC 2, ISO 27001, NIST CSF and CSA CCM concepts.

Do not wait until an audit to discover missing evidence.

## Sources

- NIST Cybersecurity Framework 2.0: https://www.nist.gov/cyberframework
- ISO/IEC 27001 overview: https://www.iso.org/standard/27001
- CSA Cloud Controls Matrix: https://cloudsecurityalliance.org/research/cloud-controls-matrix/
- AICPA Trust Services Criteria: https://www.aicpa-cima.com/resources/landing/trust-services-criteria

## Target Frameworks

Likely future asks:

- SOC 2 Security
- SOC 2 Availability
- SOC 2 Confidentiality
- SOC 2 Privacy later
- ISO/IEC 27001 alignment
- CSA CCM for cloud customers
- NIST CSF as internal risk language

## Evidence Sources

Architecture memory should map to evidence:

- access reviews
- audit logs
- incident records
- change management
- CI/CD approvals
- vulnerability scans
- SBOM/provenance
- backup restore tests
- vendor reviews
- risk register
- data retention policies
- security training
- penetration test results

## Control Registry

Control record:

```text
control_id
framework_mappings
owner
policy_doc
implementation_ref
evidence_type
collection_frequency
last_collected_at
exceptions
```

## Early MVP Controls

Start with:

- MFA/SSO for admins
- least privilege access
- change review
- secret scanning
- vulnerability scanning
- backups/restore drill
- incident response process
- audit logging
- vendor register
- data classification

## Evidence Automation

Prefer automatic evidence:

- CI logs
- deployment records
- Git approvals
- cloud config snapshots
- access review exports
- alert history
- test reports

Manual screenshots are last resort.

## Architecture Rule

Compliance readiness is operational discipline.

Evidence should fall out of normal engineering workflow.
