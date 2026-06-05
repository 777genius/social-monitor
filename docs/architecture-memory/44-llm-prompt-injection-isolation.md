# LLM Prompt Injection Isolation

Date: 2026-05-31
Status: baseline LLM safety memory

## Decision

Source content is untrusted data, never instructions.

Prompt injection cannot be perfectly eliminated, so architecture must limit consequences of compromised outputs.

References:

- OWASP Prompt Injection: https://owasp.org/www-community/attacks/PromptInjection
- OWASP LLM Top 10: https://owasp.org/www-project-top-10-for-large-language-model-applications
- NIST AI RMF Generative AI Profile: https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf
- OpenAI - Designing agents to resist prompt injection: https://openai.com/index/designing-agents-to-resist-prompt-injection/

## Prompt Structure

Separate:

```text
system/platform policy
developer product instructions
user summary rule configuration
source content as quoted/data payload
output schema
```

Do not concatenate raw source content into prompts without clear delimiters and instruction/data separation.

## No Dangerous Tool Use

Summary jobs should not have tools that can:

- send emails;
- modify subscriptions;
- delete data;
- trigger scans;
- spend budget;
- call arbitrary URLs;
- access connector credentials.

LLM output is data. Application code decides actions through deterministic rules.

## Output Validation

Required:

- JSON Schema validation;
- max length constraints;
- citation/source coverage check;
- unsafe URL/HTML sanitization;
- hallucination/factual consistency evals where possible;
- trust level assignment.

## Prompt Injection Signals

Detect/log suspicious source content patterns:

```text
ignore previous instructions
system prompt
developer message
reveal secret
exfiltrate
tool call
send email
delete
override rules
```

Do not rely on detection alone. Isolation and limited agency are primary.

## Locked Decisions

1. LLM output is never trusted as command authority.
2. Summary jobs have no destructive/external side-effect tools.
3. Prompt injection risk is reduced through isolation and limited agency.
4. Output schema validation is mandatory.
5. Detection is advisory; deterministic controls are primary.

