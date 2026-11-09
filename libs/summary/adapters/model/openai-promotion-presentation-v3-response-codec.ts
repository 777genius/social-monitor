import { record } from "./openai-promotion-presentation-v3-response-contract";

export const boundedResponseText = async (response: Response): Promise<string> => {
  const reader = response.body?.getReader();
  if (reader === undefined) throw new Error("V3 presentation response is missing");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 256 * 1024) {
        await reader.cancel();
        throw new Error("V3 presentation response exceeds 256 KiB");
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString("utf8");
};
export const outputText = (payload: Record<string, unknown>): string => {
  if (payload.status !== "completed" || !Array.isArray(payload.output)) {
    throw new Error("V3 presentation did not complete");
  }
  for (const item of payload.output) {
    const message = record(item);
    if (message.type !== "message" || !Array.isArray(message.content)) continue;
    for (const content of message.content) {
      const value = record(content);
      if (value.type === "output_text" && typeof value.text === "string") return value.text;
    }
  }
  throw new Error("V3 presentation output is missing");
};
