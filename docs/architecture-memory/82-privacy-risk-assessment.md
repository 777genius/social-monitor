# Privacy Risk Assessment

Date: 2026-05-31
Status: baseline privacy risk memory

## Decision

Use lightweight privacy risk assessments for data-class or source changes that affect personal data, raw payloads, summaries, exports or retention.

References:

- NIST Privacy Framework: https://www.nist.gov/privacy-framework/privacy-framework
- GDPR Article 25 Data Protection by Design: https://gdpr-info.eu/art-25-gdpr/
- GDPR Article 17 Right to Erasure: https://gdpr-info.eu/art-17-gdpr/

## Assessment Triggers

Run privacy review when changing:

- raw payload retention;
- source policy behavior;
- user/tenant export;
- deletion/tombstone workflow;
- analytics events;
- support/admin access;
- AI summaries over personal data;
- media/transcript fetching;
- cross-region processing.

## Questions

For each change:

```text
what data is collected?
why is it needed?
who can access it?
how long is it retained?
is it exported?
is it used for AI?
can it be deleted?
does source policy permit it?
does it cross regions/providers?
what is user-visible?
```

## Data Minimization

Default:

- collect canonical fields needed for product value;
- keep raw payloads short-lived;
- avoid storing unnecessary author/profile details;
- do not store media bytes unless feature/policy requires.

## Locked Decisions

1. Privacy review is required for retention/export/raw payload changes.
2. Data minimization is default.
3. Raw payloads need explicit retention justification.
4. AI use of personal/source data is part of privacy review.
5. Region/provider transfer is part of privacy review.

