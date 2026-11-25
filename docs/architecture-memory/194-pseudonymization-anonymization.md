# 194. Pseudonymization and Anonymization

## Status

Locked for privacy/data baseline.

## Research Anchors

- European Commission personal data explainer: https://commission.europa.eu/law/law-topic/data-protection/reform/what-personal-data_en
- EDPB pseudonymized vs anonymized data: https://www.edpb.europa.eu/sme-data-protection-guide/faq-frequently-asked-questions/answer/what-difference-between_en
- ICO anonymisation guidance: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-sharing/anonymisation/introduction-to-anonymisation/

## Decision

Treat pseudonymized data as personal data unless legal/privacy review concludes otherwise for a specific recipient and context. Anonymization must be irreversible in practice.

## Definitions

- Pseudonymization: identifiers are transformed, but re-identification is possible with additional information.
- Anonymization: re-identification is not reasonably possible and transformation is irreversible.

## Product Policy

Use pseudonymization for:

- analytics user/tenant references;
- support-safe identifiers;
- AI eval examples where full identity is not needed;
- logs/traces where correlation is needed.

Use anonymization only when:

- raw identifiers and link keys are removed;
- small-group re-identification risk is assessed;
- joins with retained data cannot identify people;
- utility/privacy tradeoff is documented.

## Key Controls

- Keep pseudonymization keys/salts separate.
- Rotate where appropriate.
- Restrict access to re-identification mapping.
- Document datasets that remain personal data.

## Best-Fact Choice

Hashing an identifier is not automatically anonymization. Assume pseudonymized telemetry remains regulated personal data until proven otherwise.

