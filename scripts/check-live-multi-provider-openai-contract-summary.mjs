import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';

const fakeApiKey = 'openai-contract-test-key';
let requestCount = 0;

const server = createServer(async (request, response) => {
  try {
    if (request.method !== 'POST' || request.url !== '/v1/responses') {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { message: 'Not found' } }));
      return;
    }

    const authorization = request.headers.authorization;
    if (authorization !== `Bearer ${fakeApiKey}`) {
      response.writeHead(401, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { message: 'Unauthorized' } }));
      return;
    }

    requestCount += 1;
    const body = JSON.parse(await readRequestBody(request));
    const promptPayload = JSON.parse(String(body.input));
    const evidence = Array.isArray(promptPayload.evidence)
      ? promptPayload.evidence
      : [];
    if (evidence.length === 0) {
      throw new Error('OpenAI contract summary stub requires evidence');
    }

    const citationMap = evidence.map((item, index) => ({
      citationId: `c${index + 1}`,
      feedItemId: requiredString(item.feedItemId, `evidence[${index}].feedItemId`),
      sourceItemId: requiredString(item.sourceItemId, `evidence[${index}].sourceItemId`),
      providerKey: requiredString(item.providerKey, `evidence[${index}].providerKey`),
      field: 'title',
    }));
    const providers = [...new Set(citationMap.map((citation) => citation.providerKey))];
    const title = requiredString(evidence[0]?.title, 'evidence[0].title');

    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({
      output_text: JSON.stringify({
        headline: `Contract summary across ${providers.length} live providers`,
        executiveSummary: `OpenAI-compatible contract stub summarized ${evidence.length} selected live feed items. First signal: ${title}.`,
        keyPoints: [
          {
            claim: `Selected evidence covers ${providers.join(', ')}.`,
            citationIds: citationMap.map((citation) => citation.citationId),
          },
        ],
        risksAndUnknowns: [
          {
            description: 'This contract E2E uses a local OpenAI-compatible stub, not the external OpenAI service.',
            citationIds: [citationMap[0].citationId],
            reason: 'source_limit',
          },
        ],
        sourceHighlights: providers.map((provider) => `Cited live ${provider} evidence.`),
        citationMap,
        qualityFlags: [],
        confidence: {
          level: 'medium',
          score: 0.74,
          rationale: 'All claims cite selected evidence from the request payload.',
        },
        noSignalReason: null,
      }),
      usage: {
        input_tokens: 321,
        output_tokens: 123,
      },
    }));
  } catch (error) {
    response.writeHead(500, { 'content-type': 'application/json' });
    response.end(JSON.stringify({
      error: {
        message: error instanceof Error ? error.message : 'Unknown contract stub error',
      },
    }));
  }
});

await new Promise((resolve) => {
  server.listen(0, '127.0.0.1', resolve);
});

try {
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('OpenAI contract stub did not bind to a TCP port');
  }

  await runChecked('npm', ['run', 'check:live-multi-provider-summary'], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: {
      ...process.env,
      LIVE_MULTI_PROVIDER_SUMMARY_MODEL: 'openai-responses',
      OPENAI_API_KEY: fakeApiKey,
      OPENAI_RESPONSES_ENDPOINT_URL: `http://127.0.0.1:${address.port}/v1/responses`,
    },
  });

  if (requestCount !== 1) {
    throw new Error(`OpenAI contract stub expected one request, got ${requestCount}`);
  }

  console.log('Live multi-provider OpenAI contract summary E2E OK');
} finally {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve(undefined);
      }
    });
  });
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function runChecked(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options);
    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (code === 0) {
        resolve(undefined);
        return;
      }

      reject(new Error(
        signal === null
          ? `${command} ${args.join(' ')} failed with exit code ${code}`
          : `${command} ${args.join(' ')} failed with signal ${signal}`,
      ));
    });
  });
}

function requiredString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }

  return value;
}
